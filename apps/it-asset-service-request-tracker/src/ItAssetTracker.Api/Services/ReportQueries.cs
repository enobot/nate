namespace ItAssetTracker.Api.Services;

/// <summary>
/// The SQL behind the Reports page. Each query is a format string whose {0}, {1} ... placeholders
/// are turned into DbParameters by EF Core (Database.SqlQuery with a FormattableString), so user
/// input is never concatenated into the SQL text. The same text is returned by
/// GET /api/reports/definitions and shown in the UI and README.
/// These queries use SQLite date functions (julianday) and would need small changes for another database.
/// </summary>
public static class ReportQueries
{
    public const string AssetsByStatus = """
        SELECT a.Status AS Label,
               COUNT(*) AS Count
        FROM Assets a
        GROUP BY a.Status
        ORDER BY Count DESC, Label
        """;

    public const string AssetsByBuilding = """
        SELECT COALESCE(l.Building, '(No location)') AS Building,
               COUNT(*) AS Total,
               SUM(CASE WHEN a.Status = 'Deployed' THEN 1 ELSE 0 END) AS Deployed,
               SUM(CASE WHEN a.Status = 'InStock'  THEN 1 ELSE 0 END) AS InStock,
               SUM(CASE WHEN a.Status = 'InRepair' THEN 1 ELSE 0 END) AS InRepair,
               SUM(CASE WHEN a.Status = 'Retired'  THEN 1 ELSE 0 END) AS Retired
        FROM Assets a
        LEFT JOIN Locations l ON l.Id = a.LocationId
        GROUP BY COALESCE(l.Building, '(No location)')
        ORDER BY Total DESC, Building
        """;

    /// <summary>{0} = today (date), {1} = last day of the window (date).</summary>
    public const string WarrantyExpiring = """
        SELECT a.Id AS AssetId,
               a.AssetTag,
               a.AssetType,
               a.Manufacturer,
               a.Model,
               a.Status,
               a.WarrantyEndDate,
               CAST(julianday(a.WarrantyEndDate) - julianday({0}) AS INTEGER) AS DaysRemaining,
               COALESCE(l.BuildingCode || ' ' || l.Room, '') AS Location,
               COALESCE(p.FirstName || ' ' || p.LastName, '') AS AssignedTo
        FROM Assets a
        LEFT JOIN Locations l ON l.Id = a.LocationId
        LEFT JOIN People p ON p.Id = a.AssignedToPersonId
        WHERE a.Status <> 'Retired'
          AND a.WarrantyEndDate IS NOT NULL
          AND a.WarrantyEndDate >= {0}
          AND a.WarrantyEndDate <= {1}
        ORDER BY a.WarrantyEndDate, a.AssetTag
        """;

    /// <summary>{0} = current UTC time. Every priority is listed, even with zero open requests.</summary>
    public const string OpenTicketsByPriority = """
        WITH priorities(Priority) AS (VALUES ('P1'), ('P2'), ('P3'), ('P4'))
        SELECT pr.Priority AS Priority,
               COUNT(sr.Id) AS OpenCount,
               COALESCE(SUM(CASE WHEN sr.Id IS NOT NULL AND sr.AssigneeId IS NULL THEN 1 ELSE 0 END), 0) AS Unassigned,
               ROUND(AVG(julianday({0}) - julianday(sr.CreatedAt)), 1) AS AvgAgeDays
        FROM priorities pr
        LEFT JOIN ServiceRequests sr
               ON sr.Priority = pr.Priority
              AND sr.Status NOT IN ('Resolved', 'Closed')
        GROUP BY pr.Priority
        ORDER BY pr.Priority
        """;

    /// <summary>{0} = current UTC time. Age is measured from CreatedAt for requests that are still open.</summary>
    public const string TicketAging = """
        WITH buckets(SortOrder, Bucket, MinDays, MaxDays) AS (
            VALUES (1, 'Under 1 day', 0, 1),
                   (2, '1-3 days', 1, 3),
                   (3, '3-7 days', 3, 7),
                   (4, '7-30 days', 7, 30),
                   (5, 'Over 30 days', 30, 100000)
        )
        SELECT b.SortOrder,
               b.Bucket,
               COUNT(sr.Id) AS Count
        FROM buckets b
        LEFT JOIN ServiceRequests sr
               ON sr.Status NOT IN ('Resolved', 'Closed')
              AND julianday({0}) - julianday(sr.CreatedAt) >= b.MinDays
              AND julianday({0}) - julianday(sr.CreatedAt) <  b.MaxDays
        GROUP BY b.SortOrder, b.Bucket
        ORDER BY b.SortOrder
        """;

    public const string ResolutionTimeByCategory = """
        SELECT sr.Category AS Category,
               COUNT(*) AS ResolvedCount,
               ROUND(AVG((julianday(sr.ResolvedAt) - julianday(sr.CreatedAt)) * 24.0), 1) AS AvgHoursToResolve,
               ROUND(MIN((julianday(sr.ResolvedAt) - julianday(sr.CreatedAt)) * 24.0), 1) AS MinHoursToResolve,
               ROUND(MAX((julianday(sr.ResolvedAt) - julianday(sr.CreatedAt)) * 24.0), 1) AS MaxHoursToResolve
        FROM ServiceRequests sr
        WHERE sr.ResolvedAt IS NOT NULL
          AND sr.Status IN ('Resolved', 'Closed')
        GROUP BY sr.Category
        ORDER BY AvgHoursToResolve DESC, Category
        """;

    /// <summary>Only access ports count: uplink ports connect to the core and never take a jack.</summary>
    public const string JackUtilization = """
        SELECT s.Id AS SwitchId,
               s.Name AS SwitchName,
               l.Building AS Building,
               COUNT(p.Id) AS AccessPorts,
               COUNT(j.Id) AS PatchedPorts,
               COALESCE(SUM(CASE WHEN j.Status = 'Active' THEN 1 ELSE 0 END), 0) AS ActiveJacks,
               COALESCE(ROUND(100.0 * COUNT(j.Id) / NULLIF(COUNT(p.Id), 0), 1), 0.0) AS UtilizationPercent
        FROM NetworkSwitches s
        JOIN Locations l ON l.Id = s.LocationId
        LEFT JOIN SwitchPorts p ON p.SwitchId = s.Id AND p.Role = 'Access'
        LEFT JOIN NetworkJacks j ON j.SwitchPortId = p.Id
        GROUP BY s.Id, s.Name, l.Building
        ORDER BY s.Name
        """;

    /// <summary>{0} = start of the 30-day window (UTC).</summary>
    public const string TechnicianWorkload = """
        SELECT p.Id AS PersonId,
               p.FirstName || ' ' || p.LastName AS Technician,
               COALESCE(SUM(CASE WHEN sr.Status IN ('Assigned', 'InProgress', 'Reopened') THEN 1 ELSE 0 END), 0) AS OpenAssigned,
               COALESCE(SUM(CASE WHEN sr.Status = 'InProgress' THEN 1 ELSE 0 END), 0) AS InProgress,
               COALESCE(SUM(CASE WHEN sr.Status IN ('Resolved', 'Closed') AND sr.ResolvedAt >= {0} THEN 1 ELSE 0 END), 0) AS ResolvedLast30Days
        FROM People p
        LEFT JOIN ServiceRequests sr ON sr.AssigneeId = p.Id
        WHERE p.IsTechnician = 1
        GROUP BY p.Id, p.FirstName, p.LastName
        ORDER BY OpenAssigned DESC, Technician
        """;

    /// <summary>{0} = start of the window (UTC). Used by the dashboard.</summary>
    public const string AverageResolutionHoursSince = """
        SELECT ROUND(AVG((julianday(sr.ResolvedAt) - julianday(sr.CreatedAt)) * 24.0), 1) AS Value
        FROM ServiceRequests sr
        WHERE sr.ResolvedAt IS NOT NULL
          AND sr.ResolvedAt >= {0}
        """;
}
