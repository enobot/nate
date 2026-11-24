using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using MovieTheater.Api.Contracts;
using MovieTheater.Api.Domain;

namespace MovieTheater.Tests.Integration;

public class AdminTests
{
    private static object NewMovie(string title = "Paper Lantern Parade", int runtime = 100, string rating = "PG") => new
    {
        title,
        tagline = "A test tagline.",
        synopsis = "A fictional movie created by the admin tests.",
        genre = "Drama",
        rating,
        runtimeMinutes = runtime,
        posterPalette = "dusk",
        posterMotif = "peaks",
        isActive = true,
    };

    [Theory]
    [InlineData("GET", "/api/admin/movies")]
    [InlineData("POST", "/api/admin/movies")]
    [InlineData("PUT", "/api/admin/movies/1")]
    [InlineData("DELETE", "/api/admin/movies/1")]
    [InlineData("GET", "/api/admin/auditoriums")]
    [InlineData("GET", "/api/admin/screenings")]
    [InlineData("POST", "/api/admin/screenings")]
    [InlineData("DELETE", "/api/admin/screenings/1")]
    [InlineData("GET", "/api/admin/orders")]
    [InlineData("GET", "/api/admin/orders/MT-SEED0001")]
    [InlineData("POST", "/api/admin/orders/MT-SEED0001/cancel")]
    [InlineData("GET", "/api/admin/reports/sales")]
    [InlineData("GET", "/api/admin/auth/me")]
    public async Task Admin_endpoints_reject_anonymous_requests(string method, string url)
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        var request = new HttpRequestMessage(new HttpMethod(method), url);
        if (method is "POST" or "PUT")
        {
            request.Content = JsonContent.Create(new { });
        }

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Null(response.Headers.Location); // no redirect to a login page
    }

    [Fact]
    public async Task Anonymous_cancel_request_does_not_cancel_anything()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        await client.PostJsonAsync("/api/admin/orders/MT-SEED0001/cancel", new { reason = "nope" });

        var status = await app.WithDbAsync(db => db.Orders.Where(o => o.OrderNumber == "MT-SEED0001").Select(o => o.Status).SingleAsync());
        Assert.Equal(OrderStatus.Paid, status);
    }

    [Fact]
    public async Task Wrong_password_is_rejected_and_sets_no_cookie()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        var response = await client.PostJsonAsync("/api/admin/auth/login", new { username = TestApp.AdminUser, password = "wrong-password" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.False(response.Headers.Contains("Set-Cookie"));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Login_sets_a_strict_http_only_cookie_and_logout_clears_it()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();

        var login = await client.PostJsonAsync("/api/admin/auth/login", new { username = TestApp.AdminUser, password = TestApp.AdminPassword });

        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var cookie = Assert.Single(login.Headers.GetValues("Set-Cookie"));
        Assert.Contains("mtts_admin=", cookie);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);

        var me = await client.GetJsonAsync<AdminUserDto>("/api/admin/auth/me");
        Assert.Equal(TestApp.AdminUser, me.Username);

        await client.PostAsync("/api/admin/auth/logout", null);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Login_is_rate_limited()
    {
        await using var app = new TestApp(new() { ["RateLimits:LoginPermitsPerMinute"] = "3" });
        var client = app.CreateClient();

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 4; i++)
        {
            var response = await client.PostJsonAsync("/api/admin/auth/login", new { username = "admin", password = "guess-" + i });
            statuses.Add(response.StatusCode);
        }

        Assert.Equal([HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.TooManyRequests], statuses);
    }

    [Fact]
    public async Task Login_is_disabled_when_no_password_is_configured()
    {
        await using var app = new TestApp(new() { ["DemoAdmin:Password"] = "" });
        var client = app.CreateClient();

        var response = await client.PostJsonAsync("/api/admin/auth/login", new { username = "admin", password = "" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode); // empty password fails [Required] first

        var attempt = await client.PostJsonAsync("/api/admin/auth/login", new { username = "admin", password = "anything" });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, attempt.StatusCode);
    }

    [Fact]
    public async Task Admin_can_create_update_and_delete_a_movie()
    {
        await using var app = new TestApp();
        var admin = await app.CreateAdminClientAsync();

        var created = await admin.PostJsonAsync("/api/admin/movies", NewMovie());
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var movie = await created.ReadAsync<AdminMovieDto>();
        Assert.Equal("Paper Lantern Parade", movie.Title);
        Assert.Equal(0, movie.TotalScreenings);

        var updated = await admin.PutAsJsonAsync($"/api/admin/movies/{movie.Id}", NewMovie(runtime: 95, rating: "PG-13"), TestApp.Json);
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        Assert.Equal("PG-13", (await updated.ReadAsync<AdminMovieDto>()).Rating);

        var deleted = await admin.DeleteAsync($"/api/admin/movies/{movie.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.False(await app.WithDbAsync(db => db.Movies.AnyAsync(m => m.Id == movie.Id)));
    }

    [Fact]
    public async Task Duplicate_movie_titles_are_rejected_ignoring_case()
    {
        await using var app = new TestApp();
        var admin = await app.CreateAdminClientAsync();

        var response = await admin.PostJsonAsync("/api/admin/movies", NewMovie(title: "orbit of small hours"));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("duplicate-title", (await response.ReadProblemAsync()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Movie_validation_rejects_bad_values()
    {
        await using var app = new TestApp();
        var admin = await app.CreateAdminClientAsync();

        var response = await admin.PostJsonAsync("/api/admin/movies", new
        {
            title = "",
            synopsis = "short",
            genre = "D",
            rating = "NC-99",
            runtimeMinutes = 5,
            posterPalette = "plaid",
            posterMotif = "orbit",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await response.ReadProblemAsync()).GetProperty("errors");
        foreach (var field in new[] { "Title", "Synopsis", "Genre", "Rating", "RuntimeMinutes", "PosterPalette" })
        {
            Assert.True(errors.TryGetProperty(field, out _), $"Missing error for {field}: {errors}");
        }
    }

    [Fact]
    public async Task Movie_with_screenings_cannot_be_deleted()
    {
        await using var app = new TestApp();
        var admin = await app.CreateAdminClientAsync();
        var movies = await admin.GetJsonAsync<List<AdminMovieDto>>("/api/admin/movies");

        var response = await admin.DeleteAsync($"/api/admin/movies/{movies.First(m => m.TotalScreenings > 0).Id}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("movie-has-screenings", (await response.ReadProblemAsync()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Inactive_movies_disappear_from_customer_listings()
    {
        await using var app = new TestApp();
        var admin = await app.CreateAdminClientAsync();
        var customer = app.CreateClient();
        var movie = (await admin.GetJsonAsync<List<AdminMovieDto>>("/api/admin/movies")).First();

        var hide = await admin.PutAsJsonAsync(
            $"/api/admin/movies/{movie.Id}",
            new { movie.Title, movie.Tagline, movie.Synopsis, movie.Genre, movie.Rating, movie.RuntimeMinutes, movie.PosterPalette, movie.PosterMotif, isActive = false },
            TestApp.Json);
        Assert.Equal(HttpStatusCode.OK, hide.StatusCode);

        for (var day = 0; day < 7; day++)
        {
            var date = DateOnly.FromDateTime(TestApp.StartTime.UtcDateTime).AddDays(day);
            var listing = await customer.GetJsonAsync<ShowtimesResponse>($"/api/showtimes?date={date:yyyy-MM-dd}");
            Assert.DoesNotContain(listing.Movies, m => m.Movie.Id == movie.Id);
        }

        Assert.Equal(HttpStatusCode.NotFound, (await customer.GetAsync($"/api/movies/{movie.Id}")).StatusCode);
    }

    [Fact]
    public async Task Overlapping_screenings_in_one_auditorium_are_rejected()
    {
        await using var app = new TestApp();
        var admin = await app.CreateAdminClientAsync();
        var auditoriums = await admin.GetJsonAsync<List<AuditoriumDto>>("/api/admin/auditoriums");
        var movie = await (await admin.PostJsonAsync("/api/admin/movies", NewMovie(runtime: 100))).ReadAsync<AdminMovieDto>();
        var auditorium = auditoriums.First();

        // Ten days out, so the seeded week of screenings is not involved.
        var day = DateOnly.FromDateTime(TestApp.StartTime.UtcDateTime).AddDays(10);
        object Screening(int hour, int minute, int? auditoriumId = null) => new
        {
            movieId = movie.Id,
            auditoriumId = auditoriumId ?? auditorium.Id,
            startsAtLocal = day.ToDateTime(new TimeOnly(hour, minute)),
        };

        var first = await admin.PostJsonAsync("/api/admin/screenings", Screening(18, 0));
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var created = await first.ReadAsync<AdminScreeningDto>();
        Assert.False(created.IsMatinee);
        Assert.Equal(day.ToDateTime(new TimeOnly(19, 40)), created.EndsAtLocal);

        // 18:00 + 100 min + 20 min cleaning = 20:00. 19:59 overlaps; 20:00 is fine.
        var overlap = await admin.PostJsonAsync("/api/admin/screenings", Screening(19, 59));
        Assert.Equal(HttpStatusCode.Conflict, overlap.StatusCode);
        Assert.Equal("screening-overlap", (await overlap.ReadProblemAsync()).GetProperty("code").GetString());

        var before = await admin.PostJsonAsync("/api/admin/screenings", Screening(16, 30));
        Assert.Equal(HttpStatusCode.Conflict, before.StatusCode);

        var adjacent = await admin.PostJsonAsync("/api/admin/screenings", Screening(20, 0));
        Assert.Equal(HttpStatusCode.Created, adjacent.StatusCode);

        var otherRoom = await admin.PostJsonAsync("/api/admin/screenings", Screening(18, 30, auditoriums.Last().Id));
        Assert.Equal(HttpStatusCode.Created, otherRoom.StatusCode);

        var matinee = await admin.PostJsonAsync("/api/admin/screenings", Screening(13, 0));
        Assert.True((await matinee.ReadAsync<AdminScreeningDto>()).IsMatinee);
    }

    [Fact]
    public async Task Moving_a_screening_onto_another_is_rejected_but_moving_it_slightly_is_allowed()
    {
        await using var app = new TestApp();
        var admin = await app.CreateAdminClientAsync();
        var auditorium = (await admin.GetJsonAsync<List<AuditoriumDto>>("/api/admin/auditoriums")).First();
        var movie = await (await admin.PostJsonAsync("/api/admin/movies", NewMovie(runtime: 100))).ReadAsync<AdminMovieDto>();
        var day = DateOnly.FromDateTime(TestApp.StartTime.UtcDateTime).AddDays(12);
        var early = await (await admin.PostJsonAsync("/api/admin/screenings", new { movieId = movie.Id, auditoriumId = auditorium.Id, startsAtLocal = day.ToDateTime(new TimeOnly(12, 0)) })).ReadAsync<AdminScreeningDto>();
        await admin.PostJsonAsync("/api/admin/screenings", new { movieId = movie.Id, auditoriumId = auditorium.Id, startsAtLocal = day.ToDateTime(new TimeOnly(16, 0)) });

        var clash = await admin.PutAsJsonAsync($"/api/admin/screenings/{early.Id}", new { movieId = movie.Id, auditoriumId = auditorium.Id, startsAtLocal = day.ToDateTime(new TimeOnly(15, 0)) }, TestApp.Json);
        Assert.Equal(HttpStatusCode.Conflict, clash.StatusCode);

        var nudge = await admin.PutAsJsonAsync($"/api/admin/screenings/{early.Id}", new { movieId = movie.Id, auditoriumId = auditorium.Id, startsAtLocal = day.ToDateTime(new TimeOnly(12, 30)) }, TestApp.Json);
        Assert.Equal(HttpStatusCode.OK, nudge.StatusCode);
    }

    [Fact]
    public async Task Longer_runtime_that_would_cause_overlaps_is_rejected()
    {
        await using var app = new TestApp();
        var admin = await app.CreateAdminClientAsync();
        var auditorium = (await admin.GetJsonAsync<List<AuditoriumDto>>("/api/admin/auditoriums")).First();
        var movie = await (await admin.PostJsonAsync("/api/admin/movies", NewMovie(runtime: 100))).ReadAsync<AdminMovieDto>();
        var day = DateOnly.FromDateTime(TestApp.StartTime.UtcDateTime).AddDays(14);
        await admin.PostJsonAsync("/api/admin/screenings", new { movieId = movie.Id, auditoriumId = auditorium.Id, startsAtLocal = day.ToDateTime(new TimeOnly(12, 0)) });
        await admin.PostJsonAsync("/api/admin/screenings", new { movieId = movie.Id, auditoriumId = auditorium.Id, startsAtLocal = day.ToDateTime(new TimeOnly(14, 0)) });

        var response = await admin.PutAsJsonAsync($"/api/admin/movies/{movie.Id}", NewMovie(runtime: 150), TestApp.Json);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("screening-overlap", (await response.ReadProblemAsync()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Screenings_must_start_in_the_future()
    {
        await using var app = new TestApp();
        var admin = await app.CreateAdminClientAsync();
        var auditorium = (await admin.GetJsonAsync<List<AuditoriumDto>>("/api/admin/auditoriums")).First();
        var movie = (await admin.GetJsonAsync<List<AdminMovieDto>>("/api/admin/movies")).First();

        var response = await admin.PostJsonAsync("/api/admin/screenings", new
        {
            movieId = movie.Id,
            auditoriumId = auditorium.Id,
            startsAtLocal = TestApp.StartTime.UtcDateTime.AddHours(-1),
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("start-in-past", (await response.ReadProblemAsync()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Screening_with_orders_cannot_be_deleted_or_moved()
    {
        await using var app = new TestApp();
        var customer = app.CreateClient();
        var screening = await customer.GetUpcomingScreeningAsync();
        await customer.BookAsync(screening.Screening.Id, [screening.AvailableSeat().Id]);
        var admin = await app.CreateAdminClientAsync();

        var delete = await admin.DeleteAsync($"/api/admin/screenings/{screening.Screening.Id}");
        Assert.Equal(HttpStatusCode.Conflict, delete.StatusCode);
        Assert.Equal("screening-has-orders", (await delete.ReadProblemAsync()).GetProperty("code").GetString());

        var move = await admin.PutAsJsonAsync(
            $"/api/admin/screenings/{screening.Screening.Id}",
            new { movieId = screening.Movie.Id, auditoriumId = screening.Auditorium.Id, startsAtLocal = screening.Screening.StartsAtLocal.AddMinutes(5) },
            TestApp.Json);
        Assert.Equal(HttpStatusCode.Conflict, move.StatusCode);
    }

    [Fact]
    public async Task Screening_without_orders_can_be_deleted()
    {
        await using var app = new TestApp();
        var admin = await app.CreateAdminClientAsync();
        var day = DateOnly.FromDateTime(TestApp.StartTime.UtcDateTime).AddDays(3);
        var screenings = await admin.GetJsonAsync<List<AdminScreeningDto>>($"/api/admin/screenings?from={day:yyyy-MM-dd}&to={day:yyyy-MM-dd}");
        var empty = screenings.First(s => !s.HasOrders && s.SeatsHeld == 0);

        var response = await admin.DeleteAsync($"/api/admin/screenings/{empty.Id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/screenings/{empty.Id}")).StatusCode);
    }

    [Fact]
    public async Task Reservation_search_finds_orders_by_email_and_status()
    {
        await using var app = new TestApp();
        var admin = await app.CreateAdminClientAsync();

        var byEmail = await admin.GetJsonAsync<PagedResponse<AdminOrderSummaryDto>>("/api/admin/orders?search=jordan.rivera");
        Assert.Equal(2, byEmail.TotalCount);

        var cancelled = await admin.GetJsonAsync<PagedResponse<AdminOrderSummaryDto>>("/api/admin/orders?status=Cancelled");
        Assert.All(cancelled.Items, o => Assert.Equal(OrderStatus.Cancelled, o.Status));
        Assert.Contains(cancelled.Items, o => o.OrderNumber == "MT-SEED0004");

        // LIKE wildcards in the search box are treated as plain text.
        var wildcard = await admin.GetJsonAsync<PagedResponse<AdminOrderSummaryDto>>("/api/admin/orders?search=%25");
        Assert.Equal(0, wildcard.TotalCount);

        var paged = await admin.GetJsonAsync<PagedResponse<AdminOrderSummaryDto>>("/api/admin/orders?page=2&pageSize=3");
        Assert.Equal(2, paged.Page);
        Assert.Equal(7, paged.TotalCount);
        Assert.Equal(3, paged.Items.Count);
    }

    [Fact]
    public async Task Sales_report_reflects_real_orders()
    {
        await using var app = new TestApp();
        var admin = await app.CreateAdminClientAsync();
        var before = await admin.GetJsonAsync<SalesReportDto>("/api/admin/reports/sales");

        // Seeded data: 6 paid orders and 1 cancelled order.
        Assert.Equal(6, before.PaidOrders);
        Assert.Equal(1, before.CancelledOrders);
        var seededGross = await app.WithDbAsync(db => db.Orders.Where(o => o.Status == OrderStatus.Paid).SumAsync(o => o.TotalCents));
        Assert.Equal(seededGross, before.GrossCents);
        Assert.Equal(before.TicketRevenueCents + before.ConcessionRevenueCents + before.TaxCents, before.GrossCents);
        Assert.Equal(before.TicketsSold, before.ByMovie.Sum(m => m.TicketsSold));

        var customer = app.CreateClient();
        var screening = await customer.GetUpcomingScreeningAsync();
        var order = await customer.BookAsync(
            screening.Screening.Id,
            [screening.AvailableSeat(skip: 0).Id, screening.AvailableSeat(skip: 1).Id],
            concessions: [new { itemId = 1, quantity = 2 }]);

        var after = await admin.GetJsonAsync<SalesReportDto>("/api/admin/reports/sales");
        Assert.Equal(before.PaidOrders + 1, after.PaidOrders);
        Assert.Equal(before.TicketsSold + 2, after.TicketsSold);
        Assert.Equal(before.GrossCents + order.TotalCents, after.GrossCents);
        Assert.Equal(
            before.Concessions.Where(c => c.ItemId == 1).Sum(c => c.Quantity) + 2,
            after.Concessions.Single(c => c.ItemId == 1).Quantity);
        Assert.NotEmpty(after.UpcomingOccupancy);
    }
}
