using ItAssetTracker.Api.Domain;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace ItAssetTracker.Api.Data;

/// <summary>
/// Resolves the SQLite file path once. A relative "Data Source" is placed under the app's content
/// root (the API project folder when started with dotnet run) so the database file does not move
/// depending on which folder the command was typed in.
/// </summary>
public sealed class DatabasePathResolver
{
    public DatabasePathResolver(IConfiguration configuration, IWebHostEnvironment environment)
    {
        var raw = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("Connection string 'Default' is missing.");
        var builder = new SqliteConnectionStringBuilder(raw);

        var isFile = !string.IsNullOrWhiteSpace(builder.DataSource)
            && builder.DataSource != ":memory:"
            && !builder.DataSource.StartsWith("file:", StringComparison.OrdinalIgnoreCase)
            && builder.Mode != SqliteOpenMode.Memory;

        if (isFile)
        {
            if (!Path.IsPathRooted(builder.DataSource))
            {
                builder.DataSource = Path.GetFullPath(Path.Combine(environment.ContentRootPath, builder.DataSource));
            }

            var directory = Path.GetDirectoryName(builder.DataSource);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }
        }

        ConnectionString = builder.ToString();
        DatabaseFile = isFile ? builder.DataSource : null;
    }

    public string ConnectionString { get; }

    public string? DatabaseFile { get; }
}

public static class DatabaseInitializer
{
    /// <summary>Applies pending migrations and seeds demo data into an empty database, depending on configuration.</summary>
    public static async Task InitializeAsync(IServiceProvider services, IConfiguration configuration, ILogger logger, CancellationToken ct = default)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var clock = scope.ServiceProvider.GetRequiredService<TimeProvider>();

        if (configuration.GetValue("Database:MigrateOnStartup", false))
        {
            await db.Database.MigrateAsync(ct);
            logger.LogInformation("Database migrations applied ({File})",
                scope.ServiceProvider.GetRequiredService<DatabasePathResolver>().DatabaseFile ?? "in-memory");
        }

        if (configuration.GetValue("Demo:SeedOnStartup", false) && !await db.Locations.AnyAsync(ct))
        {
            await DemoDataSeeder.SeedAsync(db, clock.GetUtcNow().UtcDateTime, ct);
            logger.LogInformation("Seeded fictional demo data for {Organization}", DemoDataSeeder.OrganizationName);
        }
    }

    /// <summary>
    /// Deletes every row and re-inserts the demo data inside one transaction, so a failure leaves the
    /// previous data in place. Rows are removed child-first to respect foreign keys.
    /// </summary>
    public static async Task ResetDemoDataAsync(AppDbContext db, DateTime nowUtc, CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        await db.TicketEvents.ExecuteDeleteAsync(ct);
        await db.ServiceRequests.ExecuteDeleteAsync(ct);
        await db.AssetHistory.ExecuteDeleteAsync(ct);
        await db.Assets.ExecuteDeleteAsync(ct);
        await db.NetworkJacks.ExecuteDeleteAsync(ct);
        await db.SwitchPorts.ExecuteDeleteAsync(ct);
        await db.NetworkSwitches.ExecuteDeleteAsync(ct);
        await db.Vlans.ExecuteDeleteAsync(ct);
        await db.People.ExecuteDeleteAsync(ct);
        await db.Locations.ExecuteDeleteAsync(ct);

        // Restart AUTOINCREMENT counters so ids (and SR numbers) match a fresh install.
        await db.Database.ExecuteSqlRawAsync("DELETE FROM sqlite_sequence", ct);

        db.ChangeTracker.Clear();
        await DemoDataSeeder.SeedAsync(db, nowUtc, ct);
        await transaction.CommitAsync(ct);
        db.ChangeTracker.Clear();
    }

    public static async Task<object> CountsAsync(AppDbContext db, CancellationToken ct = default) => new
    {
        Assets = await db.Assets.CountAsync(ct),
        People = await db.People.CountAsync(ct),
        Locations = await db.Locations.CountAsync(ct),
        Switches = await db.NetworkSwitches.CountAsync(ct),
        Ports = await db.SwitchPorts.CountAsync(ct),
        Jacks = await db.NetworkJacks.CountAsync(ct),
        ServiceRequests = await db.ServiceRequests.CountAsync(ct),
        OpenServiceRequests = await db.ServiceRequests.CountAsync(r => r.Status != TicketStatus.Resolved && r.Status != TicketStatus.Closed, ct)
    };
}
