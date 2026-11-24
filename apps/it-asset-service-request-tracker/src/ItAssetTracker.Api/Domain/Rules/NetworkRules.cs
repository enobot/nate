using System.Net;
using System.Net.Sockets;

namespace ItAssetTracker.Api.Domain.Rules;

/// <summary>Rules for VLANs, switch management addresses, ports and jack patching.</summary>
public static class NetworkRules
{
    public const int MinVlanId = 1;
    public const int MaxVlanId = 4094;

    /// <summary>802.1Q VLAN IDs 0 and 4095 are reserved, so usable IDs are 1-4094.</summary>
    public static bool IsValidVlanId(int vlanId) => vlanId is >= MinVlanId and <= MaxVlanId;

    public static void EnsureValidVlanId(int vlanId, string field = "vlanId")
    {
        if (!IsValidVlanId(vlanId))
        {
            throw new BusinessRuleException(field, $"VLAN ID must be between {MinVlanId} and {MaxVlanId}.");
        }
    }

    /// <summary>
    /// Management addresses must be dotted-quad IPv4 in an RFC 1918 private range:
    /// 10.0.0.0/8, 172.16.0.0/12 or 192.168.0.0/16.
    /// </summary>
    public static bool IsPrivateIPv4(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var parts = value.Split('.');
        if (parts.Length != 4 || parts.Any(p => p.Length is 0 or > 3 || !p.All(char.IsAsciiDigit)))
        {
            // IPAddress.TryParse also accepts short forms like "10.1", so check the shape first.
            return false;
        }

        if (!IPAddress.TryParse(value, out var address) || address.AddressFamily != AddressFamily.InterNetwork)
        {
            return false;
        }

        var b = address.GetAddressBytes();
        return b[0] == 10
            || (b[0] == 172 && b[1] >= 16 && b[1] <= 31)
            || (b[0] == 192 && b[1] == 168);
    }

    /// <summary>Checks whether <paramref name="jack"/> may be patched to <paramref name="port"/>.</summary>
    /// <param name="portOccupiedByJackId">Id of the jack already on the port, if any.</param>
    public static void EnsureCanPatch(NetworkJack jack, SwitchPort port, int? portOccupiedByJackId)
    {
        if (port.Role == PortRole.Uplink)
        {
            throw new ConflictException($"Port {port.PortName} is the switch's uplink to the core network. Patching a wall jack into it would cut the switch off. Choose an access port.");
        }

        if (jack.Status == JackStatus.Faulty)
        {
            throw new ConflictException($"Jack {jack.Label} is marked faulty. Repair it and set it to Inactive before patching.");
        }

        if (jack.SwitchPortId is not null && jack.SwitchPortId != port.Id)
        {
            throw new ConflictException($"Jack {jack.Label} is already patched to another port. Unpatch it first.");
        }

        if (portOccupiedByJackId is not null && portOccupiedByJackId != jack.Id)
        {
            throw new ConflictException($"Port {port.PortName} already has a jack patched to it.");
        }
    }

    /// <summary>An active jack must be patched to an enabled port that has a VLAN.</summary>
    public static void EnsureCanBeActive(NetworkJack jack, SwitchPort? port)
    {
        if (port is null)
        {
            throw new BusinessRuleException("status", $"Jack {jack.Label} must be patched to a switch port before it can be Active.");
        }

        if (port.AdminStatus != PortAdminStatus.Enabled)
        {
            throw new BusinessRuleException("status", $"Port {port.PortName} is disabled. Enable it before activating the jack.");
        }

        if (port.VlanId is null)
        {
            throw new BusinessRuleException("status", $"Port {port.PortName} has no VLAN. Assign a VLAN before activating the jack.");
        }
    }

    /// <summary>
    /// Uplink ports keep their VLAN and stay enabled: disabling one, or moving it to another VLAN,
    /// would disconnect every user on the switch. Only the description can be edited here.
    /// </summary>
    public static void EnsureUplinkUnchanged(SwitchPort port, PortAdminStatus newStatus, int? newVlanId)
    {
        if (port.Role != PortRole.Uplink)
        {
            return;
        }

        if (newStatus != PortAdminStatus.Enabled)
        {
            throw new ConflictException($"Port {port.PortName} is the uplink to the core network and cannot be disabled here.");
        }

        if (newVlanId != port.VlanId)
        {
            throw new ConflictException($"Port {port.PortName} is the uplink to the core network. Its VLAN cannot be changed here.");
        }
    }

    /// <summary>Stops a port change that would leave an active jack without service.</summary>
    public static void EnsurePortChangeKeepsJackWorking(SwitchPort port, NetworkJack? patchedJack, PortAdminStatus newStatus, int? newVlanId)
    {
        if (patchedJack?.Status != JackStatus.Active)
        {
            return;
        }

        if (newStatus == PortAdminStatus.Disabled)
        {
            throw new ConflictException($"Port {port.PortName} serves active jack {patchedJack.Label}. Deactivate the jack before disabling the port.");
        }

        if (newVlanId is null)
        {
            throw new ConflictException($"Port {port.PortName} serves active jack {patchedJack.Label}. It must keep a VLAN.");
        }
    }

    public static string PortName(int portNumber) => $"1/1/{portNumber}";
}
