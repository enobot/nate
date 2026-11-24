namespace ItAssetTracker.Api.Domain;

/// <summary>A room or closet in a building, e.g. ENG floor 2 room 214.</summary>
public class Location
{
    public int Id { get; set; }
    public string BuildingCode { get; set; } = "";
    public string Building { get; set; } = "";
    public int Floor { get; set; }
    public string Room { get; set; } = "";
    public string? Description { get; set; }

    public string DisplayName => $"{BuildingCode} {Room}";
}

/// <summary>Fictional staff member. Technicians can be assigned service requests.</summary>
public class Person
{
    public int Id { get; set; }
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string Email { get; set; } = "";
    public string Department { get; set; } = "";
    public string? JobTitle { get; set; }
    public bool IsTechnician { get; set; }

    public string FullName => $"{FirstName} {LastName}";
}

public class Asset
{
    public int Id { get; set; }
    public string AssetTag { get; set; } = "";
    public AssetType AssetType { get; set; }
    public string Manufacturer { get; set; } = "";
    public string Model { get; set; } = "";
    public string SerialNumber { get; set; } = "";
    public AssetStatus Status { get; set; }
    public int? LocationId { get; set; }
    public Location? Location { get; set; }
    public int? AssignedToPersonId { get; set; }
    public Person? AssignedTo { get; set; }
    public DateOnly? PurchaseDate { get; set; }
    public DateOnly? WarrantyEndDate { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    /// <summary>Optimistic concurrency token, incremented on every update.</summary>
    public int Version { get; set; }

    public List<AssetHistory> History { get; set; } = [];
}

/// <summary>
/// One row per change to an asset's status, location, or assignee. Names are stored as
/// text snapshots so the history still reads correctly if a person or room is later renamed or removed.
/// </summary>
public class AssetHistory
{
    public int Id { get; set; }
    public int AssetId { get; set; }
    public Asset? Asset { get; set; }
    public DateTime ChangedAt { get; set; }
    public string? FromStatus { get; set; }
    public string? ToStatus { get; set; }
    public string? FromAssignee { get; set; }
    public string? ToAssignee { get; set; }
    public string? FromLocation { get; set; }
    public string? ToLocation { get; set; }
    public string? Note { get; set; }
}

public class Vlan
{
    /// <summary>The 802.1Q VLAN number (1-4094). Used as the primary key.</summary>
    public int VlanId { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
}

public class NetworkSwitch
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Model { get; set; } = "";
    public string ManagementIp { get; set; } = "";
    public int LocationId { get; set; }
    public Location? Location { get; set; }
    public List<SwitchPort> Ports { get; set; } = [];
}

public class SwitchPort
{
    public int Id { get; set; }
    public int SwitchId { get; set; }
    public NetworkSwitch? Switch { get; set; }

    /// <summary>Chassis/slot/port notation, e.g. 1/1/12.</summary>
    public string PortName { get; set; } = "";
    public int PortNumber { get; set; }
    public int? VlanId { get; set; }
    public Vlan? Vlan { get; set; }
    public PortAdminStatus AdminStatus { get; set; }
    public PortRole Role { get; set; } = PortRole.Access;
    public string? Description { get; set; }

    /// <summary>The jack patched to this port, if any (inverse side of NetworkJack.SwitchPortId).</summary>
    public NetworkJack? Jack { get; set; }
}

public class NetworkJack
{
    public int Id { get; set; }

    /// <summary>Wall plate label, e.g. 2-214B (floor-room plus jack letter).</summary>
    public string Label { get; set; } = "";
    public int LocationId { get; set; }
    public Location? Location { get; set; }
    public JackType JackType { get; set; }
    public JackStatus Status { get; set; }

    /// <summary>
    /// The switch port this jack is patched to. A unique index on this column means a port can
    /// only ever have one jack, and because it is a single column a jack can only have one port.
    /// </summary>
    public int? SwitchPortId { get; set; }
    public SwitchPort? SwitchPort { get; set; }
    public string? Notes { get; set; }
}

public class ServiceRequest
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public TicketCategory Category { get; set; }
    public TicketPriority Priority { get; set; }
    public TicketStatus Status { get; set; }
    public int RequesterId { get; set; }
    public Person? Requester { get; set; }
    public int? AssigneeId { get; set; }
    public Person? Assignee { get; set; }
    public int? RelatedAssetId { get; set; }
    public Asset? RelatedAsset { get; set; }
    public int? RelatedJackId { get; set; }
    public NetworkJack? RelatedJack { get; set; }
    public string? ResolutionNotes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public DateTime? ClosedAt { get; set; }
    public int Version { get; set; }
    public List<TicketEvent> Events { get; set; } = [];

    /// <summary>Display number derived from the primary key, e.g. SR000042.</summary>
    public string Number => FormatNumber(Id);

    public static string FormatNumber(int id) => $"SR{id:D6}";
}

/// <summary>Audit trail entry for a service request: creation, status change, assignment, comment, edit.</summary>
public class TicketEvent
{
    public int Id { get; set; }
    public int ServiceRequestId { get; set; }
    public ServiceRequest? ServiceRequest { get; set; }
    public TicketEventType EventType { get; set; }
    public DateTime CreatedAt { get; set; }
    public int? ActorId { get; set; }
    public string ActorName { get; set; } = "";
    public string? FromStatus { get; set; }
    public string? ToStatus { get; set; }
    public string? FromAssignee { get; set; }
    public string? ToAssignee { get; set; }
    public string? Text { get; set; }
}
