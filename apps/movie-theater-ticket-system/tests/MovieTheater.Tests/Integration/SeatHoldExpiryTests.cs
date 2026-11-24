using System.Net;
using Microsoft.EntityFrameworkCore;
using MovieTheater.Api.Contracts;
using MovieTheater.Api.Domain;
using MovieTheater.Api.Services;

namespace MovieTheater.Tests.Integration;

public class SeatHoldExpiryTests
{
    private static readonly TimeSpan HoldLength = TimeSpan.FromMinutes(10);

    [Fact]
    public async Task Expired_hold_frees_the_seat_for_another_cart()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var seat = screening.AvailableSeat();
        var firstCart = await client.NewCartAsync();
        var secondCart = await client.NewCartAsync();
        await client.HoldAsync(firstCart, screening.Screening.Id, seat.Id);

        // Still held one second before expiry.
        app.Time.Advance(HoldLength - TimeSpan.FromSeconds(1));
        Assert.Equal(HttpStatusCode.Conflict, (await client.HoldAsync(secondCart, screening.Screening.Id, seat.Id)).StatusCode);

        // Free once the hold time has passed, even before the cleanup job runs.
        app.Time.Advance(TimeSpan.FromSeconds(1));
        var map = await client.GetJsonAsync<ScreeningDetailResponse>($"/api/screenings/{screening.Screening.Id}");
        Assert.Equal(SeatStatus.Available, map.Seats.Single(s => s.Id == seat.Id).Status);
        Assert.Empty((await client.GetJsonAsync<CartResponse>($"/api/carts/{firstCart}")).Holds);

        var taken = await client.HoldAsync(secondCart, screening.Screening.Id, seat.Id);
        Assert.Equal(HttpStatusCode.OK, taken.StatusCode);
    }

    [Fact]
    public async Task Checkout_after_the_hold_expires_is_rejected()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var seat = screening.AvailableSeat();
        var cart = await client.NewCartAsync();
        await client.HoldAsync(cart, screening.Screening.Id, seat.Id);

        app.Time.Advance(HoldLength + TimeSpan.FromSeconds(1));
        var response = await client.PostJsonAsync("/api/orders", new
        {
            cartToken = cart,
            customerName = "Slow Shopper",
            customerEmail = "slow@example.com",
            tickets = new[] { new { seatId = seat.Id, ticketType = "Adult" } },
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("hold-expired", (await response.ReadProblemAsync()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task All_seats_in_a_cart_share_the_first_seat_expiry()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var cart = await client.NewCartAsync();
        await client.HoldAsync(cart, screening.Screening.Id, screening.AvailableSeat(skip: 0).Id);

        app.Time.Advance(TimeSpan.FromMinutes(6));
        var response = await client.HoldAsync(cart, screening.Screening.Id, screening.AvailableSeat(skip: 1).Id);

        var held = await response.ReadAsync<CartResponse>();
        Assert.Equal(2, held.Holds.Count);
        Assert.Equal(TestApp.StartTime.UtcDateTime + HoldLength, held.ExpiresAtUtc);
        var expiries = await app.WithDbAsync(db => db.SeatHolds.Where(h => h.CartToken == cart).Select(h => h.ExpiresAtUtc).Distinct().ToListAsync());
        Assert.Single(expiries);
    }

    [Fact]
    public async Task Cleanup_job_deletes_only_expired_holds()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var oldCart = await client.NewCartAsync();
        var newCart = await client.NewCartAsync();
        await client.HoldAsync(oldCart, screening.Screening.Id, screening.AvailableSeat(skip: 0).Id);
        await client.HoldAsync(oldCart, screening.Screening.Id, screening.AvailableSeat(skip: 1).Id);
        app.Time.Advance(TimeSpan.FromMinutes(8));
        await client.HoldAsync(newCart, screening.Screening.Id, screening.AvailableSeat(skip: 2).Id);
        app.Time.Advance(TimeSpan.FromMinutes(3));

        var released = await app.WithServiceAsync<CartService, int>(carts => carts.ReleaseExpiredHoldsAsync(CancellationToken.None));

        Assert.Equal(2, released);
        var remaining = await app.WithDbAsync(db => db.SeatHolds.Select(h => h.CartToken).ToListAsync());
        Assert.Equal([newCart], remaining);
    }

    [Fact]
    public async Task Cleanup_job_runs_on_its_timer()
    {
        await using var app = new TestApp(new() { ["Booking:HoldCleanupIntervalSeconds"] = "30" });
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var cart = await client.NewCartAsync();
        await client.HoldAsync(cart, screening.Screening.Id, screening.AvailableSeat().Id);

        // Move the fake clock past the expiry; the PeriodicTimer uses the same TimeProvider.
        app.Time.Advance(HoldLength + TimeSpan.FromSeconds(30));

        var deadline = DateTime.UtcNow.AddSeconds(10);
        int count;
        do
        {
            count = await app.WithDbAsync(db => db.SeatHolds.CountAsync());
            if (count == 0)
            {
                break;
            }

            app.Time.Advance(TimeSpan.FromSeconds(30));
            await Task.Delay(50);
        }
        while (DateTime.UtcNow < deadline);

        Assert.Equal(0, count);
    }
}
