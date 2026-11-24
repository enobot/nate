using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MovieTheater.Api.Contracts;
using MovieTheater.Api.Data;
using MovieTheater.Api.Domain;
using MovieTheater.Api.Errors;
using MovieTheater.Api.Options;

namespace MovieTheater.Api.Services;

/// <summary>Admin management of movies and screenings, including the no-overlap rule.</summary>
public sealed class AdminCatalogService(
    TheaterDbContext db,
    TheaterClock clock,
    PriceCalculator pricing,
    IOptions<BookingOptions> booking)
{
    /// <summary>Screenings can be scheduled up to this far ahead.</summary>
    public const int MaxDaysAhead = 180;

    public async Task<IReadOnlyList<AdminMovieDto>> GetMoviesAsync(CancellationToken ct)
    {
        var now = clock.UtcNow;
        return await db.Movies
            .AsNoTracking()
            .OrderBy(m => m.Title)
            .Select(m => new AdminMovieDto(
                m.Id,
                m.Title,
                m.Tagline,
                m.Synopsis,
                m.Genre,
                m.Rating,
                m.RuntimeMinutes,
                m.PosterPalette,
                m.PosterMotif,
                m.IsActive,
                m.Screenings.Count(s => s.StartsAtUtc > now),
                m.Screenings.Count))
            .ToListAsync(ct);
    }

    public async Task<AdminMovieDto> CreateMovieAsync(MovieUpsertRequest request, CancellationToken ct)
    {
        var title = request.Title.Trim();
        if (await db.Movies.AnyAsync(m => m.Title == title, ct))
        {
            throw new ConflictException("duplicate-title", $"A movie called \"{title}\" already exists.");
        }

        var movie = new Movie
        {
            Title = title,
            Tagline = request.Tagline?.Trim() ?? "",
            Synopsis = request.Synopsis.Trim(),
            Genre = request.Genre.Trim(),
            Rating = request.Rating,
            RuntimeMinutes = request.RuntimeMinutes,
            PosterPalette = request.PosterPalette,
            PosterMotif = request.PosterMotif,
            IsActive = request.IsActive,
            CreatedAtUtc = clock.UtcNow,
        };
        db.Movies.Add(movie);
        await SaveWithTitleCheckAsync(title, ct);
        return (await GetMoviesAsync(ct)).First(m => m.Id == movie.Id);
    }

    public async Task<AdminMovieDto> UpdateMovieAsync(int id, MovieUpsertRequest request, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var movie = await db.Movies.FirstOrDefaultAsync(m => m.Id == id, ct)
            ?? throw new NotFoundException("Movie not found.");

        var title = request.Title.Trim();
        if (await db.Movies.AnyAsync(m => m.Id != id && m.Title == title, ct))
        {
            throw new ConflictException("duplicate-title", $"A movie called \"{title}\" already exists.");
        }

        if (request.RuntimeMinutes != movie.RuntimeMinutes)
        {
            // A longer runtime could make this movie's upcoming screenings run into the next show.
            var now = clock.UtcNow;
            var upcoming = await db.Screenings
                .AsNoTracking()
                .Where(s => s.MovieId == id && s.StartsAtUtc > now)
                .ToListAsync(ct);
            foreach (var screening in upcoming)
            {
                var conflict = await FindConflictAsync(screening.AuditoriumId, screening.StartsAtUtc, request.RuntimeMinutes, screening.Id, ct);
                if (conflict is not null)
                {
                    throw new ConflictException(
                        "screening-overlap",
                        $"A {request.RuntimeMinutes}-minute runtime would overlap \"{conflict.MovieTitle}\" at {Describe(clock.ToLocal(conflict.StartsAtUtc))}. Move that screening first.");
                }
            }
        }

        movie.Title = title;
        movie.Tagline = request.Tagline?.Trim() ?? "";
        movie.Synopsis = request.Synopsis.Trim();
        movie.Genre = request.Genre.Trim();
        movie.Rating = request.Rating;
        movie.RuntimeMinutes = request.RuntimeMinutes;
        movie.PosterPalette = request.PosterPalette;
        movie.PosterMotif = request.PosterMotif;
        movie.IsActive = request.IsActive;

        await SaveWithTitleCheckAsync(title, ct);
        await tx.CommitAsync(ct);
        return (await GetMoviesAsync(ct)).First(m => m.Id == id);
    }

    public async Task DeleteMovieAsync(int id, CancellationToken ct)
    {
        var movie = await db.Movies.FirstOrDefaultAsync(m => m.Id == id, ct)
            ?? throw new NotFoundException("Movie not found.");

        if (await db.Screenings.AnyAsync(s => s.MovieId == id, ct))
        {
            throw new ConflictException(
                "movie-has-screenings",
                "This movie has screenings, so it can't be deleted. Mark it inactive to hide it from customers.");
        }

        db.Movies.Remove(movie);
        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<AuditoriumDto>> GetAuditoriumsAsync(CancellationToken ct) =>
        await db.Auditoriums
            .AsNoTracking()
            .OrderBy(a => a.Name)
            .Select(a => new AuditoriumDto(a.Id, a.Name, a.RowCount, a.SeatsPerRow, a.Seats.Count))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<AdminScreeningDto>> GetScreeningsAsync(DateOnly? from, DateOnly? to, int? movieId, CancellationToken ct)
    {
        var start = from ?? clock.Today;
        var end = to ?? start.AddDays(6);
        if (end < start)
        {
            throw new BadRequestException("invalid-range", "The end date must be on or after the start date.");
        }

        if (end.DayNumber - start.DayNumber > 62)
        {
            throw new BadRequestException("invalid-range", "Choose a range of 62 days or less.");
        }

        var (startUtc, _) = clock.DayRangeUtc(start);
        var (_, endUtc) = clock.DayRangeUtc(end);
        var now = clock.UtcNow;

        var query = db.Screenings
            .AsNoTracking()
            .Where(s => s.StartsAtUtc >= startUtc && s.StartsAtUtc < endUtc);
        if (movieId is not null)
        {
            query = query.Where(s => s.MovieId == movieId);
        }

        var rows = await query
            .OrderBy(s => s.StartsAtUtc)
            .ThenBy(s => s.AuditoriumId)
            .Select(s => new
            {
                s.Id,
                s.MovieId,
                MovieTitle = s.Movie!.Title,
                s.Movie.RuntimeMinutes,
                s.AuditoriumId,
                AuditoriumName = s.Auditorium!.Name,
                Capacity = s.Auditorium.Seats.Count,
                s.StartsAtUtc,
                s.IsMatinee,
                TicketsSold = s.Tickets.Count(t => !t.IsCancelled),
                AnyTickets = s.Tickets.Any(),
                SeatsHeld = s.Holds.Count(h => h.ExpiresAtUtc > now),
            })
            .ToListAsync(ct);

        return rows
            .Select(r =>
            {
                var local = clock.ToLocal(r.StartsAtUtc);
                return new AdminScreeningDto(
                    r.Id,
                    r.MovieId,
                    r.MovieTitle,
                    r.AuditoriumId,
                    r.AuditoriumName,
                    r.StartsAtUtc,
                    local,
                    local.AddMinutes(r.RuntimeMinutes),
                    r.IsMatinee,
                    r.TicketsSold,
                    r.SeatsHeld,
                    r.Capacity,
                    r.AnyTickets,
                    r.StartsAtUtc <= now);
            })
            .ToList();
    }

    public async Task<AdminScreeningDto> CreateScreeningAsync(ScreeningUpsertRequest request, CancellationToken ct)
    {
        int id;
        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            var (movie, startUtc) = await ValidateScreeningAsync(request, existingId: null, ct);
            var screening = new Screening
            {
                MovieId = movie.Id,
                AuditoriumId = request.AuditoriumId,
                StartsAtUtc = startUtc,
                IsMatinee = pricing.IsMatinee(clock.ToLocal(startUtc)),
                CreatedAtUtc = clock.UtcNow,
            };
            db.Screenings.Add(screening);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            id = screening.Id;
        }

        return await GetScreeningDtoAsync(id, ct);
    }

    public async Task<AdminScreeningDto> UpdateScreeningAsync(int id, ScreeningUpsertRequest request, CancellationToken ct)
    {
        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            var screening = await db.Screenings.FirstOrDefaultAsync(s => s.Id == id, ct)
                ?? throw new NotFoundException("Screening not found.");

            await EnsureNoSalesAsync(id, "changed", ct);

            var (movie, startUtc) = await ValidateScreeningAsync(request, existingId: id, ct);
            screening.MovieId = movie.Id;
            screening.AuditoriumId = request.AuditoriumId;
            screening.StartsAtUtc = startUtc;
            screening.IsMatinee = pricing.IsMatinee(clock.ToLocal(startUtc));
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }

        return await GetScreeningDtoAsync(id, ct);
    }

    public async Task DeleteScreeningAsync(int id, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var screening = await db.Screenings.FirstOrDefaultAsync(s => s.Id == id, ct)
            ?? throw new NotFoundException("Screening not found.");

        await EnsureNoSalesAsync(id, "deleted", ct);

        db.Screenings.Remove(screening);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    private async Task EnsureNoSalesAsync(int screeningId, string verb, CancellationToken ct)
    {
        if (await db.Tickets.AnyAsync(t => t.ScreeningId == screeningId, ct))
        {
            throw new ConflictException(
                "screening-has-orders",
                $"This screening has orders, so it can't be {verb}. Cancel its reservations first if it must move.");
        }

        var now = clock.UtcNow;
        if (await db.SeatHolds.AnyAsync(h => h.ScreeningId == screeningId && h.ExpiresAtUtc > now, ct))
        {
            throw new ConflictException(
                "screening-has-holds",
                $"Customers are holding seats for this screening right now, so it can't be {verb}. Try again in a few minutes.");
        }
    }

    private async Task<(Movie Movie, DateTime StartUtc)> ValidateScreeningAsync(ScreeningUpsertRequest request, int? existingId, CancellationToken ct)
    {
        var movie = await db.Movies.AsNoTracking().FirstOrDefaultAsync(m => m.Id == request.MovieId, ct)
            ?? throw new NotFoundException("Movie not found.");
        var auditorium = await db.Auditoriums.AsNoTracking().FirstOrDefaultAsync(a => a.Id == request.AuditoriumId, ct)
            ?? throw new NotFoundException("Auditorium not found.");

        var startUtc = clock.ToUtc(request.StartsAtLocal!.Value);
        var now = clock.UtcNow;
        if (startUtc <= now)
        {
            throw new BadRequestException("start-in-past", "Screenings must start in the future.");
        }

        if (startUtc > now.AddDays(MaxDaysAhead))
        {
            throw new BadRequestException("start-too-far", $"Screenings can be scheduled up to {MaxDaysAhead} days ahead.");
        }

        var conflict = await FindConflictAsync(auditorium.Id, startUtc, movie.RuntimeMinutes, existingId, ct);
        if (conflict is not null)
        {
            var conflictEnd = ScreeningSchedule.BusyUntil(conflict.StartsAtUtc, conflict.RuntimeMinutes, booking.Value.CleaningBufferMinutes);
            throw new ConflictException(
                "screening-overlap",
                $"{auditorium.Name} is booked for \"{conflict.MovieTitle}\" from {Describe(clock.ToLocal(conflict.StartsAtUtc))} "
                + $"until {clock.ToLocal(conflictEnd).ToString("h:mm tt", CultureInfo.InvariantCulture)} "
                + $"(including the {booking.Value.CleaningBufferMinutes}-minute cleaning break).");
        }

        return (movie, startUtc);
    }

    private async Task<ScheduledSlot?> FindConflictAsync(int auditoriumId, DateTime startUtc, int runtimeMinutes, int? ignoreId, CancellationToken ct)
    {
        var buffer = booking.Value.CleaningBufferMinutes;
        var proposedEnd = ScreeningSchedule.BusyUntil(startUtc, runtimeMinutes, buffer);

        // No screening lasts a full day, so anything that could overlap starts within a day before.
        var windowStart = startUtc.AddDays(-1);

        var nearby = await db.Screenings
            .AsNoTracking()
            .Where(s => s.AuditoriumId == auditoriumId && s.StartsAtUtc > windowStart && s.StartsAtUtc < proposedEnd)
            .Select(s => new ScheduledSlot(s.Id, s.StartsAtUtc, s.Movie!.RuntimeMinutes, s.Movie.Title))
            .ToListAsync(ct);

        return ScreeningSchedule.FindConflict(startUtc, runtimeMinutes, nearby, buffer, ignoreId);
    }

    private async Task<AdminScreeningDto> GetScreeningDtoAsync(int id, CancellationToken ct)
    {
        var startsAt = await db.Screenings.Where(s => s.Id == id).Select(s => s.StartsAtUtc).FirstAsync(ct);
        var day = DateOnly.FromDateTime(clock.ToLocal(startsAt));
        return (await GetScreeningsAsync(day, day, null, ct)).First(s => s.Id == id);
    }

    private static string Describe(DateTime local) => local.ToString("ddd MMM d, h:mm tt", CultureInfo.InvariantCulture);

    private async Task SaveWithTitleCheckAsync(string title, CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (TheaterDbContext.IsUniqueViolation(ex))
        {
            throw new ConflictException("duplicate-title", $"A movie called \"{title}\" already exists.");
        }
    }
}
