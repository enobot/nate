using ItAssetTracker.Api.Contracts;
using ItAssetTracker.Api.Data;
using ItAssetTracker.Api.Domain;
using ItAssetTracker.Api.Domain.Rules;
using ItAssetTracker.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace ItAssetTracker.Api.Services;

/// <summary>Switches, ports, VLANs and wall jacks, including the patch / activate workflow.</summary>
public sealed class NetworkService(AppDbContext db)
{
    // ---------- VLANs ----------

    public async Task<IReadOnlyList<VlanDto>> ListVlansAsync(CancellationToken ct) =>
        await db.Vlans.AsNoTracking()
            .OrderBy(v => v.VlanId)
            .Select(v => new VlanDto(v.VlanId, v.Name, v.Description, db.SwitchPorts.Count(p => p.VlanId == v.VlanId)))
            .ToListAsync(ct);

    public async Task<VlanDto> CreateVlanAsync(CreateVlanRequest req, CancellationToken ct)
    {
        var id = req.VlanId!.Value;
        NetworkRules.EnsureValidVlanId(id);
        var name = req.Name.Trim().ToUpperInvariant();

        if (await db.Vlans.AnyAsync(v => v.VlanId == id, ct))
        {
            throw new ConflictException($"VLAN {id} already exists.");
        }

        if (await db.Vlans.AnyAsync(v => v.Name == name, ct))
        {
            throw new ConflictException($"A VLAN named {name} already exists.");
        }

        var vlan = new Vlan { VlanId = id, Name = name, Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim() };
        db.Vlans.Add(vlan);
        await db.SaveChangesAsync(ct);
        return new VlanDto(vlan.VlanId, vlan.Name, vlan.Description, 0);
    }

    public async Task DeleteVlanAsync(int vlanId, CancellationToken ct)
    {
        var vlan = await db.Vlans.FirstOrDefaultAsync(v => v.VlanId == vlanId, ct)
            ?? throw new NotFoundException($"VLAN {vlanId} was not found.");

        var ports = await db.SwitchPorts.CountAsync(p => p.VlanId == vlanId, ct);
        if (ports > 0)
        {
            throw new ConflictException($"VLAN {vlanId} is assigned to {ports} port(s). Move those ports to another VLAN first.");
        }

        db.Vlans.Remove(vlan);
        await db.SaveChangesAsync(ct);
    }

    // ---------- Switches and ports ----------

    public async Task<IReadOnlyList<SwitchSummaryDto>> ListSwitchesAsync(CancellationToken ct) =>
        await db.NetworkSwitches.AsNoTracking()
            .OrderBy(s => s.Name)
            .Select(s => new SwitchSummaryDto(
                s.Id, s.Name, s.Model, s.ManagementIp, s.LocationId,
                s.Location!.BuildingCode + " " + s.Location.Room,
                s.Location.Building,
                s.Ports.Count,
                s.Ports.Count(p => p.Role == PortRole.Access),
                s.Ports.Count(p => p.AdminStatus == PortAdminStatus.Enabled),
                s.Ports.Count(p => p.Jack != null),
                s.Ports.Count(p => p.Jack != null && p.Jack.Status == JackStatus.Active)))
            .ToListAsync(ct);

    public async Task<SwitchDetailDto> GetSwitchAsync(int id, CancellationToken ct)
    {
        var sw = await db.NetworkSwitches.AsNoTracking()
            .Include(s => s.Location)
            .FirstOrDefaultAsync(s => s.Id == id, ct)
            ?? throw new NotFoundException($"Switch {id} was not found.");

        var ports = await db.SwitchPorts.AsNoTracking()
            .Where(p => p.SwitchId == id)
            .OrderBy(p => p.PortNumber)
            .Select(p => new SwitchPortDto(
                p.Id, p.SwitchId, p.PortName, p.PortNumber, p.VlanId,
                p.Vlan != null ? p.Vlan.Name : null,
                p.AdminStatus, p.Role, p.Description,
                p.Jack == null ? null : new PortJackDto(
                    p.Jack.Id, p.Jack.Label, p.Jack.Location!.BuildingCode + " " + p.Jack.Location.Room, p.Jack.JackType, p.Jack.Status)))
            .ToListAsync(ct);

        return new SwitchDetailDto(sw.Id, sw.Name, sw.Model, sw.ManagementIp, sw.LocationId, sw.Location!.DisplayName, sw.Location.Building, ports);
    }

    public async Task<SwitchDetailDto> CreateSwitchAsync(CreateSwitchRequest req, CancellationToken ct)
    {
        var name = req.Name.Trim().ToUpperInvariant();
        var ip = req.ManagementIp.Trim();
        await ValidateSwitchAsync(name, ip, req.LocationId!.Value, excludeId: null, ct);

        var sw = new NetworkSwitch { Name = name, Model = req.Model.Trim(), ManagementIp = ip, LocationId = req.LocationId.Value };
        for (var n = 1; n <= req.PortCount!.Value; n++)
        {
            sw.Ports.Add(new SwitchPort { PortNumber = n, PortName = NetworkRules.PortName(n), AdminStatus = PortAdminStatus.Disabled });
        }

        db.NetworkSwitches.Add(sw);
        await db.SaveChangesAsync(ct);
        return await GetSwitchAsync(sw.Id, ct);
    }

    public async Task<SwitchDetailDto> UpdateSwitchAsync(int id, UpdateSwitchRequest req, CancellationToken ct)
    {
        var sw = await db.NetworkSwitches.FirstOrDefaultAsync(s => s.Id == id, ct)
            ?? throw new NotFoundException($"Switch {id} was not found.");

        var name = req.Name.Trim().ToUpperInvariant();
        var ip = req.ManagementIp.Trim();
        await ValidateSwitchAsync(name, ip, req.LocationId!.Value, excludeId: id, ct);

        sw.Name = name;
        sw.Model = req.Model.Trim();
        sw.ManagementIp = ip;
        sw.LocationId = req.LocationId.Value;
        await db.SaveChangesAsync(ct);
        return await GetSwitchAsync(id, ct);
    }

    public async Task DeleteSwitchAsync(int id, CancellationToken ct)
    {
        var sw = await db.NetworkSwitches.FirstOrDefaultAsync(s => s.Id == id, ct)
            ?? throw new NotFoundException($"Switch {id} was not found.");

        var patched = await db.NetworkJacks.CountAsync(j => j.SwitchPort != null && j.SwitchPort.SwitchId == id, ct);
        if (patched > 0)
        {
            throw new ConflictException($"{sw.Name} still has {patched} jack(s) patched to it. Unpatch them before removing the switch.");
        }

        db.NetworkSwitches.Remove(sw);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Access ports on the switch with no jack patched: the ports a technician can choose when
    /// patching or activating a jack. Uplink ports are never included.
    /// </summary>
    public async Task<IReadOnlyList<SwitchPortDto>> ListFreePortsAsync(int switchId, CancellationToken ct)
    {
        if (!await db.NetworkSwitches.AnyAsync(s => s.Id == switchId, ct))
        {
            throw new NotFoundException($"Switch {switchId} was not found.");
        }

        return await db.SwitchPorts.AsNoTracking()
            .Where(p => p.SwitchId == switchId && p.Role == PortRole.Access && p.Jack == null)
            .OrderBy(p => p.PortNumber)
            .Select(p => new SwitchPortDto(
                p.Id, p.SwitchId, p.PortName, p.PortNumber, p.VlanId,
                p.Vlan != null ? p.Vlan.Name : null, p.AdminStatus, p.Role, p.Description, null))
            .ToListAsync(ct);
    }

    public async Task<SwitchPortDto> UpdatePortAsync(int portId, UpdatePortRequest req, CancellationToken ct)
    {
        var port = await db.SwitchPorts.Include(p => p.Jack).FirstOrDefaultAsync(p => p.Id == portId, ct)
            ?? throw new NotFoundException($"Port {portId} was not found.");

        if (req.VlanId is { } vlanId)
        {
            NetworkRules.EnsureValidVlanId(vlanId);
            if (!await db.Vlans.AnyAsync(v => v.VlanId == vlanId, ct))
            {
                throw new BusinessRuleException("vlanId", $"VLAN {vlanId} is not defined. Add it on the VLANs tab first.");
            }
        }

        var status = req.AdminStatus!.Value;
        NetworkRules.EnsureUplinkUnchanged(port, status, req.VlanId);
        NetworkRules.EnsurePortChangeKeepsJackWorking(port, port.Jack, status, req.VlanId);

        port.VlanId = req.VlanId;
        port.AdminStatus = status;
        port.Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim();
        await db.SaveChangesAsync(ct);

        return await db.SwitchPorts.AsNoTracking()
            .Where(p => p.Id == portId)
            .Select(p => new SwitchPortDto(
                p.Id, p.SwitchId, p.PortName, p.PortNumber, p.VlanId,
                p.Vlan != null ? p.Vlan.Name : null, p.AdminStatus, p.Role, p.Description,
                p.Jack == null ? null : new PortJackDto(
                    p.Jack.Id, p.Jack.Label, p.Jack.Location!.BuildingCode + " " + p.Jack.Location.Room, p.Jack.JackType, p.Jack.Status)))
            .SingleAsync(ct);
    }

    private async Task ValidateSwitchAsync(string name, string ip, int locationId, int? excludeId, CancellationToken ct)
    {
        if (!NetworkRules.IsPrivateIPv4(ip))
        {
            throw new BusinessRuleException("managementIp", "Management IP must be a private IPv4 address (10.x.x.x, 172.16-31.x.x or 192.168.x.x).");
        }

        if (!await db.Locations.AnyAsync(l => l.Id == locationId, ct))
        {
            throw new BusinessRuleException("locationId", $"Location {locationId} does not exist.");
        }

        if (await db.NetworkSwitches.AnyAsync(s => s.Name == name && s.Id != excludeId, ct))
        {
            throw new ConflictException($"A switch named {name} already exists.");
        }

        if (await db.NetworkSwitches.AnyAsync(s => s.ManagementIp == ip && s.Id != excludeId, ct))
        {
            throw new ConflictException($"Management IP {ip} is already used by another switch.");
        }
    }

    // ---------- Jacks ----------

    public async Task<PagedResult<JackDto>> ListJacksAsync(JackQuery q, CancellationToken ct)
    {
        var (page, pageSize) = Paging.Normalize(q.Page, q.PageSize);
        IQueryable<NetworkJack> query = db.NetworkJacks.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var pattern = QueryHelpers.ContainsPattern(q.Search.Trim());
            var esc = QueryHelpers.LikeEscape.ToString();
            query = query.Where(j => EF.Functions.Like(j.Label, pattern, esc)
                || EF.Functions.Like(j.Location!.BuildingCode + " " + j.Location.Room, pattern, esc)
                || (j.SwitchPort != null && EF.Functions.Like(j.SwitchPort.Switch!.Name, pattern, esc)));
        }

        if (q.Status is { } status)
        {
            query = query.Where(j => j.Status == status);
        }

        if (q.Type is { } type)
        {
            query = query.Where(j => j.JackType == type);
        }

        if (!string.IsNullOrWhiteSpace(q.Building))
        {
            var code = q.Building.Trim().ToUpperInvariant();
            query = query.Where(j => j.Location!.BuildingCode == code);
        }

        if (q.Patched is { } patched)
        {
            query = patched ? query.Where(j => j.SwitchPortId != null) : query.Where(j => j.SwitchPortId == null);
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderBy(j => j.Location!.BuildingCode).ThenBy(j => j.Label)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(JackProjection)
            .ToListAsync(ct);

        return new PagedResult<JackDto>(items, total, page, pageSize);
    }

    public async Task<JackDto> GetJackAsync(int id, CancellationToken ct) =>
        await db.NetworkJacks.AsNoTracking().Where(j => j.Id == id).Select(JackProjection).FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException($"Jack {id} was not found.");

    public async Task<JackDto> CreateJackAsync(JackWriteRequest req, CancellationToken ct)
    {
        var label = req.Label.Trim().ToUpperInvariant();
        var locationId = req.LocationId!.Value;
        await EnsureJackLabelAvailableAsync(label, locationId, excludeId: null, ct);

        var status = req.Status!.Value;
        var jack = new NetworkJack { Label = label, LocationId = locationId, JackType = req.Type!.Value, Status = status, Notes = TrimToNull(req.Notes) };
        if (status == JackStatus.Active)
        {
            // A brand-new jack is never patched yet, so this always explains what to do instead.
            NetworkRules.EnsureCanBeActive(jack, null);
        }

        db.NetworkJacks.Add(jack);
        await db.SaveChangesAsync(ct);
        return await GetJackAsync(jack.Id, ct);
    }

    public async Task<JackDto> UpdateJackAsync(int id, JackWriteRequest req, CancellationToken ct)
    {
        var jack = await db.NetworkJacks.Include(j => j.SwitchPort).FirstOrDefaultAsync(j => j.Id == id, ct)
            ?? throw new NotFoundException($"Jack {id} was not found.");

        var label = req.Label.Trim().ToUpperInvariant();
        var locationId = req.LocationId!.Value;
        await EnsureJackLabelAvailableAsync(label, locationId, excludeId: id, ct);

        var status = req.Status!.Value;
        jack.Label = label;
        if (status == JackStatus.Active)
        {
            NetworkRules.EnsureCanBeActive(jack, jack.SwitchPort);
        }

        if (status == JackStatus.Faulty && jack.SwitchPortId is not null)
        {
            throw new ConflictException($"Jack {label} is patched to a switch port. Unpatch it before marking it faulty.");
        }

        jack.LocationId = locationId;
        jack.JackType = req.Type!.Value;
        jack.Status = status;
        jack.Notes = TrimToNull(req.Notes);
        await db.SaveChangesAsync(ct);
        return await GetJackAsync(id, ct);
    }

    public async Task DeleteJackAsync(int id, CancellationToken ct)
    {
        var jack = await db.NetworkJacks.FirstOrDefaultAsync(j => j.Id == id, ct)
            ?? throw new NotFoundException($"Jack {id} was not found.");

        if (jack.SwitchPortId is not null)
        {
            throw new ConflictException($"Jack {jack.Label} is patched to a switch port. Unpatch it before deleting.");
        }

        var linked = await db.ServiceRequests.CountAsync(r => r.RelatedJackId == id, ct);
        if (linked > 0)
        {
            throw new ConflictException($"Jack {jack.Label} is referenced by {linked} service request(s) and cannot be deleted.");
        }

        db.NetworkJacks.Remove(jack);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Connects a jack to a switch port. Patching the same jack to the same port again is a no-op.</summary>
    public async Task<JackDto> PatchAsync(int jackId, int portId, CancellationToken ct)
    {
        var jack = await db.NetworkJacks.FirstOrDefaultAsync(j => j.Id == jackId, ct)
            ?? throw new NotFoundException($"Jack {jackId} was not found.");
        var port = await LoadPortAsync(portId, ct);

        NetworkRules.EnsureCanPatch(jack, port, port.Jack?.Id);
        jack.SwitchPortId = port.Id;
        await db.SaveChangesAsync(ct);
        return await GetJackAsync(jackId, ct);
    }

    /// <summary>Disconnects a jack. An active jack becomes Inactive because it no longer has service.</summary>
    public async Task<JackDto> UnpatchAsync(int jackId, CancellationToken ct)
    {
        var jack = await db.NetworkJacks.FirstOrDefaultAsync(j => j.Id == jackId, ct)
            ?? throw new NotFoundException($"Jack {jackId} was not found.");

        if (jack.SwitchPortId is not null)
        {
            jack.SwitchPortId = null;
            if (jack.Status == JackStatus.Active)
            {
                jack.Status = JackStatus.Inactive;
            }

            await db.SaveChangesAsync(ct);
        }

        return await GetJackAsync(jackId, ct);
    }

    /// <summary>
    /// The everyday "activate jack 2-214B" task in one step: patch the jack to the port, put the port
    /// on the VLAN, enable it, and mark the jack Active. All changes are saved together or not at all.
    /// </summary>
    public async Task<JackDto> ActivateAsync(int jackId, ActivateJackRequest req, CancellationToken ct)
    {
        var jack = await db.NetworkJacks.FirstOrDefaultAsync(j => j.Id == jackId, ct)
            ?? throw new NotFoundException($"Jack {jackId} was not found.");
        var port = await LoadPortAsync(req.SwitchPortId!.Value, ct);
        var vlanId = req.VlanId!.Value;

        NetworkRules.EnsureValidVlanId(vlanId);
        if (!await db.Vlans.AnyAsync(v => v.VlanId == vlanId, ct))
        {
            throw new BusinessRuleException("vlanId", $"VLAN {vlanId} is not defined. Add it on the VLANs tab first.");
        }

        NetworkRules.EnsureCanPatch(jack, port, port.Jack?.Id);

        jack.SwitchPortId = port.Id;
        port.VlanId = vlanId;
        port.AdminStatus = PortAdminStatus.Enabled;
        jack.Status = JackStatus.Active;
        NetworkRules.EnsureCanBeActive(jack, port);

        // SaveChanges wraps all three updates in a single transaction.
        await db.SaveChangesAsync(ct);
        return await GetJackAsync(jackId, ct);
    }

    private async Task<SwitchPort> LoadPortAsync(int portId, CancellationToken ct) =>
        await db.SwitchPorts.Include(p => p.Jack).FirstOrDefaultAsync(p => p.Id == portId, ct)
        ?? throw new BusinessRuleException("switchPortId", $"Switch port {portId} does not exist.");

    private async Task EnsureJackLabelAvailableAsync(string label, int locationId, int? excludeId, CancellationToken ct)
    {
        if (!await db.Locations.AnyAsync(l => l.Id == locationId, ct))
        {
            throw new BusinessRuleException("locationId", $"Location {locationId} does not exist.");
        }

        if (await db.NetworkJacks.AnyAsync(j => j.LocationId == locationId && j.Label == label && j.Id != excludeId, ct))
        {
            throw new ConflictException($"Jack {label} already exists in that room.");
        }
    }

    private static string? TrimToNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static readonly System.Linq.Expressions.Expression<Func<NetworkJack, JackDto>> JackProjection = j => new JackDto(
        j.Id,
        j.Label,
        j.LocationId,
        j.Location!.BuildingCode + " " + j.Location.Room,
        j.Location.BuildingCode,
        j.JackType,
        j.Status,
        j.SwitchPortId,
        j.SwitchPort != null ? (int?)j.SwitchPort.SwitchId : null,
        j.SwitchPort != null ? j.SwitchPort.Switch!.Name : null,
        j.SwitchPort != null ? j.SwitchPort.PortName : null,
        j.SwitchPort != null ? j.SwitchPort.VlanId : null,
        j.Notes);
}
