using ItAssetTracker.Api.Domain;
using ItAssetTracker.Api.Domain.Rules;

namespace ItAssetTracker.Tests.Unit;

public class NetworkRulesTests
{
    [Theory]
    [InlineData(1, true)]
    [InlineData(10, true)]
    [InlineData(4094, true)]
    [InlineData(0, false)]
    [InlineData(4095, false)]
    [InlineData(-1, false)]
    [InlineData(10000, false)]
    public void Vlan_ids_must_be_between_1_and_4094(int vlanId, bool valid)
    {
        Assert.Equal(valid, NetworkRules.IsValidVlanId(vlanId));
        if (valid)
        {
            NetworkRules.EnsureValidVlanId(vlanId);
        }
        else
        {
            var ex = Assert.Throws<BusinessRuleException>(() => NetworkRules.EnsureValidVlanId(vlanId));
            Assert.True(ex.Errors.ContainsKey("vlanId"));
        }
    }

    [Theory]
    [InlineData("10.20.30.2", true)]
    [InlineData("10.0.0.0", true)]
    [InlineData("172.16.0.1", true)]
    [InlineData("172.31.255.254", true)]
    [InlineData("192.168.1.10", true)]
    [InlineData("172.15.0.1", false)]
    [InlineData("172.32.0.1", false)]
    [InlineData("192.169.1.1", false)]
    [InlineData("8.8.8.8", false)]
    [InlineData("10.1", false)]
    [InlineData("10.1.1.256", false)]
    [InlineData("10.1.1.1.1", false)]
    [InlineData("::1", false)]
    [InlineData("abc", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void Management_ip_must_be_private_ipv4(string? ip, bool valid)
    {
        Assert.Equal(valid, NetworkRules.IsPrivateIPv4(ip));
    }

    private static NetworkJack Jack(int id, JackStatus status = JackStatus.Inactive, int? portId = null) =>
        new() { Id = id, Label = $"2-214{(char)('A' + id)}", Status = status, SwitchPortId = portId };

    private static SwitchPort Port(int id, PortAdminStatus status = PortAdminStatus.Enabled, int? vlan = 10, PortRole role = PortRole.Access) =>
        new() { Id = id, PortName = $"1/1/{id}", AdminStatus = status, VlanId = vlan, Role = role };

    [Fact]
    public void Jack_cannot_be_patched_into_an_uplink_port()
    {
        var uplink = Port(24, vlan: 99, role: PortRole.Uplink);
        var ex = Assert.Throws<ConflictException>(() => NetworkRules.EnsureCanPatch(Jack(1), uplink, portOccupiedByJackId: null));
        Assert.Contains("uplink", ex.Message);
    }

    [Fact]
    public void Uplink_port_cannot_be_disabled_or_moved_to_another_vlan()
    {
        var uplink = Port(24, vlan: 99, role: PortRole.Uplink);
        Assert.Throws<ConflictException>(() => NetworkRules.EnsureUplinkUnchanged(uplink, PortAdminStatus.Disabled, 99));
        Assert.Throws<ConflictException>(() => NetworkRules.EnsureUplinkUnchanged(uplink, PortAdminStatus.Enabled, 10));
        Assert.Throws<ConflictException>(() => NetworkRules.EnsureUplinkUnchanged(uplink, PortAdminStatus.Enabled, null));

        // Keeping status and VLAN the same (for example editing only the description) is allowed.
        NetworkRules.EnsureUplinkUnchanged(uplink, PortAdminStatus.Enabled, 99);
    }

    [Fact]
    public void Uplink_rule_does_not_affect_access_ports()
    {
        NetworkRules.EnsureUplinkUnchanged(Port(5), PortAdminStatus.Disabled, null);
    }

    [Fact]
    public void Free_jack_can_be_patched_to_free_port()
    {
        NetworkRules.EnsureCanPatch(Jack(1), Port(5), portOccupiedByJackId: null);
    }

    [Fact]
    public void Patching_the_same_jack_to_the_same_port_again_is_allowed()
    {
        NetworkRules.EnsureCanPatch(Jack(1, portId: 5), Port(5), portOccupiedByJackId: 1);
    }

    [Fact]
    public void Port_with_another_jack_is_rejected()
    {
        var ex = Assert.Throws<ConflictException>(() => NetworkRules.EnsureCanPatch(Jack(1), Port(5), portOccupiedByJackId: 2));
        Assert.Contains("already has a jack", ex.Message);
    }

    [Fact]
    public void Jack_already_on_another_port_is_rejected()
    {
        var ex = Assert.Throws<ConflictException>(() => NetworkRules.EnsureCanPatch(Jack(1, portId: 4), Port(5), portOccupiedByJackId: null));
        Assert.Contains("already patched", ex.Message);
    }

    [Fact]
    public void Faulty_jack_cannot_be_patched()
    {
        Assert.Throws<ConflictException>(() => NetworkRules.EnsureCanPatch(Jack(1, JackStatus.Faulty), Port(5), null));
    }

    [Fact]
    public void Active_jack_needs_a_patched_enabled_port_with_a_vlan()
    {
        Assert.Throws<BusinessRuleException>(() => NetworkRules.EnsureCanBeActive(Jack(1), null));
        Assert.Throws<BusinessRuleException>(() => NetworkRules.EnsureCanBeActive(Jack(1), Port(5, PortAdminStatus.Disabled)));
        Assert.Throws<BusinessRuleException>(() => NetworkRules.EnsureCanBeActive(Jack(1), Port(5, vlan: null)));
        NetworkRules.EnsureCanBeActive(Jack(1), Port(5));
    }

    [Fact]
    public void Port_serving_an_active_jack_cannot_be_disabled_or_lose_its_vlan()
    {
        var port = Port(5);
        var active = Jack(1, JackStatus.Active, 5);
        Assert.Throws<ConflictException>(() => NetworkRules.EnsurePortChangeKeepsJackWorking(port, active, PortAdminStatus.Disabled, 10));
        Assert.Throws<ConflictException>(() => NetworkRules.EnsurePortChangeKeepsJackWorking(port, active, PortAdminStatus.Enabled, null));
        NetworkRules.EnsurePortChangeKeepsJackWorking(port, active, PortAdminStatus.Enabled, 20);
    }

    [Fact]
    public void Port_with_inactive_jack_or_no_jack_can_be_disabled()
    {
        NetworkRules.EnsurePortChangeKeepsJackWorking(Port(5), Jack(1, JackStatus.Inactive, 5), PortAdminStatus.Disabled, null);
        NetworkRules.EnsurePortChangeKeepsJackWorking(Port(5), null, PortAdminStatus.Disabled, null);
    }

    [Theory]
    [InlineData(1, "1/1/1")]
    [InlineData(48, "1/1/48")]
    public void Port_names_use_chassis_slot_port_notation(int number, string expected)
    {
        Assert.Equal(expected, NetworkRules.PortName(number));
    }
}
