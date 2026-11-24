using Microsoft.EntityFrameworkCore;
using MovieTheater.Api.Contracts;
using MovieTheater.Api.Data;
using MovieTheater.Api.Domain;
using MovieTheater.Api.Errors;

namespace MovieTheater.Api.Services;

/// <summary>Reservation search and the sales report for the admin dashboard. All numbers come from SQL queries.</summary>
public sealed class AdminOrderService(TheaterDbContext db, TheaterClock clock)
{
    public async Task<PagedResponse<AdminOrderSummaryDto>> SearchOrdersAsync(
        OrderStatus? status,
        int? screeningId,
        string? search,
        int page,
        int pageSize,
        CancellationToken ct)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = db.Orders.AsNoTracking();
        if (status is not null)
        {
            query = query.Where(o => o.Status == status);
        }

        if (screeningId is not null)
        {
            query = query.Where(o => o.ScreeningId == screeningId);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            if (term.Length > 100)
            {
                throw new BadRequestException("search-too-long", "Search text must be 100 characters or fewer.");
            }

            // Escape LIKE wildcards so the search text is matched literally.
            var pattern = "%" + term.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            query = query.Where(o =>
                EF.Functions.Like(o.OrderNumber, pattern, "\\")
                || EF.Functions.Like(o.CustomerEmail, pattern, "\\")
                || EF.Functions.Like(o.CustomerName, pattern, "\\"));
        }

        var total = await query.CountAsync(ct);
        var rows = await query
            .OrderByDescending(o => o.CreatedAtUtc)
            .ThenByDescending(o => o.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(o => new
            {
                o.OrderNumber,
                o.Status,
                o.CustomerName,
                o.CustomerEmail,
                o.ScreeningId,
                MovieTitle = o.Screening!.Movie!.Title,
                AuditoriumName = o.Screening.Auditorium!.Name,
                o.Screening.StartsAtUtc,
                TicketCount = o.Tickets.Count,
                o.TotalCents,
                o.CreatedAtUtc,
            })
            .ToListAsync(ct);

        var items = rows
            .Select(r => new AdminOrderSummaryDto(
                r.OrderNumber,
                r.Status,
                r.CustomerName,
                r.CustomerEmail,
                r.ScreeningId,
                r.MovieTitle,
                r.AuditoriumName,
                clock.ToLocal(r.StartsAtUtc),
                r.TicketCount,
                r.TotalCents,
                r.CreatedAtUtc))
            .ToList();

        return new PagedResponse<AdminOrderSummaryDto>(items, page, pageSize, total);
    }

    /// <summary>Sales for orders placed between two theater-local dates (inclusive).</summary>
    public async Task<SalesReportDto> GetSalesReportAsync(DateOnly? from, DateOnly? to, CancellationToken ct)
    {
        var end = to ?? clock.Today;
        var start = from ?? end.AddDays(-29);
        if (end < start)
        {
            throw new BadRequestException("invalid-range", "The end date must be on or after the start date.");
        }

        if (end.DayNumber - start.DayNumber > 366)
        {
            throw new BadRequestException("invalid-range", "Choose a range of one year or less.");
        }

        var (startUtc, _) = clock.DayRangeUtc(start);
        var (_, endUtc) = clock.DayRangeUtc(end);

        var inRange = db.Orders.AsNoTracking().Where(o => o.CreatedAtUtc >= startUtc && o.CreatedAtUtc < endUtc);
        var paid = inRange.Where(o => o.Status == OrderStatus.Paid);
        var cancelled = inRange.Where(o => o.Status == OrderStatus.Cancelled);

        var paidOrders = await paid.CountAsync(ct);
        var ticketRevenue = await paid.SumAsync(o => o.TicketSubtotalCents, ct);
        var concessionRevenue = await paid.SumAsync(o => o.ConcessionSubtotalCents, ct);
        var tax = await paid.SumAsync(o => o.TaxCents, ct);
        var gross = await paid.SumAsync(o => o.TotalCents, ct);
        var cancelledOrders = await cancelled.CountAsync(ct);
        var refunded = await cancelled.SumAsync(o => o.RefundedCents, ct);

        var activeTickets = db.Tickets
            .AsNoTracking()
            .Where(t => !t.IsCancelled && t.Order!.CreatedAtUtc >= startUtc && t.Order.CreatedAtUtc < endUtc);
        var ticketsSold = await activeTickets.CountAsync(ct);

        var byMovie = await activeTickets
            .GroupBy(t => new { t.Screening!.MovieId, t.Screening.Movie!.Title })
            .Select(g => new MovieSalesDto(g.Key.MovieId, g.Key.Title, g.Count(), g.Sum(t => t.PriceCents)))
            .ToListAsync(ct);

        var concessionTotals = await db.OrderConcessionLines
            .AsNoTracking()
            .Where(l => l.Order!.Status == OrderStatus.Paid && l.Order.CreatedAtUtc >= startUtc && l.Order.CreatedAtUtc < endUtc)
            .GroupBy(l => l.ConcessionItemId)
            .Select(g => new { ItemId = g.Key, Quantity = g.Sum(l => l.Quantity), Revenue = g.Sum(l => l.LineTotalCents) })
            .ToListAsync(ct);
        var itemNames = await db.ConcessionItems.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.Name, ct);

        var now = clock.UtcNow;
        var upcoming = await db.Screenings
            .AsNoTracking()
            .Where(s => s.StartsAtUtc > now)
            .OrderBy(s => s.StartsAtUtc)
            .Take(8)
            .Select(s => new
            {
                s.Id,
                MovieTitle = s.Movie!.Title,
                AuditoriumName = s.Auditorium!.Name,
                s.StartsAtUtc,
                TicketsSold = s.Tickets.Count(t => !t.IsCancelled),
                Capacity = s.Auditorium.Seats.Count,
            })
            .ToListAsync(ct);

        return new SalesReportDto(
            start,
            end,
            paidOrders,
            cancelledOrders,
            ticketsSold,
            ticketRevenue,
            concessionRevenue,
            tax,
            gross,
            refunded,
            byMovie.OrderByDescending(m => m.TicketRevenueCents).ThenBy(m => m.Title).ToList(),
            concessionTotals
                .Select(c => new ConcessionSalesDto(c.ItemId, itemNames.GetValueOrDefault(c.ItemId, "Unknown item"), c.Quantity, c.Revenue))
                .OrderByDescending(c => c.RevenueCents)
                .ToList(),
            upcoming
                .Select(u => new OccupancyDto(u.Id, u.MovieTitle, u.AuditoriumName, clock.ToLocal(u.StartsAtUtc), u.TicketsSold, u.Capacity))
                .ToList());
    }
}
