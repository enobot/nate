using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MovieTheater.Api.Contracts;
using MovieTheater.Api.Data;
using MovieTheater.Api.Domain;
using MovieTheater.Api.Errors;
using MovieTheater.Api.Options;

namespace MovieTheater.Api.Services;

/// <summary>Read-only queries for the public side: listings, showtimes, seat maps, prices.</summary>
public sealed class CatalogService(
    TheaterDbContext db,
    TheaterClock clock,
    IOptions<PricingOptions> pricing,
    IOptions<BookingOptions> booking)
{
    /// <summary>Customers can browse and book this many days ahead, starting today.</summary>
    public const int ScheduleDays = 7;

    public async Task<ShowtimesResponse> GetShowtimesAsync(DateOnly? date, CancellationToken ct)
    {
        var today = clock.Today;
        var dates = Enumerable.Range(0, ScheduleDays).Select(today.AddDays).ToList();
        var now = clock.UtcNow;

        // Without an explicit date, open on the first day that still has showtimes left, so an
        // evening visitor sees tomorrow instead of an empty "today". "Today" is the theater's day.
        var selected = date ?? await FirstDayWithShowtimesAsync(dates, now, ct) ?? today;
        if (selected < dates[0] || selected > dates[^1])
        {
            throw new BadRequestException(
                "date-out-of-range",
                $"Showtimes are listed from {dates[0]:yyyy-MM-dd} to {dates[^1]:yyyy-MM-dd}.");
        }

        var (startUtc, endUtc) = clock.DayRangeUtc(selected);

        var screenings = await db.Screenings
            .AsNoTracking()
            .Include(s => s.Movie)
            .Include(s => s.Auditorium)
            .Where(s => s.StartsAtUtc >= startUtc && s.StartsAtUtc < endUtc && s.StartsAtUtc > now && s.Movie!.IsActive)
            .OrderBy(s => s.StartsAtUtc)
            .ToListAsync(ct);

        var showtimes = await ToShowtimesAsync(screenings, ct);

        var movies = screenings
            .GroupBy(s => s.MovieId)
            .Select(g => new MovieShowtimesDto(
                ToDto(g.First().Movie!),
                showtimes.Where(st => st.MovieId == g.Key).ToList()))
            .OrderBy(m => m.Movie.Title)
            .ToList();

        return new ShowtimesResponse(selected, dates, movies);
    }

    public async Task<MovieDetailResponse> GetMovieAsync(int id, CancellationToken ct)
    {
        var movie = await db.Movies.AsNoTracking().FirstOrDefaultAsync(m => m.Id == id && m.IsActive, ct)
            ?? throw new NotFoundException("That movie is not showing.");

        var now = clock.UtcNow;
        var (_, lastDayEnd) = clock.DayRangeUtc(clock.Today.AddDays(ScheduleDays - 1));

        var screenings = await db.Screenings
            .AsNoTracking()
            .Include(s => s.Movie)
            .Include(s => s.Auditorium)
            .Where(s => s.MovieId == id && s.StartsAtUtc > now && s.StartsAtUtc < lastDayEnd)
            .OrderBy(s => s.StartsAtUtc)
            .ToListAsync(ct);

        return new MovieDetailResponse(ToDto(movie), await ToShowtimesAsync(screenings, ct));
    }

    public async Task<ScreeningDetailResponse> GetScreeningAsync(int id, CancellationToken ct)
    {
        var screening = await db.Screenings
            .AsNoTracking()
            .Include(s => s.Movie)
            .Include(s => s.Auditorium)
            .FirstOrDefaultAsync(s => s.Id == id, ct)
            ?? throw new NotFoundException("Screening not found.");

        var now = clock.UtcNow;
        var seats = await db.Seats
            .AsNoTracking()
            .Where(s => s.AuditoriumId == screening.AuditoriumId)
            .OrderBy(s => s.Row)
            .ThenBy(s => s.Number)
            .ToListAsync(ct);

        var sold = (await db.Tickets
                .Where(t => t.ScreeningId == id && !t.IsCancelled)
                .Select(t => t.SeatId)
                .ToListAsync(ct))
            .ToHashSet();

        var held = (await db.SeatHolds
                .Where(h => h.ScreeningId == id && h.ExpiresAtUtc > now)
                .Select(h => h.SeatId)
                .ToListAsync(ct))
            .ToHashSet();

        var seatDtos = seats
            .Select(s => new SeatDto(
                s.Id,
                s.Row,
                s.Number,
                s.Label,
                s.SeatType,
                sold.Contains(s.Id) ? SeatStatus.Sold : held.Contains(s.Id) ? SeatStatus.Held : SeatStatus.Available))
            .ToList();

        var auditorium = screening.Auditorium!;
        var layout = new AuditoriumLayoutDto(
            auditorium.Id,
            auditorium.Name,
            auditorium.RowCount,
            auditorium.SeatsPerRow,
            ParseAisles(auditorium.AisleAfter));

        var showtime = (await ToShowtimesAsync([screening], ct))[0];
        var salesOpen = screening.StartsAtUtc > now && screening.Movie!.IsActive;

        return new ScreeningDetailResponse(showtime, ToDto(screening.Movie!), layout, seatDtos, salesOpen, now);
    }

    public async Task<PricingInfoResponse> GetPricingAsync(CancellationToken ct)
    {
        var p = pricing.Value;
        var b = booking.Value;
        var concessions = await db.ConcessionItems
            .AsNoTracking()
            .Where(c => c.IsAvailable)
            .OrderBy(c => c.SortOrder)
            .Select(c => new ConcessionItemDto(c.Id, c.Name, c.Description, c.Category, c.PriceCents))
            .ToListAsync(ct);

        return new PricingInfoResponse(
            p.AdultCents,
            p.ChildCents,
            p.SeniorCents,
            p.MatineeDiscountCents,
            p.MatineeCutoffHour,
            p.PremiumSurchargeCents,
            p.SalesTaxRate,
            p.TaxTickets,
            b.HoldMinutes,
            b.MaxSeatsPerOrder,
            b.MaxConcessionQuantity,
            b.CancellationCutoffMinutes,
            concessions);
    }

    /// <summary>The theater-local date of the next screening that has not started, within the listed days.</summary>
    private async Task<DateOnly?> FirstDayWithShowtimesAsync(IReadOnlyList<DateOnly> dates, DateTime now, CancellationToken ct)
    {
        var (_, windowEndUtc) = clock.DayRangeUtc(dates[^1]);
        var next = await db.Screenings
            .AsNoTracking()
            .Where(s => s.StartsAtUtc > now && s.StartsAtUtc < windowEndUtc && s.Movie!.IsActive)
            .OrderBy(s => s.StartsAtUtc)
            .Select(s => new { s.StartsAtUtc })
            .FirstOrDefaultAsync(ct);

        return next is null ? null : DateOnly.FromDateTime(clock.ToLocal(next.StartsAtUtc));
    }

    public static MovieDto ToDto(Movie m) =>
        new(m.Id, m.Title, m.Tagline, m.Synopsis, m.Genre, m.Rating, m.RuntimeMinutes, m.PosterPalette, m.PosterMotif);

    public static IReadOnlyList<int> ParseAisles(string aisleAfter) =>
        aisleAfter
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(int.Parse)
            .ToList();

    private async Task<List<ShowtimeDto>> ToShowtimesAsync(IReadOnlyList<Screening> screenings, CancellationToken ct)
    {
        if (screenings.Count == 0)
        {
            return [];
        }

        var now = clock.UtcNow;
        var ids = screenings.Select(s => s.Id).ToList();
        var auditoriumIds = screenings.Select(s => s.AuditoriumId).Distinct().ToList();

        var capacity = await db.Seats
            .Where(s => auditoriumIds.Contains(s.AuditoriumId))
            .GroupBy(s => s.AuditoriumId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);

        var sold = await db.Tickets
            .Where(t => ids.Contains(t.ScreeningId) && !t.IsCancelled)
            .GroupBy(t => t.ScreeningId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);

        var held = await db.SeatHolds
            .Where(h => ids.Contains(h.ScreeningId) && h.ExpiresAtUtc > now)
            .GroupBy(h => h.ScreeningId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);

        return screenings
            .Select(s =>
            {
                var local = clock.ToLocal(s.StartsAtUtc);
                var cap = capacity.GetValueOrDefault(s.AuditoriumId);
                var taken = sold.GetValueOrDefault(s.Id) + held.GetValueOrDefault(s.Id);
                return new ShowtimeDto(
                    s.Id,
                    s.MovieId,
                    s.StartsAtUtc,
                    local,
                    local.AddMinutes(s.Movie!.RuntimeMinutes),
                    s.AuditoriumId,
                    s.Auditorium!.Name,
                    s.IsMatinee,
                    Math.Max(0, cap - taken),
                    cap);
            })
            .ToList();
    }
}
