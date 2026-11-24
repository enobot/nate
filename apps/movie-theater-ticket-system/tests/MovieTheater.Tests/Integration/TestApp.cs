using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;
using MovieTheater.Api.Contracts;
using MovieTheater.Api.Data;
using MovieTheater.Api.Domain;

namespace MovieTheater.Tests.Integration;

/// <summary>
/// Runs the real application in memory against a real SQLite file in a temp folder, with a
/// fake clock. Each TestApp gets its own database, created by the real migrations and seed code.
/// </summary>
public sealed class TestApp : WebApplicationFactory<Program>
{
    public const string AdminUser = "admin";
    public const string AdminPassword = "test-only-password";

    /// <summary>Monday 2 March 2026, 17:00 UTC. The tests run with the theater in UTC.</summary>
    public static readonly DateTimeOffset StartTime = new(2026, 3, 2, 17, 0, 0, TimeSpan.Zero);

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    private readonly string dataDirectory = Path.Combine(Path.GetTempPath(), "mtts-tests", Guid.NewGuid().ToString("N"));
    private readonly Dictionary<string, string> overrides;

    public TestApp(Dictionary<string, string>? settings = null)
    {
        overrides = settings ?? [];
        Directory.CreateDirectory(dataDirectory);
    }

    public FakeTimeProvider Time { get; } = new(StartTime);

    public string DatabasePath => Path.Combine(dataDirectory, "test.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Theater", $"Data Source={DatabasePath}");
        builder.UseSetting("Storage:DataDirectory", dataDirectory);
        builder.UseSetting("Theater:TimeZone", "UTC");
        builder.UseSetting("Booking:HoldCleanupIntervalSeconds", "0");
        builder.UseSetting("DemoAdmin:Username", AdminUser);
        builder.UseSetting("DemoAdmin:Password", AdminPassword);
        builder.UseSetting("RateLimits:LoginPermitsPerMinute", "1000");
        builder.UseSetting("RateLimits:OrderLookupPermitsPerMinute", "1000");
        foreach (var (key, value) in overrides)
        {
            builder.UseSetting(key, value);
        }

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Time);
        });
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        SqliteConnection.ClearAllPools();
        try
        {
            Directory.Delete(dataDirectory, recursive: true);
        }
        catch (IOException)
        {
            // A file can stay locked briefly on Windows; the temp folder is cleaned up by the OS later.
        }
    }

    /// <summary>Runs code against the database directly, outside any HTTP request.</summary>
    public async Task<T> WithDbAsync<T>(Func<TheaterDbContext, Task<T>> action)
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TheaterDbContext>();
        return await action(db);
    }

    public async Task<T> WithServiceAsync<TService, T>(Func<TService, Task<T>> action)
        where TService : notnull
    {
        await using var scope = Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<TService>());
    }

    public async Task<HttpClient> CreateAdminClientAsync()
    {
        var client = CreateClient();
        var response = await client.PostAsJsonAsync("/api/admin/auth/login", new { username = AdminUser, password = AdminPassword });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return client;
    }
}

/// <summary>Small helpers that call the public API the same way the React client does.</summary>
public static class ApiExtensions
{
    public static async Task<T> ReadAsync<T>(this HttpResponseMessage response)
    {
        var value = await response.Content.ReadFromJsonAsync<T>(TestApp.Json);
        Assert.NotNull(value);
        return value;
    }

    public static async Task<T> GetJsonAsync<T>(this HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        Assert.True(response.IsSuccessStatusCode, $"GET {url} returned {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return await response.ReadAsync<T>();
    }

    public static Task<HttpResponseMessage> PostJsonAsync(this HttpClient client, string url, object body) =>
        client.PostAsJsonAsync(url, body, TestApp.Json);

    public static async Task<string> NewCartAsync(this HttpClient client)
    {
        var response = await client.PostAsync("/api/carts", null);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.ReadAsync<CartResponse>()).CartToken;
    }

    public static Task<HttpResponseMessage> HoldAsync(this HttpClient client, string cartToken, int screeningId, int seatId) =>
        client.PostJsonAsync($"/api/carts/{cartToken}/holds", new { screeningId, seatId });

    /// <summary>A screening tomorrow (always in the future for the test clock) and its seat map.</summary>
    public static async Task<ScreeningDetailResponse> GetUpcomingScreeningAsync(this HttpClient client, int index = 0)
    {
        var date = DateOnly.FromDateTime(TestApp.StartTime.UtcDateTime).AddDays(1);
        var showtimes = await client.GetJsonAsync<ShowtimesResponse>($"/api/showtimes?date={date:yyyy-MM-dd}");
        var screening = showtimes.Movies.SelectMany(m => m.Showtimes).OrderBy(s => s.StartsAtUtc).ElementAt(index);
        return await client.GetJsonAsync<ScreeningDetailResponse>($"/api/screenings/{screening.Id}");
    }

    public static SeatDto AvailableSeat(this ScreeningDetailResponse screening, SeatType type = SeatType.Standard, int skip = 0) =>
        screening.Seats.Where(s => s.Status == SeatStatus.Available && s.SeatType == type).Skip(skip).First();

    public static async Task<OrderDto> BookAsync(
        this HttpClient client,
        int screeningId,
        IReadOnlyList<int> seatIds,
        string email = "test.customer@example.com",
        TicketType ticketType = TicketType.Adult,
        object[]? concessions = null)
    {
        var cart = await client.NewCartAsync();
        foreach (var seatId in seatIds)
        {
            var hold = await client.HoldAsync(cart, screeningId, seatId);
            Assert.Equal(HttpStatusCode.OK, hold.StatusCode);
        }

        var checkout = await client.PostJsonAsync("/api/orders", new
        {
            cartToken = cart,
            customerName = "Test Customer",
            customerEmail = email,
            tickets = seatIds.Select(id => new { seatId = id, ticketType }).ToArray(),
            concessions = concessions ?? [],
        });
        Assert.True(checkout.StatusCode == HttpStatusCode.Created, await checkout.Content.ReadAsStringAsync());
        return await checkout.ReadAsync<OrderDto>();
    }

    public static async Task<JsonElement> ReadProblemAsync(this HttpResponseMessage response)
    {
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
}
