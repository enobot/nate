using System.Net;
using Microsoft.EntityFrameworkCore;
using MovieTheater.Api.Contracts;
using MovieTheater.Api.Domain;

namespace MovieTheater.Tests.Integration;

public class BookingFlowTests
{
    [Fact]
    public async Task Browse_hold_quote_checkout_history_and_cancel()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        // Browse: today's listing has movies, and tomorrow's showtimes can be opened.
        var today = await client.GetJsonAsync<ShowtimesResponse>("/api/showtimes");
        Assert.Equal(7, today.Dates.Count);
        Assert.NotEmpty(today.Movies);
        Assert.All(today.Movies.SelectMany(m => m.Showtimes), s => Assert.True(s.StartsAtUtc > TestApp.StartTime.UtcDateTime));

        var screening = await client.GetUpcomingScreeningAsync();
        Assert.True(screening.SalesOpen);
        var premium = screening.AvailableSeat(SeatType.Premium);
        var standard = screening.AvailableSeat(SeatType.Standard);

        // Hold two seats.
        var cart = await client.NewCartAsync();
        Assert.Equal(HttpStatusCode.OK, (await client.HoldAsync(cart, screening.Screening.Id, premium.Id)).StatusCode);
        var holdResponse = await client.HoldAsync(cart, screening.Screening.Id, standard.Id);
        var held = await holdResponse.ReadAsync<CartResponse>();
        Assert.Equal(2, held.Holds.Count);
        Assert.Equal(screening.Screening.Id, held.ScreeningId);
        Assert.Equal(TestApp.StartTime.UtcDateTime.AddMinutes(10), held.ExpiresAtUtc);

        // Other viewers now see both seats as held.
        var map = await client.GetJsonAsync<ScreeningDetailResponse>($"/api/screenings/{screening.Screening.Id}");
        Assert.Equal(SeatStatus.Held, map.Seats.Single(s => s.Id == premium.Id).Status);
        Assert.Equal(SeatStatus.Held, map.Seats.Single(s => s.Id == standard.Id).Status);

        // Quote: prices are calculated by the server.
        var concessions = await client.GetJsonAsync<PricingInfoResponse>("/api/pricing");
        var popcorn = concessions.Concessions.Single(c => c.Name == "Popcorn (Large)");
        var ticketSelection = new object[]
        {
            new { seatId = premium.Id, ticketType = "Adult" },
            new { seatId = standard.Id, ticketType = "Child" },
        };
        var quoteResponse = await client.PostJsonAsync("/api/orders/quote", new
        {
            screeningId = screening.Screening.Id,
            tickets = ticketSelection,
            concessions = new[] { new { itemId = popcorn.Id, quantity = 2 } },
        });
        var quote = await quoteResponse.ReadAsync<OrderQuote>();
        var matinee = screening.Screening.IsMatinee ? 300 : 0;
        var expectedTickets = (1450 - matinee + 350) + (1050 - matinee);
        Assert.Equal(expectedTickets, quote.TicketSubtotalCents);
        Assert.Equal(1800, quote.ConcessionSubtotalCents);
        Assert.Equal(140, quote.TaxCents); // 7.75% of 18.00 = 1.395
        Assert.Equal(expectedTickets + 1800 + 140, quote.TotalCents);

        // Checkout (simulated payment).
        var checkoutResponse = await client.PostJsonAsync("/api/orders", new
        {
            cartToken = cart,
            customerName = "Avery Quinn",
            customerEmail = "Avery.Quinn@Example.com",
            tickets = ticketSelection,
            concessions = new[] { new { itemId = popcorn.Id, quantity = 2 } },
        });
        Assert.Equal(HttpStatusCode.Created, checkoutResponse.StatusCode);
        var order = await checkoutResponse.ReadAsync<OrderDto>();
        Assert.Equal(OrderStatus.Paid, order.Status);
        Assert.Matches("^MT-[0-9A-HJKMNP-TV-Z]{8}$", order.OrderNumber);
        Assert.StartsWith("SIM-", order.PaymentReference);
        Assert.Equal("avery.quinn@example.com", order.CustomerEmail);
        Assert.Equal(quote.TotalCents, order.TotalCents);
        Assert.Equal(2, order.Tickets.Count);
        Assert.True(order.CanCancel);

        // The cart is empty and the seats are sold.
        var emptyCart = await client.GetJsonAsync<CartResponse>($"/api/carts/{cart}");
        Assert.Empty(emptyCart.Holds);
        map = await client.GetJsonAsync<ScreeningDetailResponse>($"/api/screenings/{screening.Screening.Id}");
        Assert.Equal(SeatStatus.Sold, map.Seats.Single(s => s.Id == premium.Id).Status);

        // Order history lookup by order number + email (email case does not matter).
        var historyResponse = await client.PostJsonAsync("/api/orders/history", new { orderNumber = order.OrderNumber.ToLowerInvariant(), email = "AVERY.QUINN@example.com" });
        var history = await historyResponse.ReadAsync<OrderHistoryResponse>();
        Assert.Equal(order.OrderNumber, Assert.Single(history.Orders).OrderNumber);

        // Cancel: the order is refunded (simulated) and the seats are free again.
        var cancelResponse = await client.PostJsonAsync($"/api/orders/{order.OrderNumber}/cancel", new { email = "avery.quinn@example.com" });
        Assert.Equal(HttpStatusCode.OK, cancelResponse.StatusCode);
        var cancelled = await cancelResponse.ReadAsync<OrderDto>();
        Assert.Equal(OrderStatus.Cancelled, cancelled.Status);
        Assert.Equal(cancelled.TotalCents, cancelled.RefundedCents);
        Assert.Equal(CancellationSource.Customer, cancelled.CancelledBy);
        Assert.All(cancelled.Tickets, t => Assert.True(t.IsCancelled));
        Assert.False(cancelled.CanCancel);

        map = await client.GetJsonAsync<ScreeningDetailResponse>($"/api/screenings/{screening.Screening.Id}");
        Assert.Equal(SeatStatus.Available, map.Seats.Single(s => s.Id == premium.Id).Status);

        // A freed seat can be sold again; the old cancelled ticket stays as history.
        var resold = await client.BookAsync(screening.Screening.Id, [premium.Id], email: "someone.else@example.com");
        Assert.Equal(OrderStatus.Paid, resold.Status);
        var ticketRows = await app.WithDbAsync(db => db.Tickets.CountAsync(t => t.ScreeningId == screening.Screening.Id && t.SeatId == premium.Id));
        Assert.Equal(2, ticketRows);
    }

    [Fact]
    public async Task Order_history_returns_every_order_for_the_email()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();

        var first = await client.BookAsync(screening.Screening.Id, [screening.AvailableSeat(skip: 0).Id], email: "repeat@example.com");
        app.Time.Advance(TimeSpan.FromMinutes(1));
        var second = await client.BookAsync(screening.Screening.Id, [screening.AvailableSeat(skip: 1).Id], email: "repeat@example.com");
        await client.BookAsync(screening.Screening.Id, [screening.AvailableSeat(skip: 2).Id], email: "other@example.com");

        var response = await client.PostJsonAsync("/api/orders/history", new { orderNumber = first.OrderNumber, email = "repeat@example.com" });
        var history = await response.ReadAsync<OrderHistoryResponse>();

        Assert.Equal([second.OrderNumber, first.OrderNumber], history.Orders.Select(o => o.OrderNumber));
    }

    [Fact]
    public async Task Order_history_with_wrong_email_is_a_generic_404()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        var response = await client.PostJsonAsync("/api/orders/history", new { orderNumber = "MT-SEED0001", email = "not.the.owner@example.com" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = await response.ReadProblemAsync();
        Assert.Equal("not-found", problem.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Seeded_sample_order_can_be_looked_up()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        var response = await client.PostJsonAsync("/api/orders/history", new { orderNumber = "MT-SEED0001", email = "jordan.rivera@example.com" });

        var history = await response.ReadAsync<OrderHistoryResponse>();
        Assert.Contains(history.Orders, o => o.OrderNumber == "MT-SEED0001" && o.Status == OrderStatus.Paid);
        Assert.Contains(history.Orders, o => o.OrderNumber == "MT-SEED0004" && o.Status == OrderStatus.Cancelled);
    }

    [Fact]
    public async Task Prices_sent_by_the_client_are_ignored()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var seat = screening.AvailableSeat();
        var cart = await client.NewCartAsync();
        await client.HoldAsync(cart, screening.Screening.Id, seat.Id);

        var response = await client.PostJsonAsync("/api/orders", new
        {
            cartToken = cart,
            customerName = "Price Tester",
            customerEmail = "price.tester@example.com",
            totalCents = 1,
            tickets = new[] { new { seatId = seat.Id, ticketType = "Adult", priceCents = 1 } },
        });

        var order = await response.ReadAsync<OrderDto>();
        var expected = 1450 - (screening.Screening.IsMatinee ? 300 : 0);
        Assert.Equal(expected, order.TotalCents);
        Assert.Equal(expected, order.Tickets.Single().PriceCents);
    }

    [Fact]
    public async Task Simulated_decline_keeps_the_seats_held_and_creates_no_order()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var seat = screening.AvailableSeat();
        var cart = await client.NewCartAsync();
        await client.HoldAsync(cart, screening.Screening.Id, seat.Id);
        var body = new
        {
            cartToken = cart,
            customerName = "Decline Tester",
            customerEmail = "decline@example.com",
            tickets = new[] { new { seatId = seat.Id, ticketType = "Adult" } },
            simulateDecline = true,
        };

        var declined = await client.PostJsonAsync("/api/orders", body);

        Assert.Equal(HttpStatusCode.PaymentRequired, declined.StatusCode);
        Assert.Equal("payment-declined", (await declined.ReadProblemAsync()).GetProperty("code").GetString());
        Assert.Single((await client.GetJsonAsync<CartResponse>($"/api/carts/{cart}")).Holds);
        Assert.Equal(0, await app.WithDbAsync(db => db.Orders.CountAsync(o => o.CartToken == cart)));

        var retry = await client.PostJsonAsync("/api/orders", body with { simulateDecline = false });
        Assert.Equal(HttpStatusCode.Created, retry.StatusCode);
    }

    [Fact]
    public async Task Releasing_a_seat_makes_it_available_again()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var seat = screening.AvailableSeat();
        var cart = await client.NewCartAsync();
        await client.HoldAsync(cart, screening.Screening.Id, seat.Id);

        var release = await client.DeleteAsync($"/api/carts/{cart}/holds/{seat.Id}");

        Assert.Equal(HttpStatusCode.OK, release.StatusCode);
        Assert.Empty((await release.ReadAsync<CartResponse>()).Holds);
        var map = await client.GetJsonAsync<ScreeningDetailResponse>($"/api/screenings/{screening.Screening.Id}");
        Assert.Equal(SeatStatus.Available, map.Seats.Single(s => s.Id == seat.Id).Status);
    }

    [Fact]
    public async Task Clearing_a_cart_releases_all_its_seats()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var cart = await client.NewCartAsync();
        await client.HoldAsync(cart, screening.Screening.Id, screening.AvailableSeat(skip: 0).Id);
        await client.HoldAsync(cart, screening.Screening.Id, screening.AvailableSeat(skip: 1).Id);

        var clear = await client.DeleteAsync($"/api/carts/{cart}");

        Assert.Equal(HttpStatusCode.NoContent, clear.StatusCode);
        Assert.Equal(0, await app.WithDbAsync(db => db.SeatHolds.CountAsync(h => h.CartToken == cart)));
    }

    [Fact]
    public async Task A_cart_holds_seats_for_one_showtime_only()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var first = await client.GetUpcomingScreeningAsync(0);
        var second = await client.GetUpcomingScreeningAsync(1);
        var cart = await client.NewCartAsync();
        await client.HoldAsync(cart, first.Screening.Id, first.AvailableSeat().Id);

        var response = await client.HoldAsync(cart, second.Screening.Id, second.AvailableSeat().Id);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("cart-other-screening", (await response.ReadProblemAsync()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Seat_limit_per_order_is_enforced()
    {
        await using var app = new TestApp(new() { ["Booking:MaxSeatsPerOrder"] = "2" });
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var cart = await client.NewCartAsync();
        await client.HoldAsync(cart, screening.Screening.Id, screening.AvailableSeat(skip: 0).Id);
        await client.HoldAsync(cart, screening.Screening.Id, screening.AvailableSeat(skip: 1).Id);

        var third = await client.HoldAsync(cart, screening.Screening.Id, screening.AvailableSeat(skip: 2).Id);

        Assert.Equal(HttpStatusCode.Conflict, third.StatusCode);
        Assert.Equal("seat-limit", (await third.ReadProblemAsync()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Holding_the_same_seat_twice_in_one_cart_is_harmless()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var seat = screening.AvailableSeat();
        var cart = await client.NewCartAsync();

        await client.HoldAsync(cart, screening.Screening.Id, seat.Id);
        var again = await client.HoldAsync(cart, screening.Screening.Id, seat.Id);

        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Single((await again.ReadAsync<CartResponse>()).Holds);
    }

    [Fact]
    public async Task Ticket_sales_close_when_the_screening_starts()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var cart = await client.NewCartAsync();

        app.Time.SetUtcNow(new DateTimeOffset(screening.Screening.StartsAtUtc, TimeSpan.Zero));
        var response = await client.HoldAsync(cart, screening.Screening.Id, screening.AvailableSeat().Id);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("sales-closed", (await response.ReadProblemAsync()).GetProperty("code").GetString());
        var map = await client.GetJsonAsync<ScreeningDetailResponse>($"/api/screenings/{screening.Screening.Id}");
        Assert.False(map.SalesOpen);
    }

    [Fact]
    public async Task Unknown_api_route_returns_problem_json_404()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        var response = await client.GetAsync("/api/does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await response.ReadProblemAsync();
    }
}
