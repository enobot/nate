using System.Net;
using MovieTheater.Api.Contracts;

namespace MovieTheater.Tests.Integration;

/// <summary>
/// The listing opens on the first day that still has showtimes, judged in the theater's time zone,
/// so an evening visitor does not land on an empty "today".
/// </summary>
public class ShowtimesDefaultDateTests
{
    // The seeded schedule's last show of the day starts at 21:40 theater time.
    private static readonly DateOnly SeedDay = DateOnly.FromDateTime(TestApp.StartTime.UtcDateTime);

    [Fact]
    public async Task Default_is_today_while_today_still_has_showtimes()
    {
        await using var app = new TestApp(); // 17:00 theater time
        var client = app.CreateClient();

        var listing = await client.GetJsonAsync<ShowtimesResponse>("/api/showtimes");

        Assert.Equal(SeedDay, listing.Date);
        Assert.Equal(SeedDay, listing.Dates[0]);
        Assert.NotEmpty(listing.Movies);
    }

    [Fact]
    public async Task Default_moves_to_the_next_day_after_the_last_show_has_started()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        app.Time.SetUtcNow(new DateTimeOffset(SeedDay.ToDateTime(new TimeOnly(23, 4)), TimeSpan.Zero));

        var listing = await client.GetJsonAsync<ShowtimesResponse>("/api/showtimes");

        Assert.Equal(SeedDay.AddDays(1), listing.Date);
        Assert.Equal(SeedDay, listing.Dates[0]); // today stays in the date strip
        Assert.Equal(7, listing.Dates.Count);
        Assert.NotEmpty(listing.Movies);
        Assert.All(listing.Movies.SelectMany(m => m.Showtimes), s => Assert.Equal(listing.Date, DateOnly.FromDateTime(s.StartsAtLocal)));
    }

    [Fact]
    public async Task Explicitly_chosen_day_without_showtimes_stays_empty()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        app.Time.SetUtcNow(new DateTimeOffset(SeedDay.ToDateTime(new TimeOnly(23, 4)), TimeSpan.Zero));

        var listing = await client.GetJsonAsync<ShowtimesResponse>($"/api/showtimes?date={SeedDay:yyyy-MM-dd}");

        Assert.Equal(SeedDay, listing.Date);
        Assert.Empty(listing.Movies);
    }

    [Fact]
    public async Task Default_uses_the_theater_time_zone_not_utc()
    {
        // 06:30 UTC on 3 March is 22:30 on 2 March in Los Angeles (UTC-8 before daylight saving starts).
        await using var app = new TestApp(new() { ["Theater:TimeZone"] = "America/Los_Angeles" });
        app.Time.SetUtcNow(new DateTimeOffset(2026, 3, 3, 6, 30, 0, TimeSpan.Zero));
        var client = app.CreateClient();

        var listing = await client.GetJsonAsync<ShowtimesResponse>("/api/showtimes");

        // Today is still 2 March at the theater, but its shows are over, so 3 March is shown.
        Assert.Equal(new DateOnly(2026, 3, 2), listing.Dates[0]);
        Assert.Equal(new DateOnly(2026, 3, 3), listing.Date);
        var first = listing.Movies.SelectMany(m => m.Showtimes).MinBy(s => s.StartsAtUtc)!;
        Assert.Equal(new DateTime(2026, 3, 3, 11, 0, 0), first.StartsAtLocal);
        Assert.Equal(new DateTime(2026, 3, 3, 19, 0, 0, DateTimeKind.Utc), first.StartsAtUtc);
    }

    [Fact]
    public async Task Default_falls_back_to_today_when_no_showtimes_remain_in_the_week()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        app.Time.SetUtcNow(new DateTimeOffset(SeedDay.AddDays(6).ToDateTime(new TimeOnly(23, 30)), TimeSpan.Zero));

        var listing = await client.GetJsonAsync<ShowtimesResponse>("/api/showtimes");

        Assert.Equal(SeedDay.AddDays(6), listing.Date);
        Assert.Empty(listing.Movies);
    }
}

public class HealthCheckTests
{
    [Fact]
    public async Task Health_endpoint_is_anonymous_cheap_and_plain_text()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        var response = await client.GetAsync("/healthz");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/plain", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
    }
}
