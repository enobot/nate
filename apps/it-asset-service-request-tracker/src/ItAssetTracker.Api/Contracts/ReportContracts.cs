using ItAssetTracker.Api.Domain;

namespace ItAssetTracker.Api.Contracts;

// Row types for the raw SQL reports. Property names must match the column aliases in ReportQueries.

public sealed class StatusCountRow
{
    public string Label { get; set; } = "";
    public int Count { get; set; }
}

public sealed class AssetsByBuildingRow
{
    public string Building { get; set; } = "";
    public int Total { get; set; }
    public int Deployed { get; set; }
    public int InStock { get; set; }
    public int InRepair { get; set; }
    public int Retired { get; set; }
}

public sealed class WarrantyExpiringRow
{
    public int AssetId { get; set; }
    public string AssetTag { get; set; } = "";
    public string AssetType { get; set; } = "";
    public string Manufacturer { get; set; } = "";
    public string Model { get; set; } = "";
    public string Status { get; set; } = "";
    public DateOnly WarrantyEndDate { get; set; }
    public int DaysRemaining { get; set; }
    public string Location { get; set; } = "";
    public string AssignedTo { get; set; } = "";
}

public sealed class OpenTicketsByPriorityRow
{
    public string Priority { get; set; } = "";
    public int OpenCount { get; set; }
    public int Unassigned { get; set; }
    public double? AvgAgeDays { get; set; }
}

public sealed class TicketAgingRow
{
    public int SortOrder { get; set; }
    public string Bucket { get; set; } = "";
    public int Count { get; set; }
}

public sealed class ResolutionTimeRow
{
    public string Category { get; set; } = "";
    public int ResolvedCount { get; set; }
    public double AvgHoursToResolve { get; set; }
    public double MinHoursToResolve { get; set; }
    public double MaxHoursToResolve { get; set; }
}

public sealed class JackUtilizationRow
{
    public int SwitchId { get; set; }
    public string SwitchName { get; set; } = "";
    public string Building { get; set; } = "";
    /// <summary>Ports that can take a wall jack (uplinks are not counted).</summary>
    public int AccessPorts { get; set; }
    public int PatchedPorts { get; set; }
    public int ActiveJacks { get; set; }
    public double UtilizationPercent { get; set; }
}

public sealed class TechnicianWorkloadRow
{
    public int PersonId { get; set; }
    public string Technician { get; set; } = "";
    public int OpenAssigned { get; set; }
    public int InProgress { get; set; }
    public int ResolvedLast30Days { get; set; }
}

public sealed record ReportDefinitionDto(string Key, string Title, string Description, string Sql, IReadOnlyList<string> Parameters);

public sealed record CountByDto<T>(T Key, int Count);

public sealed record DashboardDto(
    DateTime AsOf,
    int TotalAssets,
    IReadOnlyList<CountByDto<AssetStatus>> AssetsByStatus,
    int WarrantyExpiring30Days,
    int OpenRequests,
    int OpenP1Requests,
    int UnassignedOpenRequests,
    int ResolvedLast7Days,
    double? AvgResolutionHoursLast30Days,
    IReadOnlyList<CountByDto<TicketPriority>> OpenRequestsByPriority,
    IReadOnlyList<CountByDto<TicketStatus>> RequestsByStatus,
    int TotalJacks,
    int ActiveJacks,
    int FaultyJacks,
    int AccessPorts,
    int PatchedPorts,
    IReadOnlyList<ServiceRequestListItemDto> RecentRequests);
