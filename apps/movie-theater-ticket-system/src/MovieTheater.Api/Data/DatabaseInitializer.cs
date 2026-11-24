using Microsoft.EntityFrameworkCore;
using MovieTheater.Api.Domain;
using MovieTheater.Api.Services;

namespace MovieTheater.Api.Data;

public static class DatabaseInitializer
{
    /// <summary>
    /// Applies EF Core migrations, switches SQLite to WAL mode, and adds the sample data when the
    /// database is empty. With <paramref name="reset"/> the database file is deleted first.
    /// </summary>
    public static async Task InitializeAsync(IServiceProvider services, bool reset, CancellationToken ct = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TheaterDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(DatabaseInitializer));

        if (reset)
        {
            logger.LogWarning("Resetting the database: deleting all data and recreating the sample data.");
            await db.Database.EnsureDeletedAsync(ct);
        }

        await db.Database.MigrateAsync(ct);

        // Write-ahead logging lets readers keep reading while a booking transaction writes.
        await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;", ct);

        if (await db.Movies.AnyAsync(ct))
        {
            return;
        }

        var clock = scope.ServiceProvider.GetRequiredService<TheaterClock>();
        var pricing = scope.ServiceProvider.GetRequiredService<PriceCalculator>();
        SeedData.Populate(db, clock, pricing);
        await db.SaveChangesAsync(ct);
        logger.LogInformation(
            "Created sample data: {Movies} movies, {Screenings} screenings, {Orders} orders.",
            await db.Movies.CountAsync(ct),
            await db.Screenings.CountAsync(ct),
            await db.Orders.CountAsync(ct));
    }
}
