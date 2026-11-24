using System.Net;
using System.Text;
using System.Text.Json;

namespace MovieTheater.Tests.Integration;

/// <summary>Bad input gets a 400 ProblemDetails response with field errors, never a 500.</summary>
public class ValidationTests
{
    private static async Task<JsonElement> AssertValidationProblemAsync(HttpResponseMessage response, params string[] fields)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.ReadProblemAsync();
        Assert.Equal(400, problem.GetProperty("status").GetInt32());
        var errors = problem.GetProperty("errors");
        foreach (var field in fields)
        {
            Assert.True(
                errors.EnumerateObject().Any(e => e.Name.Equals(field, StringComparison.OrdinalIgnoreCase)),
                $"Expected an error for '{field}' but got: {errors}");
        }

        return problem;
    }

    [Fact]
    public async Task Checkout_requires_name_email_cart_and_tickets()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        var response = await client.PostJsonAsync("/api/orders", new
        {
            cartToken = "nope",
            customerName = "",
            customerEmail = "not-an-email",
            tickets = Array.Empty<object>(),
        });

        await AssertValidationProblemAsync(response, "CartToken", "CustomerName", "CustomerEmail", "Tickets");
    }

    [Fact]
    public async Task Unknown_ticket_type_is_rejected()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();

        var response = await client.PostJsonAsync("/api/orders/quote", new
        {
            screeningId = screening.Screening.Id,
            tickets = new[] { new { seatId = screening.AvailableSeat().Id, ticketType = "VIP" } },
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await response.ReadProblemAsync();
    }

    [Fact]
    public async Task Numeric_ticket_type_outside_the_enum_is_rejected()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();

        var response = await client.PostJsonAsync("/api/orders/quote", new
        {
            screeningId = screening.Screening.Id,
            tickets = new[] { new { seatId = screening.AvailableSeat().Id, ticketType = 42 } },
        });

        await AssertValidationProblemAsync(response, "Tickets[0].TicketType");
    }

    [Fact]
    public async Task Quote_rejects_seats_from_another_auditorium()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var first = await client.GetUpcomingScreeningAsync(0);
        var second = await client.GetUpcomingScreeningAsync(1);
        Assert.NotEqual(first.Auditorium.Id, second.Auditorium.Id);

        var response = await client.PostJsonAsync("/api/orders/quote", new
        {
            screeningId = first.Screening.Id,
            tickets = new[] { new { seatId = second.AvailableSeat().Id, ticketType = "Adult" } },
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("unknown-seat", (await response.ReadProblemAsync()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Quote_rejects_duplicate_seats_and_concessions()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var seatId = screening.AvailableSeat().Id;

        var duplicateSeats = await client.PostJsonAsync("/api/orders/quote", new
        {
            screeningId = screening.Screening.Id,
            tickets = new[] { new { seatId, ticketType = "Adult" }, new { seatId, ticketType = "Child" } },
        });
        Assert.Equal("duplicate-seat", (await duplicateSeats.ReadProblemAsync()).GetProperty("code").GetString());

        var duplicateItems = await client.PostJsonAsync("/api/orders/quote", new
        {
            screeningId = screening.Screening.Id,
            tickets = new[] { new { seatId, ticketType = "Adult" } },
            concessions = new[] { new { itemId = 1, quantity = 1 }, new { itemId = 1, quantity = 2 } },
        });
        Assert.Equal("duplicate-concession", (await duplicateItems.ReadProblemAsync()).GetProperty("code").GetString());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(21)]
    public async Task Concession_quantity_must_be_in_range(int quantity)
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();

        var response = await client.PostJsonAsync("/api/orders/quote", new
        {
            screeningId = screening.Screening.Id,
            tickets = new[] { new { seatId = screening.AvailableSeat().Id, ticketType = "Adult" } },
            concessions = new[] { new { itemId = 1, quantity } },
        });

        await AssertValidationProblemAsync(response, "Concessions[0].Quantity");
    }

    [Fact]
    public async Task Quote_rejects_unknown_concession_items()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();

        var response = await client.PostJsonAsync("/api/orders/quote", new
        {
            screeningId = screening.Screening.Id,
            tickets = new[] { new { seatId = screening.AvailableSeat().Id, ticketType = "Adult" } },
            concessions = new[] { new { itemId = 9999, quantity = 1 } },
        });

        Assert.Equal("unknown-concession", (await response.ReadProblemAsync()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Hold_requires_positive_ids()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var cart = await client.NewCartAsync();

        var response = await client.HoldAsync(cart, 0, -1);

        await AssertValidationProblemAsync(response, "ScreeningId", "SeatId");
    }

    [Fact]
    public async Task Malformed_cart_token_is_not_found()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        var response = await client.GetAsync("/api/carts/not-a-real-token");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await response.ReadProblemAsync();
    }

    [Fact]
    public async Task Malformed_order_number_is_rejected()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        var response = await client.PostJsonAsync("/api/orders/history", new { orderNumber = "12345", email = "a@example.com" });

        await AssertValidationProblemAsync(response, "OrderNumber");
    }

    [Fact]
    public async Task Showtimes_outside_the_booking_window_are_rejected()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        var response = await client.GetAsync("/api/showtimes?date=2026-03-20");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("date-out-of-range", (await response.ReadProblemAsync()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Invalid_json_is_a_400_not_a_500()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        var response = await client.PostAsync("/api/orders/quote", new StringContent("{ not json", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Missing_screening_is_404()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        var response = await client.GetAsync("/api/screenings/999999");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("not-found", (await response.ReadProblemAsync()).GetProperty("code").GetString());
    }
}
