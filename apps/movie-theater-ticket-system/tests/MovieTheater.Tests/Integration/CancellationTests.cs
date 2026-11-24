using System.Net;
using MovieTheater.Api.Contracts;
using MovieTheater.Api.Domain;

namespace MovieTheater.Tests.Integration;

public class CancellationTests
{
    [Fact]
    public async Task Customer_can_cancel_until_the_cutoff()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var order = await client.BookAsync(screening.Screening.Id, [screening.AvailableSeat().Id], email: "cutoff@example.com");

        // One minute before the 30-minute cutoff.
        app.Time.SetUtcNow(new DateTimeOffset(screening.Screening.StartsAtUtc.AddMinutes(-31), TimeSpan.Zero));
        var response = await client.PostJsonAsync($"/api/orders/{order.OrderNumber}/cancel", new { email = "cutoff@example.com" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(OrderStatus.Cancelled, (await response.ReadAsync<OrderDto>()).Status);
    }

    [Fact]
    public async Task Customer_cannot_cancel_inside_the_cutoff()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var order = await client.BookAsync(screening.Screening.Id, [screening.AvailableSeat().Id], email: "late@example.com");

        app.Time.SetUtcNow(new DateTimeOffset(screening.Screening.StartsAtUtc.AddMinutes(-30), TimeSpan.Zero));
        var response = await client.PostJsonAsync($"/api/orders/{order.OrderNumber}/cancel", new { email = "late@example.com" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("cancellation-closed", (await response.ReadProblemAsync()).GetProperty("code").GetString());

        var history = await (await client.PostJsonAsync("/api/orders/history", new { orderNumber = order.OrderNumber, email = "late@example.com" }))
            .ReadAsync<OrderHistoryResponse>();
        var stillPaid = Assert.Single(history.Orders);
        Assert.Equal(OrderStatus.Paid, stillPaid.Status);
        Assert.False(stillPaid.CanCancel);
    }

    [Fact]
    public async Task Cancelling_twice_is_a_conflict()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var order = await client.BookAsync(screening.Screening.Id, [screening.AvailableSeat().Id], email: "twice@example.com");

        await client.PostJsonAsync($"/api/orders/{order.OrderNumber}/cancel", new { email = "twice@example.com" });
        var second = await client.PostJsonAsync($"/api/orders/{order.OrderNumber}/cancel", new { email = "twice@example.com" });

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Equal("already-cancelled", (await second.ReadProblemAsync()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Cancelling_with_the_wrong_email_is_not_found()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var order = await client.BookAsync(screening.Screening.Id, [screening.AvailableSeat().Id], email: "owner@example.com");

        var response = await client.PostJsonAsync($"/api/orders/{order.OrderNumber}/cancel", new { email = "stranger@example.com" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Admin_can_cancel_after_the_customer_cutoff()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var order = await client.BookAsync(screening.Screening.Id, [screening.AvailableSeat().Id]);
        app.Time.SetUtcNow(new DateTimeOffset(screening.Screening.StartsAtUtc.AddMinutes(-5), TimeSpan.Zero));
        var admin = await app.CreateAdminClientAsync();

        var response = await admin.PostJsonAsync($"/api/admin/orders/{order.OrderNumber}/cancel", new { reason = "Projector repair" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cancelled = await response.ReadAsync<OrderDto>();
        Assert.Equal(CancellationSource.Admin, cancelled.CancelledBy);
        Assert.Equal("Projector repair", cancelled.CancellationReason);
    }
}
