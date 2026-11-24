using System.Net;
using Microsoft.EntityFrameworkCore;
using MovieTheater.Api.Contracts;
using MovieTheater.Api.Data;
using MovieTheater.Api.Domain;

namespace MovieTheater.Tests.Integration;

/// <summary>
/// Proves a seat can only be sold once per screening, even when many requests arrive at the same moment.
/// </summary>
public class DoubleBookingTests
{
    private const int Contenders = 12;

    [Fact]
    public async Task Concurrent_holds_on_one_seat_let_exactly_one_cart_win()
    {
        await using var app = new TestApp();
        var setup = app.CreateClient();
        var screening = await setup.GetUpcomingScreeningAsync();
        var seat = screening.AvailableSeat();
        var carts = await Task.WhenAll(Enumerable.Range(0, Contenders).Select(_ => setup.NewCartAsync()));

        // Every request waits on the same gate so they hit the server together.
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var attempts = carts.Select(async cart =>
        {
            var client = app.CreateClient();
            await gate.Task;
            return await client.HoldAsync(cart, screening.Screening.Id, seat.Id);
        }).ToList();
        gate.SetResult();
        var responses = await Task.WhenAll(attempts);

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.Equal(Contenders - 1, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        foreach (var conflict in responses.Where(r => r.StatusCode == HttpStatusCode.Conflict))
        {
            Assert.Equal("seat-unavailable", (await conflict.ReadProblemAsync()).GetProperty("code").GetString());
        }

        var holds = await app.WithDbAsync(db => db.SeatHolds.CountAsync(h => h.ScreeningId == screening.Screening.Id && h.SeatId == seat.Id));
        Assert.Equal(1, holds);
    }

    [Fact]
    public async Task Concurrent_customers_booking_the_same_seat_produce_exactly_one_order()
    {
        await using var app = new TestApp();
        var setup = app.CreateClient();
        var screening = await setup.GetUpcomingScreeningAsync();
        var seat = screening.AvailableSeat();

        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var customers = Enumerable.Range(0, Contenders).Select(async i =>
        {
            var client = app.CreateClient();
            var cart = await client.NewCartAsync();
            await gate.Task;

            var hold = await client.HoldAsync(cart, screening.Screening.Id, seat.Id);
            if (hold.StatusCode != HttpStatusCode.OK)
            {
                return (Hold: hold.StatusCode, Checkout: (HttpStatusCode?)null);
            }

            var checkout = await client.PostJsonAsync("/api/orders", new
            {
                cartToken = cart,
                customerName = $"Customer {i}",
                customerEmail = $"customer{i}@example.com",
                tickets = new[] { new { seatId = seat.Id, ticketType = "Adult" } },
            });
            return (Hold: hold.StatusCode, Checkout: (HttpStatusCode?)checkout.StatusCode);
        }).ToList();
        gate.SetResult();
        var results = await Task.WhenAll(customers);

        Assert.Equal(1, results.Count(r => r.Checkout == HttpStatusCode.Created));
        Assert.Equal(Contenders - 1, results.Count(r => r.Hold == HttpStatusCode.Conflict));

        var activeTickets = await app.WithDbAsync(db =>
            db.Tickets.CountAsync(t => t.ScreeningId == screening.Screening.Id && t.SeatId == seat.Id && !t.IsCancelled));
        Assert.Equal(1, activeTickets);
    }

    [Fact]
    public async Task Repeated_checkout_of_one_cart_creates_one_order()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var seats = new[] { screening.AvailableSeat(skip: 0).Id, screening.AvailableSeat(skip: 1).Id };
        var cart = await client.NewCartAsync();
        foreach (var seatId in seats)
        {
            await client.HoldAsync(cart, screening.Screening.Id, seatId);
        }

        var body = new
        {
            cartToken = cart,
            customerName = "Double Clicker",
            customerEmail = "double.click@example.com",
            tickets = seats.Select(id => new { seatId = id, ticketType = "Adult" }).ToArray(),
        };

        // Five copies of the same checkout at once, like an impatient double click plus retries.
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var attempts = Enumerable.Range(0, 5).Select(async _ =>
        {
            var c = app.CreateClient();
            await gate.Task;
            return await c.PostJsonAsync("/api/orders", body);
        }).ToList();
        gate.SetResult();
        var responses = await Task.WhenAll(attempts);

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(4, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        var numbers = await Task.WhenAll(responses.Select(async r => (await r.ReadAsync<OrderDto>()).OrderNumber));
        Assert.Single(numbers.Distinct());

        Assert.Equal(1, await app.WithDbAsync(db => db.Orders.CountAsync(o => o.CartToken == cart)));
        Assert.Equal(2, await app.WithDbAsync(db => db.Tickets.CountAsync(t => t.Order!.CartToken == cart)));
    }

    [Fact]
    public async Task A_sold_seat_cannot_be_held()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var seat = screening.AvailableSeat();
        await client.BookAsync(screening.Screening.Id, [seat.Id]);

        var cart = await client.NewCartAsync();
        var response = await client.HoldAsync(cart, screening.Screening.Id, seat.Id);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("already been sold", (await response.ReadProblemAsync()).GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Checkout_without_holding_the_seats_is_rejected()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var held = screening.AvailableSeat(skip: 0);
        var notHeld = screening.AvailableSeat(skip: 1);
        var cart = await client.NewCartAsync();
        await client.HoldAsync(cart, screening.Screening.Id, held.Id);

        var response = await client.PostJsonAsync("/api/orders", new
        {
            cartToken = cart,
            customerName = "Seat Sneaker",
            customerEmail = "sneaker@example.com",
            tickets = new[] { new { seatId = held.Id, ticketType = "Adult" }, new { seatId = notHeld.Id, ticketType = "Adult" } },
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("cart-changed", (await response.ReadProblemAsync()).GetProperty("code").GetString());
    }

    /// <summary>
    /// Even if application code had a bug and skipped every check, the database itself refuses a
    /// second active ticket for the same seat and screening.
    /// </summary>
    [Fact]
    public async Task Database_unique_index_rejects_a_second_active_ticket()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var seat = screening.AvailableSeat();
        var existing = await client.BookAsync(screening.Screening.Id, [seat.Id]);

        var error = await Assert.ThrowsAsync<DbUpdateException>(() => app.WithDbAsync(async db =>
        {
            var order = await db.Orders.SingleAsync(o => o.OrderNumber == existing.OrderNumber);
            db.Tickets.Add(new Ticket
            {
                OrderId = order.Id,
                ScreeningId = screening.Screening.Id,
                SeatId = seat.Id,
                TicketType = TicketType.Adult,
                SeatType = SeatType.Standard,
                PriceCents = 1450,
                BasePriceCents = 1450,
            });
            return await db.SaveChangesAsync();
        }));

        Assert.True(TheaterDbContext.IsUniqueViolation(error));
    }

    [Fact]
    public async Task Database_allows_resale_after_the_old_ticket_is_cancelled()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var seat = screening.AvailableSeat();
        var existing = await client.BookAsync(screening.Screening.Id, [seat.Id]);

        var saved = await app.WithDbAsync(async db =>
        {
            var order = await db.Orders.Include(o => o.Tickets).SingleAsync(o => o.OrderNumber == existing.OrderNumber);
            order.Tickets.Single().IsCancelled = true;
            await db.SaveChangesAsync();

            db.Tickets.Add(new Ticket
            {
                OrderId = order.Id,
                ScreeningId = screening.Screening.Id,
                SeatId = seat.Id,
                TicketType = TicketType.Adult,
                SeatType = SeatType.Standard,
                PriceCents = 1450,
                BasePriceCents = 1450,
            });
            return await db.SaveChangesAsync();
        });

        Assert.Equal(1, saved);
    }

    [Fact]
    public async Task Database_unique_index_rejects_two_holds_on_one_seat()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var seat = screening.AvailableSeat();
        var cart = await client.NewCartAsync();
        await client.HoldAsync(cart, screening.Screening.Id, seat.Id);

        var error = await Assert.ThrowsAsync<DbUpdateException>(() => app.WithDbAsync(db =>
        {
            db.SeatHolds.Add(new SeatHold
            {
                CartToken = new string('b', 32),
                ScreeningId = screening.Screening.Id,
                SeatId = seat.Id,
                CreatedAtUtc = TestApp.StartTime.UtcDateTime,
                ExpiresAtUtc = TestApp.StartTime.UtcDateTime.AddMinutes(10),
            });
            return db.SaveChangesAsync();
        }));

        Assert.True(TheaterDbContext.IsUniqueViolation(error));
    }
}
