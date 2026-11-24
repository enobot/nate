using System.Runtime.CompilerServices;
using ItAssetTracker.Api.Contracts;
using ItAssetTracker.Api.Data;
using ItAssetTracker.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace ItAssetTracker.Api.Services;

/// <summary>Runs the parameterized SQL in <see cref="ReportQueries"/> and the dashboard counts.</summary>
public sealed class ReportService(AppDbContext db, TimeProvider clock, ServiceRequestService requests)
{
    public const int MaxWarrantyDays = 730;

    public static readonly IReadOnlyList<ReportDefinitionDto> Definitions =
    [
        new("assets-by-status", "Assets by status", "How many assets are in stock, deployed, in repair or retired.", ReportQueries.AssetsByStatus, []),
        new("assets-by-building", "Assets by building", "Asset counts per building, split by status. Assets without a location are grouped separately.", ReportQueries.AssetsByBuilding, []),
        new("warranty-expiring", "Warranty expiring", "Non-retired assets whose warranty ends between today and the chosen number of days from now.", ReportQueries.WarrantyExpiring, ["{0} today", "{1} today + days"]),
        new("open-tickets-by-priority", "Open requests by priority", "Requests that are not Resolved or Closed, with how many are unassigned and their average age.", ReportQueries.OpenTicketsByPriority, ["{0} current UTC time"]),
        new("ticket-aging", "Open request aging", "Open requests grouped by how long ago they were created.", ReportQueries.TicketAging, ["{0} current UTC time"]),
        new("resolution-time", "Time to resolve by category", "Average, fastest and slowest hours from creation to resolution for resolved and closed requests.", ReportQueries.ResolutionTimeByCategory, []),
        new("jack-utilization", "Jack utilization per switch", "Access ports per switch (uplinks excluded), how many have a jack patched, and how many of those jacks are active.", ReportQueries.JackUtilization, []),
        new("technician-workload", "Technician workload", "Open requests per technician and how many each resolved in the last 30 days.", ReportQueries.TechnicianWorkload, ["{0} now - 30 days"])
    ];

    private DateTime UtcNow => clock.GetUtcNow().UtcDateTime;

    public Task<List<StatusCountRow>> AssetsByStatusAsync(CancellationToken ct) =>
        db.Database.SqlQuery<StatusCountRow>(Sql(ReportQueries.AssetsByStatus)).ToListAsync(ct);

    public Task<List<AssetsByBuildingRow>> AssetsByBuildingAsync(CancellationToken ct) =>
        db.Database.SqlQuery<AssetsByBuildingRow>(Sql(ReportQueries.AssetsByBuilding)).ToListAsync(ct);

    public Task<List<WarrantyExpiringRow>> WarrantyExpiringAsync(int days, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(UtcNow);
        return db.Database.SqlQuery<WarrantyExpiringRow>(Sql(ReportQueries.WarrantyExpiring, today, today.AddDays(days))).ToListAsync(ct);
    }

    public Task<List<OpenTicketsByPriorityRow>> OpenTicketsByPriorityAsync(CancellationToken ct) =>
        db.Database.SqlQuery<OpenTicketsByPriorityRow>(Sql(ReportQueries.OpenTicketsByPriority, UtcNow)).ToListAsync(ct);

    public Task<List<TicketAgingRow>> TicketAgingAsync(CancellationToken ct) =>
        db.Database.SqlQuery<TicketAgingRow>(Sql(ReportQueries.TicketAging, UtcNow)).ToListAsync(ct);

    public Task<List<ResolutionTimeRow>> ResolutionTimeByCategoryAsync(CancellationToken ct) =>
        db.Database.SqlQuery<ResolutionTimeRow>(Sql(ReportQueries.ResolutionTimeByCategory)).ToListAsync(ct);

    public Task<List<JackUtilizationRow>> JackUtilizationAsync(CancellationToken ct) =>
        db.Database.SqlQuery<JackUtilizationRow>(Sql(ReportQueries.JackUtilization)).ToListAsync(ct);

    public Task<List<TechnicianWorkloadRow>> TechnicianWorkloadAsync(CancellationToken ct) =>
        db.Database.SqlQuery<TechnicianWorkloadRow>(Sql(ReportQueries.TechnicianWorkload, UtcNow.AddDays(-30))).ToListAsync(ct);

    public async Task<DashboardDto> DashboardAsync(CancellationToken ct)
    {
        var now = UtcNow;
        var today = DateOnly.FromDateTime(now);
        var in30Days = today.AddDays(30);
        var weekAgo = now.AddDays(-7);

        var statusCounts = await db.Assets.GroupBy(a => a.Status)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var assetsByStatus = Enum.GetValues<AssetStatus>()
            .Select(s => new CountByDto<AssetStatus>(s, statusCounts.FirstOrDefault(c => c.Key == s)?.Count ?? 0))
            .ToList();

        var warrantyExpiring = await db.Assets.CountAsync(a => a.Status != AssetStatus.Retired
            && a.WarrantyEndDate != null && a.WarrantyEndDate >= today && a.WarrantyEndDate <= in30Days, ct);

        var open = db.ServiceRequests.Where(r => r.Status != TicketStatus.Resolved && r.Status != TicketStatus.Closed);
        var openCount = await open.CountAsync(ct);
        var openP1 = await open.CountAsync(r => r.Priority == TicketPriority.P1, ct);
        var unassigned = await open.CountAsync(r => r.AssigneeId == null, ct);
        var resolvedLast7 = await db.ServiceRequests.CountAsync(r => r.ResolvedAt != null && r.ResolvedAt >= weekAgo, ct);

        var priorityCounts = await open.GroupBy(r => r.Priority).Select(g => new { g.Key, Count = g.Count() }).ToListAsync(ct);
        var openByPriority = Enum.GetValues<TicketPriority>()
            .Select(p => new CountByDto<TicketPriority>(p, priorityCounts.FirstOrDefault(c => c.Key == p)?.Count ?? 0))
            .ToList();

        var statusTicketCounts = await db.ServiceRequests.GroupBy(r => r.Status).Select(g => new { g.Key, Count = g.Count() }).ToListAsync(ct);
        var requestsByStatus = Enum.GetValues<TicketStatus>()
            .Select(s => new CountByDto<TicketStatus>(s, statusTicketCounts.FirstOrDefault(c => c.Key == s)?.Count ?? 0))
            .ToList();

        var avgHours = (await db.Database
            .SqlQuery<double?>(Sql(ReportQueries.AverageResolutionHoursSince, now.AddDays(-30)))
            .ToListAsync(ct)).FirstOrDefault();

        var totalJacks = await db.NetworkJacks.CountAsync(ct);
        var activeJacks = await db.NetworkJacks.CountAsync(j => j.Status == JackStatus.Active, ct);
        var faultyJacks = await db.NetworkJacks.CountAsync(j => j.Status == JackStatus.Faulty, ct);
        var accessPorts = await db.SwitchPorts.CountAsync(p => p.Role == PortRole.Access, ct);
        var patchedPorts = await db.NetworkJacks.CountAsync(j => j.SwitchPortId != null, ct);

        var recent = await requests.ListAsync(new ServiceRequestQuery { PageSize = 6 }, ct);

        return new DashboardDto(
            now,
            assetsByStatus.Sum(s => s.Count),
            assetsByStatus,
            warrantyExpiring,
            openCount,
            openP1,
            unassigned,
            resolvedLast7,
            avgHours,
            openByPriority,
            requestsByStatus,
            totalJacks,
            activeJacks,
            faultyJacks,
            accessPorts,
            patchedPorts,
            recent.Items);
    }

    /// <summary>
    /// Wraps a constant SQL template and its arguments in a FormattableString. EF Core replaces each
    /// {n} placeholder with a DbParameter (@p0, @p1 ...) instead of inserting the value into the text.
    /// </summary>
    private static FormattableString Sql(string template, params object[] args) =>
        FormattableStringFactory.Create(template, args);
}
