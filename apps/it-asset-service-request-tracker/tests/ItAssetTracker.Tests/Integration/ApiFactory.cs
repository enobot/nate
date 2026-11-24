using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using ItAssetTracker.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace ItAssetTracker.Tests.Integration;

/// <summary>A clock that stays at a fixed instant so report numbers are predictable.</summary>
public sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => now;
}

/// <summary>
/// Starts the real API in memory against its own temporary SQLite file. The app applies the
/// real EF Core migrations on startup, so the tests also check that the migrations work.
/// </summary>
public class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public static readonly DateTime FixedNow = new(2026, 6, 15, 12, 0, 0, DateTimeKind.Utc);

    private readonly string _databasePath = Path.Combine(Path.GetTempPath(), "it-asset-tracker-tests", Guid.NewGuid().ToString("N"), "tracker.db");

    /// <summary>Set to false by subclasses that seed something other than the standard fixture.</summary>
    protected virtual bool SeedFixture => true;

    protected virtual string EnvironmentName => "Development";

    public string DatabasePath => _databasePath;

    /// <summary>Configuration used by the app under test. Subclasses can change or remove entries.</summary>
    protected virtual void ConfigureSettings(Dictionary<string, string?> settings)
    {
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(EnvironmentName);
        var settings = new Dictionary<string, string?>
        {
            // Pooling=False releases the file handle on close so the temp file can be deleted afterwards.
            ["ConnectionStrings:Default"] = $"Data Source={_databasePath};Pooling=False",
            ["Database:MigrateOnStartup"] = "true",
            ["Demo:SeedOnStartup"] = "false",
            ["Demo:EnableResetEndpoint"] = "true"
        };
        ConfigureSettings(settings);
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(settings));
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(new FixedTimeProvider(new DateTimeOffset(FixedNow)));
        });
    }

    public async Task InitializeAsync()
    {
        _ = Server; // starts the host, which runs the migrations
        if (SeedFixture)
        {
            await using var scope = Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await TestData.SeedAsync(db, FixedNow);
        }
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await DisposeAsync();
        SqliteConnection.ClearAllPools();
        try
        {
            Directory.Delete(Path.GetDirectoryName(_databasePath)!, recursive: true);
        }
        catch (IOException)
        {
            // A locked temp file is harmless; the OS temp cleanup will remove it.
        }
    }

    public AppDbContext CreateDbContext()
    {
        var scope = Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<AppDbContext>();
    }
}

/// <summary>Same app, but with an empty database (no fixture) for the demo seeder tests.</summary>
public sealed class EmptyDatabaseFactory : ApiFactory
{
    protected override bool SeedFixture => false;
}

/// <summary>
/// Runs the app the way a host would: Production environment, only the connection string
/// overridden, and a database file (and folder) that does not exist yet.
/// </summary>
public sealed class ProductionFactory : ApiFactory
{
    protected override bool SeedFixture => false;

    protected override string EnvironmentName => "Production";

    protected override void ConfigureSettings(Dictionary<string, string?> settings)
    {
        settings.Remove("Database:MigrateOnStartup");
        settings.Remove("Demo:SeedOnStartup");
        settings.Remove("Demo:EnableResetEndpoint");
    }
}

/// <summary>Turns on a very low write limit so the 429 behaviour can be tested.</summary>
public sealed class RateLimitedFactory : ApiFactory
{
    protected override void ConfigureSettings(Dictionary<string, string?> settings) => settings["RateLimiting:WritesPerMinute"] = "3";
}

public static class TestJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    public static async Task<T> ReadAsync<T>(this HttpResponseMessage response)
    {
        var value = await response.Content.ReadFromJsonAsync<T>(Options);
        Assert.NotNull(value);
        return value;
    }

    public static Task<HttpResponseMessage> PostJsonAsync<T>(this HttpClient client, string url, T body) =>
        client.PostAsJsonAsync(url, body, Options);

    public static Task<HttpResponseMessage> PutJsonAsync<T>(this HttpClient client, string url, T body) =>
        client.PutAsJsonAsync(url, body, Options);
}

/// <summary>The fields of an RFC 9457 problem response that the tests look at.</summary>
public sealed record Problem(string? Title, int Status, string? Detail, Dictionary<string, string[]>? Errors);
