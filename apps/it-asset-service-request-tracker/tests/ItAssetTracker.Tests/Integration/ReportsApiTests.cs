using ItAssetTracker.Api.Contracts;
using ItAssetTracker.Api.Domain;

namespace ItAssetTracker.Tests.Integration;

/// <summary>
/// Runs every SQL report against the fixture in <see cref="TestData"/> and compares with numbers
/// worked out by hand. This class never writes, so the numbers stay fixed for all tests in it.
/// </summary>
public class ReportsApiTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Assets_by_status_counts_every_status()
    {
        var rows = await (await _client.GetAsync("/api/reports/assets-by-status")).ReadAsync<List<StatusCountRow>>();
        var counts = rows.ToDictionary(r => r.Label, r => r.Count);
        Assert.Equal(new Dictionary<string, int> { ["Deployed"] = 2, ["InStock"] = 2, ["InRepair"] = 1, ["Retired"] = 1 }, counts);
    }

    [Fact]
    public async Task Assets_by_building_groups_assets_without_location()
    {
        var rows = await (await _client.GetAsync("/api/reports/assets-by-building")).ReadAsync<List<AssetsByBuildingRow>>();
        var eng = Assert.Single(rows, r => r.Building == "Engineering Hall");
        Assert.Equal((2, 2, 0), (eng.Total, eng.Deployed, eng.InStock));
        var adm = Assert.Single(rows, r => r.Building == "Admin Building");
        Assert.Equal((2, 2), (adm.Total, adm.InStock));
        var lib = Assert.Single(rows, r => r.Building == "Fenn Library");
        Assert.Equal((1, 1), (lib.Total, lib.InRepair));
        var none = Assert.Single(rows, r => r.Building == "(No location)");
        Assert.Equal((1, 1), (none.Total, none.Retired));
        Assert.Equal(6, rows.Sum(r => r.Total));
    }

    [Fact]
    public async Task Warranty_report_includes_window_edges_and_skips_retired_and_expired()
    {
        var thirty = await (await _client.GetAsync("/api/reports/warranty-expiring?days=30")).ReadAsync<List<WarrantyExpiringRow>>();
        Assert.Equal(["ACC-0001", "ACC-0004"], thirty.Select(r => r.AssetTag).ToArray());
        Assert.Equal([10, 30], thirty.Select(r => r.DaysRemaining).ToArray());
        Assert.Equal("Pat Requester", thirty[0].AssignedTo);
        Assert.Equal("ENG 214", thirty[0].Location);
        Assert.Equal(new DateOnly(2026, 6, 25), thirty[0].WarrantyEndDate);

        var sixty = await (await _client.GetAsync("/api/reports/warranty-expiring?days=60")).ReadAsync<List<WarrantyExpiringRow>>();
        Assert.Equal(["ACC-0001", "ACC-0004", "ACC-0002"], sixty.Select(r => r.AssetTag).ToArray());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(731)]
    public async Task Warranty_report_rejects_out_of_range_days(int days)
    {
        var response = await _client.GetAsync($"/api/reports/warranty-expiring?days={days}");
        Assert.Equal(System.Net.HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.ReadAsync<Problem>();
        Assert.True(problem.Errors!.ContainsKey("days"));
    }

    [Fact]
    public async Task Open_requests_by_priority_lists_all_priorities()
    {
        var rows = await (await _client.GetAsync("/api/reports/open-tickets-by-priority")).ReadAsync<List<OpenTicketsByPriorityRow>>();
        Assert.Equal(["P1", "P2", "P3", "P4"], rows.Select(r => r.Priority).ToArray());
        Assert.Equal([1, 2, 1, 1], rows.Select(r => r.OpenCount).ToArray());
        Assert.Equal([1, 0, 0, 1], rows.Select(r => r.Unassigned).ToArray());
        Assert.Equal([0.1, 3.5, 40.0, 8.0], rows.Select(r => r.AvgAgeDays!.Value).ToArray());
    }

    [Fact]
    public async Task Ticket_aging_puts_each_open_request_in_one_bucket()
    {
        var rows = await (await _client.GetAsync("/api/reports/ticket-aging")).ReadAsync<List<TicketAgingRow>>();
        Assert.Equal(["Under 1 day", "1-3 days", "3-7 days", "7-30 days", "Over 30 days"], rows.Select(r => r.Bucket).ToArray());
        Assert.Equal([1, 1, 1, 1, 1], rows.Select(r => r.Count).ToArray());
    }

    [Fact]
    public async Task Resolution_time_is_averaged_per_category_in_hours()
    {
        var rows = await (await _client.GetAsync("/api/reports/resolution-time")).ReadAsync<List<ResolutionTimeRow>>();
        Assert.Equal(2, rows.Count);
        Assert.Equal("Hardware", rows[0].Category);
        Assert.Equal((1, 30.0), (rows[0].ResolvedCount, rows[0].AvgHoursToResolve));
        Assert.Equal("JackActivation", rows[1].Category);
        Assert.Equal((2, 4.0, 2.0, 6.0), (rows[1].ResolvedCount, rows[1].AvgHoursToResolve, rows[1].MinHoursToResolve, rows[1].MaxHoursToResolve));
    }

    [Fact]
    public async Task Jack_utilization_counts_patched_and_active_ports_per_switch()
    {
        var rows = await (await _client.GetAsync("/api/reports/jack-utilization")).ReadAsync<List<JackUtilizationRow>>();
        Assert.Equal(["ENG-IDF1-SW01", "LIB-IDF1-SW01"], rows.Select(r => r.SwitchName).ToArray());
        Assert.Equal((4, 3, 2, 75.0), (rows[0].AccessPorts, rows[0].PatchedPorts, rows[0].ActiveJacks, rows[0].UtilizationPercent));
        // LIB-IDF1-SW01 has 3 ports, but its uplink is not an access port, so only 2 count.
        Assert.Equal((2, 0, 0, 0.0), (rows[1].AccessPorts, rows[1].PatchedPorts, rows[1].ActiveJacks, rows[1].UtilizationPercent));
    }

    [Fact]
    public async Task Technician_workload_uses_a_30_day_window()
    {
        var rows = await (await _client.GetAsync("/api/reports/technician-workload")).ReadAsync<List<TechnicianWorkloadRow>>();
        Assert.Equal(["Alex Analyst", "Sam Support"], rows.Select(r => r.Technician).ToArray());
        Assert.Equal((2, 0, 1), (rows[0].OpenAssigned, rows[0].InProgress, rows[0].ResolvedLast30Days));
        Assert.Equal((1, 1, 1), (rows[1].OpenAssigned, rows[1].InProgress, rows[1].ResolvedLast30Days));
    }

    [Fact]
    public async Task Dashboard_numbers_come_from_the_database()
    {
        var d = await (await _client.GetAsync("/api/dashboard")).ReadAsync<DashboardDto>();
        Assert.Equal(6, d.TotalAssets);
        Assert.Equal(2, d.AssetsByStatus.Single(s => s.Key == AssetStatus.Deployed).Count);
        Assert.Equal(2, d.WarrantyExpiring30Days);
        Assert.Equal(5, d.OpenRequests);
        Assert.Equal(1, d.OpenP1Requests);
        Assert.Equal(2, d.UnassignedOpenRequests);
        Assert.Equal(1, d.ResolvedLast7Days);
        Assert.Equal(18.0, d.AvgResolutionHoursLast30Days);
        Assert.Equal((5, 2, 1), (d.TotalJacks, d.ActiveJacks, d.FaultyJacks));
        Assert.Equal((6, 3), (d.AccessPorts, d.PatchedPorts)); // 7 ports in total; the uplink is excluded
        Assert.Equal(8, d.RequestsByStatus.Sum(s => s.Count));
        Assert.Equal(6, d.RecentRequests.Count);
        Assert.Equal("T1 activate jack 1-105A", d.RecentRequests[0].Title);
    }

    [Fact]
    public async Task Report_definitions_expose_the_sql_text()
    {
        var defs = await (await _client.GetAsync("/api/reports/definitions")).ReadAsync<List<ReportDefinitionDto>>();
        Assert.Equal(8, defs.Count);
        Assert.All(defs, d => Assert.Matches("^(SELECT|WITH) ", d.Sql));
        var warranty = Assert.Single(defs, d => d.Key == "warranty-expiring");
        Assert.Contains("{0}", warranty.Sql);
    }
}
