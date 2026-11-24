using System.Net;
using ItAssetTracker.Api.Contracts;
using ItAssetTracker.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace ItAssetTracker.Tests.Integration;

public class NetworkApiTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    private async Task<int> RoomAsync(string room)
    {
        await using var db = factory.CreateDbContext();
        return (await db.Locations.SingleAsync(l => l.Room == room)).Id;
    }

    private async Task<SwitchDetailDto> CreateSwitchAsync(string name, string ip, int ports = 4)
    {
        var response = await _client.PostJsonAsync("/api/switches", new { name, model = "Test switch", managementIp = ip, locationId = await RoomAsync("IDF1"), portCount = ports });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadAsync<SwitchDetailDto>();
    }

    private async Task<JackDto> CreateJackAsync(string label, string room = "214", string status = "Inactive")
    {
        var response = await _client.PostJsonAsync("/api/jacks", new { label, locationId = await RoomAsync(room), type = "Data", status });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadAsync<JackDto>();
    }

    [Fact]
    public async Task Creating_a_switch_creates_its_ports_disabled()
    {
        var sw = await CreateSwitchAsync("eng-idf2-sw01", "10.20.40.10", ports: 6);
        Assert.Equal("ENG-IDF2-SW01", sw.Name);
        Assert.Equal(["1/1/1", "1/1/2", "1/1/3", "1/1/4", "1/1/5", "1/1/6"], sw.Ports.Select(p => p.PortName).ToArray());
        Assert.All(sw.Ports, p => Assert.Equal(PortAdminStatus.Disabled, p.AdminStatus));
    }

    [Theory]
    [InlineData("8.8.8.8")]
    [InlineData("10.1")]
    [InlineData("not-an-ip")]
    public async Task Switch_management_ip_must_be_private(string ip)
    {
        var response = await _client.PostJsonAsync("/api/switches", new { name = "BAD-IP-SW", model = "X", managementIp = ip, locationId = await RoomAsync("IDF1"), portCount = 2 });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True((await response.ReadAsync<Problem>()).Errors!.ContainsKey("managementIp"));
    }

    [Fact]
    public async Task Duplicate_switch_ip_returns_409()
    {
        var response = await _client.PostJsonAsync("/api/switches", new { name = "DUP-IP-SW", model = "X", managementIp = "10.20.40.2", locationId = await RoomAsync("IDF1"), portCount = 2 });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(4095)]
    [InlineData(-5)]
    public async Task Port_vlan_outside_1_to_4094_is_rejected(int vlan)
    {
        var octet = Math.Abs(vlan) % 200 + 10; // 0 -> 10, 4095 -> 105, -5 -> 15
        var sw = await CreateSwitchAsync($"VLAN-RANGE-{octet}", $"10.99.{octet}.1", ports: 1);
        var response = await _client.PutJsonAsync($"/api/ports/{sw.Ports[0].Id}", new { vlanId = vlan, adminStatus = "Enabled" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True((await response.ReadAsync<Problem>()).Errors!.ContainsKey("vlanId"));
    }

    [Fact]
    public async Task Port_vlan_must_be_defined()
    {
        var sw = await CreateSwitchAsync("VLAN-UNDEF-SW", "10.99.1.1", ports: 1);
        var response = await _client.PutJsonAsync($"/api/ports/{sw.Ports[0].Id}", new { vlanId = 300, adminStatus = "Enabled" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var ok = await _client.PutJsonAsync($"/api/ports/{sw.Ports[0].Id}", new { vlanId = 20, adminStatus = "Enabled", description = "Phone" });
        var port = await ok.ReadAsync<SwitchPortDto>();
        Assert.Equal((20, "VOICE", PortAdminStatus.Enabled), (port.VlanId, port.VlanName, port.AdminStatus));
    }

    [Fact]
    public async Task Vlan_create_validates_range_and_duplicates()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await _client.PostJsonAsync("/api/vlans", new { vlanId = 4095, name = "TOO-HIGH" })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await _client.PostJsonAsync("/api/vlans", new { vlanId = 4094, name = "edge-test" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await _client.PostJsonAsync("/api/vlans", new { vlanId = 4094, name = "OTHER" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await _client.PostJsonAsync("/api/vlans", new { vlanId = 4000, name = "EDGE-TEST" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync("/api/vlans/4094")).StatusCode);
    }

    [Fact]
    public async Task Vlan_in_use_cannot_be_deleted()
    {
        Assert.Equal(HttpStatusCode.Conflict, (await _client.DeleteAsync("/api/vlans/10")).StatusCode);
    }

    [Fact]
    public async Task Activate_patches_sets_vlan_enables_port_and_marks_jack_active()
    {
        var sw = await CreateSwitchAsync("ACTIVATE-SW", "10.99.2.1", ports: 2);
        var jack = await CreateJackAsync("2-214F");

        var response = await _client.PostJsonAsync($"/api/jacks/{jack.Id}/activate", new { switchPortId = sw.Ports[0].Id, vlanId = 10 });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var active = await response.ReadAsync<JackDto>();
        Assert.Equal((JackStatus.Active, "ACTIVATE-SW", "1/1/1", (int?)10), (active.Status, active.SwitchName, active.PortName, active.VlanId));

        var detail = await (await _client.GetAsync($"/api/switches/{sw.Id}")).ReadAsync<SwitchDetailDto>();
        var port = detail.Ports[0];
        Assert.Equal((PortAdminStatus.Enabled, (int?)10, "2-214F"), (port.AdminStatus, port.VlanId, port.Jack?.Label));

        // Disabling or clearing the VLAN on a port that serves an active jack is blocked.
        Assert.Equal(HttpStatusCode.Conflict, (await _client.PutJsonAsync($"/api/ports/{port.Id}", new { vlanId = 10, adminStatus = "Disabled" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await _client.PutJsonAsync($"/api/ports/{port.Id}", new { vlanId = (int?)null, adminStatus = "Enabled" })).StatusCode);

        // Unpatching drops the jack to Inactive because it no longer has service.
        var unpatched = await (await _client.PostAsync($"/api/jacks/{jack.Id}/unpatch", null)).ReadAsync<JackDto>();
        Assert.Equal((JackStatus.Inactive, (int?)null), (unpatched.Status, unpatched.SwitchPortId));

        // Unpatching again is harmless (safe to retry).
        Assert.Equal(HttpStatusCode.OK, (await _client.PostAsync($"/api/jacks/{jack.Id}/unpatch", null)).StatusCode);
    }

    [Fact]
    public async Task A_port_can_only_have_one_jack()
    {
        var sw = await CreateSwitchAsync("ONE-JACK-SW", "10.99.3.1", ports: 1);
        var first = await CreateJackAsync("2-214G");
        var second = await CreateJackAsync("2-214H");

        Assert.Equal(HttpStatusCode.OK, (await _client.PostJsonAsync($"/api/jacks/{first.Id}/patch", new { switchPortId = sw.Ports[0].Id })).StatusCode);
        var clash = await _client.PostJsonAsync($"/api/jacks/{second.Id}/patch", new { switchPortId = sw.Ports[0].Id });
        Assert.Equal(HttpStatusCode.Conflict, clash.StatusCode);
        Assert.Contains("already has a jack", (await clash.ReadAsync<Problem>()).Detail);

        // Repeating the same patch (double-click) is a no-op, not an error.
        Assert.Equal(HttpStatusCode.OK, (await _client.PostJsonAsync($"/api/jacks/{first.Id}/patch", new { switchPortId = sw.Ports[0].Id })).StatusCode);
    }

    [Fact]
    public async Task A_jack_cannot_be_patched_to_two_ports()
    {
        var sw = await CreateSwitchAsync("TWO-PORT-SW", "10.99.4.1", ports: 2);
        var jack = await CreateJackAsync("2-214J");

        Assert.Equal(HttpStatusCode.OK, (await _client.PostJsonAsync($"/api/jacks/{jack.Id}/patch", new { switchPortId = sw.Ports[0].Id })).StatusCode);
        var second = await _client.PostJsonAsync($"/api/jacks/{jack.Id}/patch", new { switchPortId = sw.Ports[1].Id });
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Contains("already patched", (await second.ReadAsync<Problem>()).Detail);
    }

    [Fact]
    public async Task Database_index_also_blocks_two_jacks_on_one_port()
    {
        await using var db = factory.CreateDbContext();
        var takenPortId = await db.NetworkJacks.Where(j => j.Label == "2-214A").Select(j => j.SwitchPortId).SingleAsync();
        var other = await db.NetworkJacks.SingleAsync(j => j.Label == "1-105A");
        other.SwitchPortId = takenPortId;
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Faulty_jack_cannot_be_patched_or_activated()
    {
        await using var db = factory.CreateDbContext();
        var faulty = await db.NetworkJacks.SingleAsync(j => j.Label == "1-105B");
        var freePort = await db.SwitchPorts.Where(p => p.Switch!.Name == "LIB-IDF1-SW01" && p.Role == PortRole.Access)
            .OrderBy(p => p.PortNumber).Select(p => p.Id).FirstAsync();

        Assert.Equal(HttpStatusCode.Conflict, (await _client.PostJsonAsync($"/api/jacks/{faulty.Id}/patch", new { switchPortId = freePort })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await _client.PostJsonAsync($"/api/jacks/{faulty.Id}/activate", new { switchPortId = freePort, vlanId = 10 })).StatusCode);
    }

    [Fact]
    public async Task Jack_cannot_be_set_active_without_a_working_port()
    {
        var jack = await CreateJackAsync("2-214K");
        var response = await _client.PutJsonAsync($"/api/jacks/{jack.Id}", new { label = "2-214K", locationId = jack.LocationId, type = "Data", status = "Active" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var createActive = await _client.PostJsonAsync("/api/jacks", new { label = "2-214L", locationId = jack.LocationId, type = "Data", status = "Active" });
        Assert.Equal(HttpStatusCode.BadRequest, createActive.StatusCode);
    }

    [Fact]
    public async Task Duplicate_jack_label_in_same_room_returns_409()
    {
        var response = await _client.PostJsonAsync("/api/jacks", new { label = "2-214a", locationId = await RoomAsync("214"), type = "Data", status = "Inactive" });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Patched_jack_and_switch_with_jacks_cannot_be_deleted()
    {
        await using var db = factory.CreateDbContext();
        var patched = await db.NetworkJacks.SingleAsync(j => j.Label == "2-214B");
        var eng = await db.NetworkSwitches.SingleAsync(s => s.Name == "ENG-IDF1-SW01");

        Assert.Equal(HttpStatusCode.Conflict, (await _client.DeleteAsync($"/api/jacks/{patched.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await _client.DeleteAsync($"/api/switches/{eng.Id}")).StatusCode);
    }

    [Fact]
    public async Task Jack_list_filters_by_status_and_patched()
    {
        var faulty = await (await _client.GetAsync("/api/jacks?status=Faulty")).ReadAsync<PagedResult<JackDto>>();
        Assert.Equal("1-105B", Assert.Single(faulty.Items).Label);

        var unpatchedLib = await (await _client.GetAsync("/api/jacks?building=LIB&patched=false")).ReadAsync<PagedResult<JackDto>>();
        Assert.Equal(["1-105A", "1-105B"], unpatchedLib.Items.Select(j => j.Label).ToArray());

        var bySwitch = await (await _client.GetAsync("/api/jacks?search=ENG-IDF1")).ReadAsync<PagedResult<JackDto>>();
        Assert.True(bySwitch.TotalCount >= 3);
    }

    [Fact]
    public async Task Switch_list_shows_port_and_jack_counts()
    {
        var switches = await (await _client.GetAsync("/api/switches")).ReadAsync<List<SwitchSummaryDto>>();
        var eng = Assert.Single(switches, s => s.Name == "ENG-IDF1-SW01");
        Assert.Equal((4, 4, 2, 3), (eng.PortCount, eng.AccessPorts, eng.EnabledPorts, eng.PatchedPorts));
        var lib = Assert.Single(switches, s => s.Name == "LIB-IDF1-SW01");
        Assert.Equal((3, 2), (lib.PortCount, lib.AccessPorts));
    }

    private async Task<(int SwitchId, int UplinkPortId)> LibUplinkAsync()
    {
        await using var db = factory.CreateDbContext();
        var uplink = await db.SwitchPorts.SingleAsync(p => p.Switch!.Name == "LIB-IDF1-SW01" && p.Role == PortRole.Uplink);
        return (uplink.SwitchId, uplink.Id);
    }

    [Fact]
    public async Task Patching_or_activating_a_jack_on_an_uplink_port_returns_409()
    {
        var (_, uplinkId) = await LibUplinkAsync();
        var jack = await CreateJackAsync("2-214U"); // ENG room, so the LIB jack-list test is unaffected

        var patch = await _client.PostJsonAsync($"/api/jacks/{jack.Id}/patch", new { switchPortId = uplinkId });
        Assert.Equal(HttpStatusCode.Conflict, patch.StatusCode);
        Assert.Equal("application/problem+json", patch.Content.Headers.ContentType?.MediaType);
        Assert.Contains("uplink", (await patch.ReadAsync<Problem>()).Detail);

        var activate = await _client.PostJsonAsync($"/api/jacks/{jack.Id}/activate", new { switchPortId = uplinkId, vlanId = 10 });
        Assert.Equal(HttpStatusCode.Conflict, activate.StatusCode);

        // Nothing changed: the jack is still unpatched.
        var after = await (await _client.GetAsync($"/api/jacks/{jack.Id}")).ReadAsync<JackDto>();
        Assert.Equal((JackStatus.Inactive, (int?)null), (after.Status, after.SwitchPortId));
    }

    [Fact]
    public async Task Free_ports_lists_only_unpatched_access_ports()
    {
        var (libId, uplinkId) = await LibUplinkAsync();
        var libFree = await (await _client.GetAsync($"/api/switches/{libId}/free-ports")).ReadAsync<List<SwitchPortDto>>();
        Assert.Equal(["1/1/1", "1/1/2"], libFree.Select(p => p.PortName).ToArray());
        Assert.DoesNotContain(libFree, p => p.Id == uplinkId);
        Assert.All(libFree, p => Assert.Equal(PortRole.Access, p.Role));

        // ENG ports 1/1/1-1/1/3 have jacks in the fixture, so they must never be offered.
        await using var db = factory.CreateDbContext();
        var engId = await db.NetworkSwitches.Where(s => s.Name == "ENG-IDF1-SW01").Select(s => s.Id).SingleAsync();
        var engFree = await (await _client.GetAsync($"/api/switches/{engId}/free-ports")).ReadAsync<List<SwitchPortDto>>();
        Assert.DoesNotContain(engFree, p => p.PortName is "1/1/1" or "1/1/2" or "1/1/3");

        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync("/api/switches/999999/free-ports")).StatusCode);
    }

    [Fact]
    public async Task Uplink_port_cannot_be_disabled_or_revlanned_but_description_can_change()
    {
        var (libId, uplinkId) = await LibUplinkAsync();
        Assert.Equal(HttpStatusCode.Conflict, (await _client.PutJsonAsync($"/api/ports/{uplinkId}", new { vlanId = 10, adminStatus = "Disabled" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await _client.PutJsonAsync($"/api/ports/{uplinkId}", new { vlanId = 20, adminStatus = "Enabled" })).StatusCode);

        var ok = await _client.PutJsonAsync($"/api/ports/{uplinkId}", new { vlanId = 10, adminStatus = "Enabled", description = "Uplink to core (fiber 2)" });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var port = await ok.ReadAsync<SwitchPortDto>();
        Assert.Equal((PortRole.Uplink, PortAdminStatus.Enabled, (int?)10, "Uplink to core (fiber 2)"), (port.Role, port.AdminStatus, port.VlanId, port.Description));

        var detail = await (await _client.GetAsync($"/api/switches/{libId}")).ReadAsync<SwitchDetailDto>();
        Assert.Equal(PortRole.Uplink, detail.Ports.Single(p => p.Id == uplinkId).Role);
    }
}
