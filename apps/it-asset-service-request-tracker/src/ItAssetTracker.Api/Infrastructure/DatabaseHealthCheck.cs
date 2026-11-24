using ItAssetTracker.Api.Data;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace ItAssetTracker.Api.Infrastructure;

/// <summary>Reports Unhealthy when the SQLite database cannot be opened.</summary>
public sealed class DatabaseHealthCheck(AppDbContext db) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        return await db.Database.CanConnectAsync(cancellationToken)
            ? HealthCheckResult.Healthy("Database reachable")
            : HealthCheckResult.Unhealthy("Database not reachable");
    }
}
