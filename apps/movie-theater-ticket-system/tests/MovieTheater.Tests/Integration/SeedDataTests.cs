using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using MovieTheater.Api.Data;
using MovieTheater.Api.Domain;
using MovieTheater.Api.Options;

namespace MovieTheater.Tests.Integration;

public class SeedDataTests
{
    [Fact]
    public async Task Seed_creates_the_documented_sample_data()
    {
        await using var app = new TestApp();
        _ = app.CreateClient();

        var counts = await app.WithDbAsync(async db => new
        {
            Movies = await db.Movies.CountAsync(),
            Auditoriums = await db.Auditoriums.CountAsync(),
            Seats = await db.Seats.CountAsync(),
            Screenings = await db.Screenings.CountAsync(),
            Concessions = await db.ConcessionItems.CountAsync(),
            Orders = await db.Orders.CountAsync(),
        });

        Assert.Equal(8, counts.Movies);
        Assert.Equal(3, counts.Auditoriums);
        Assert.Equal((8 * 14) + (7 * 12) + (5 * 8), counts.Seats);
        Assert.Equal(7 * 11, counts.Screenings);
        Assert.Equal(9, counts.Concessions);
        Assert.Equal(7, counts.Orders);
    }

    [Fact]
    public async Task Seeded_schedule_has_no_overlapping_screenings()
    {
        await using var app = new TestApp();
        _ = app.CreateClient();
        var buffer = app.Services.GetRequiredService<IOptions<BookingOptions>>().Value.CleaningBufferMinutes;

        var slots = await app.WithDbAsync(db => db.Screenings
            .Select(s => new { s.AuditoriumId, Slot = new ScheduledSlot(s.Id, s.StartsAtUtc, s.Movie!.RuntimeMinutes, s.Movie.Title) })
            .ToListAsync());

        foreach (var room in slots.GroupBy(s => s.AuditoriumId))
        {
            var list = room.Select(r => r.Slot).ToList();
            foreach (var slot in list)
            {
                Assert.Null(ScreeningSchedule.FindConflict(slot.StartsAtUtc, slot.RuntimeMinutes, list, buffer, slot.ScreeningId));
            }
        }
    }

    [Fact]
    public async Task Seeded_orders_follow_the_pricing_rules()
    {
        await using var app = new TestApp();
        _ = app.CreateClient();
        var pricing = app.Services.GetRequiredService<PriceCalculator>();

        var orders = await app.WithDbAsync(db => db.Orders
            .Include(o => o.Tickets)
            .Include(o => o.ConcessionLines)
            .Include(o => o.Screening)
            .ToListAsync());

        Assert.All(orders, o =>
        {
            Assert.All(o.Tickets, t => Assert.Equal(pricing.PriceTicket(t.TicketType, t.SeatType, o.Screening!.IsMatinee).PriceCents, t.PriceCents));
            Assert.Equal(o.Tickets.Sum(t => t.PriceCents), o.TicketSubtotalCents);
            Assert.Equal(o.ConcessionLines.Sum(l => l.LineTotalCents), o.ConcessionSubtotalCents);
            Assert.Equal(pricing.CalculateTax(o.ConcessionSubtotalCents), o.TaxCents);
            Assert.Equal(o.TicketSubtotalCents + o.ConcessionSubtotalCents + o.TaxCents, o.TotalCents);
        });
    }

    [Fact]
    public async Task Seeded_seat_types_match_the_layouts()
    {
        await using var app = new TestApp();
        _ = app.CreateClient();

        var byType = await app.WithDbAsync(db => db.Seats
            .GroupBy(s => new { s.Auditorium!.Name, s.SeatType })
            .Select(g => new { g.Key.Name, g.Key.SeatType, Count = g.Count() })
            .ToListAsync());

        int Count(string room, SeatType type) => byType.SingleOrDefault(x => x.Name == room && x.SeatType == type)?.Count ?? 0;
        Assert.Equal(4, Count("Auditorium 1", SeatType.Accessible));
        Assert.Equal(16, Count("Auditorium 1", SeatType.Premium));
        Assert.Equal(4, Count("Auditorium 2", SeatType.Accessible));
        Assert.Equal(8, Count("Auditorium 2", SeatType.Premium));
        Assert.Equal(2, Count("Auditorium 3", SeatType.Accessible));
        Assert.Equal(24, Count("Auditorium 3", SeatType.Premium));
    }

    [Fact]
    public async Task Restarting_keeps_existing_data_instead_of_reseeding()
    {
        string dbPath;
        string orderNumber;
        await using (var first = new TestApp())
        {
            var client = first.CreateClient();
            var screening = await client.GetUpcomingScreeningAsync();
            orderNumber = (await client.BookAsync(screening.Screening.Id, [screening.AvailableSeat().Id], email: "persist@example.com")).OrderNumber;
            dbPath = first.DatabasePath;

            // Start a second app instance on the same database file.
            await using var second = new TestApp(new() { ["ConnectionStrings:Theater"] = $"Data Source={dbPath}" });
            var again = second.CreateClient();
            var history = await (await again.PostJsonAsync("/api/orders/history", new { orderNumber, email = "persist@example.com" }))
                .ReadAsync<MovieTheater.Api.Contracts.OrderHistoryResponse>();
            Assert.Single(history.Orders);
            Assert.Equal(8, await second.WithDbAsync(db => db.Movies.CountAsync()));
        }
    }
}
