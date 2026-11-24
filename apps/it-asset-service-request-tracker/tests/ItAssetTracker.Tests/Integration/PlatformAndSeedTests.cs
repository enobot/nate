using System.Net;
using System.Text.Json;
using ItAssetTracker.Api.Contracts;
using ItAssetTracker.Api.Data;
using ItAssetTracker.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace ItAssetTracker.Tests.Integration;

public class PlatformTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Health_endpoint_checks_the_database()
    {
        var response = await _client.GetAsync("/api/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Unknown_api_path_returns_json_404_not_the_spa()
    {
        var response = await _client.GetAsync("/api/does-not-exist");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task OpenApi_document_is_served_in_development()
    {
        var response = await _client.GetAsync("/openapi/v1.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var paths = doc.RootElement.GetProperty("paths");
        Assert.True(paths.TryGetProperty("/api/assets", out _));
        Assert.True(paths.TryGetProperty("/api/jacks/{id}/activate", out _));
    }

    [Fact]
    public async Task Responses_carry_security_headers()
    {
        var response = await _client.GetAsync("/api/health");
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
        Assert.Contains("default-src 'self'", response.Headers.GetValues("Content-Security-Policy").Single());
    }

    [Fact]
    public async Task Enums_are_serialized_as_names()
    {
        var json = await _client.GetStringAsync("/api/assets?search=ACC-0001");
        Assert.Contains("\"status\":\"Deployed\"", json);
        Assert.Contains("\"type\":\"Laptop\"", json);
    }

    [Fact]
    public async Task Dates_are_returned_as_utc()
    {
        var json = await _client.GetStringAsync("/api/dashboard");
        Assert.Contains("\"asOf\":\"2026-06-15T12:00:00Z\"", json);
    }
}

/// <summary>Seeds the full fictional demo dataset into an empty database and checks it.</summary>
public class DemoSeedTests(EmptyDatabaseFactory factory) : IClassFixture<EmptyDatabaseFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Reset_endpoint_loads_deterministic_valid_demo_data()
    {
        var first = await _client.PostAsync("/api/demo/reset", null);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        await using (var db = factory.CreateDbContext())
        {
            Assert.Equal(DemoDataSeeder.AssetCount, await db.Assets.CountAsync());
            Assert.Equal(DemoDataSeeder.TicketCount, await db.ServiceRequests.CountAsync());
            Assert.Equal(6, await db.NetworkSwitches.CountAsync());
            Assert.Equal(216, await db.SwitchPorts.CountAsync());

            // Exactly one uplink per switch: its highest-numbered port, never patched to a jack.
            var uplinks = await db.SwitchPorts.Where(p => p.Role == PortRole.Uplink)
                .Select(p => new { p.SwitchId, p.PortNumber, HasJack = p.Jack != null })
                .ToListAsync();
            var lastPortBySwitch = await db.SwitchPorts.GroupBy(p => p.SwitchId)
                .Select(g => new { SwitchId = g.Key, Last = g.Max(p => p.PortNumber) })
                .ToDictionaryAsync(x => x.SwitchId, x => x.Last);
            Assert.Equal(6, uplinks.Count);
            Assert.Equal(6, uplinks.Select(u => u.SwitchId).Distinct().Count());
            Assert.All(uplinks, u => Assert.Equal(lastPortBySwitch[u.SwitchId], u.PortNumber));
            Assert.All(uplinks, u => Assert.False(u.HasJack));
            Assert.True(await db.NetworkJacks.CountAsync() > 100);
            Assert.True(await db.TicketEvents.CountAsync() > DemoDataSeeder.TicketCount);

            // Seed data must obey the same rules the API enforces.
            Assert.False(await db.Assets.AnyAsync(a => a.AssignedToPersonId != null && a.Status != AssetStatus.Deployed));
            Assert.False(await db.Assets.AnyAsync(a => a.Status == AssetStatus.Deployed && a.LocationId == null));
            Assert.False(await db.NetworkJacks.AnyAsync(j => j.Status == JackStatus.Active
                && (j.SwitchPort == null || j.SwitchPort.AdminStatus != PortAdminStatus.Enabled || j.SwitchPort.VlanId == null)));
            Assert.False(await db.NetworkJacks.AnyAsync(j => j.Status == JackStatus.Faulty && j.SwitchPortId != null));
            Assert.False(await db.ServiceRequests.AnyAsync(r => (r.Status == TicketStatus.Assigned || r.Status == TicketStatus.InProgress) && r.AssigneeId == null));
            Assert.False(await db.ServiceRequests.AnyAsync(r => (r.Status == TicketStatus.Resolved || r.Status == TicketStatus.Closed) && r.ResolvedAt == null));
            var latestEvent = await db.TicketEvents.MaxAsync(e => e.CreatedAt);
            Assert.True(latestEvent <= ApiFactory.FixedNow);
            Assert.All(await db.People.Select(p => p.Email).ToListAsync(), e => Assert.EndsWith("@" + DemoDataSeeder.EmailDomain, e));
        }

        var firstSnapshot = await SnapshotAsync();

        // A second reset must produce exactly the same data, including ids.
        Assert.Equal(HttpStatusCode.OK, (await _client.PostAsync("/api/demo/reset", null)).StatusCode);
        Assert.Equal(firstSnapshot, await SnapshotAsync());
    }

    [Fact]
    public async Task Every_report_runs_against_the_demo_data()
    {
        Assert.Equal(HttpStatusCode.OK, (await _client.PostAsync("/api/demo/reset", null)).StatusCode);
        foreach (var path in new[]
                 {
                     "assets-by-status", "assets-by-building", "warranty-expiring?days=365", "open-tickets-by-priority",
                     "ticket-aging", "resolution-time", "jack-utilization", "technician-workload"
                 })
        {
            var response = await _client.GetAsync($"/api/reports/{path}");
            Assert.True(response.IsSuccessStatusCode, $"{path} returned {(int)response.StatusCode}");
        }

        var dashboard = await (await _client.GetAsync("/api/dashboard")).ReadAsync<DashboardDto>();
        Assert.Equal(DemoDataSeeder.AssetCount, dashboard.TotalAssets);
        Assert.Equal(43, dashboard.OpenRequests); // 10 New + 12 Assigned + 15 InProgress + 6 Reopened
    }

    private async Task<string> SnapshotAsync()
    {
        await using var db = factory.CreateDbContext();
        var assets = await db.Assets.OrderBy(a => a.Id).Select(a => $"{a.Id}|{a.AssetTag}|{a.SerialNumber}|{a.Status}|{a.LocationId}|{a.AssignedToPersonId}").ToListAsync();
        var tickets = await db.ServiceRequests.OrderBy(r => r.Id).Select(r => $"{r.Id}|{r.Title}|{r.Status}|{r.Priority}|{r.AssigneeId}|{r.CreatedAt:O}").ToListAsync();
        var jacks = await db.NetworkJacks.OrderBy(j => j.Id).Select(j => $"{j.Id}|{j.Label}|{j.Status}|{j.SwitchPortId}").ToListAsync();
        return string.Join("\n", assets.Concat(tickets).Concat(jacks));
    }
}
