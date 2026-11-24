namespace ItAssetTracker.Api.Domain;

// Enums are stored as text in SQLite (see AppDbContext.ConfigureConventions) so the
// SQL reports and the raw database stay readable, e.g. Status = 'Deployed'.

public enum AssetType
{
    Laptop,
    Desktop,
    Monitor,
    Printer,
    VoipPhone,
    Tablet,
    Projector,
    AccessPoint,
    Other
}

public enum AssetStatus
{
    InStock,
    Deployed,
    InRepair,
    Retired
}

public enum JackType
{
    Data,
    Voice
}

public enum JackStatus
{
    Active,
    Inactive,
    Faulty
}

public enum PortAdminStatus
{
    Enabled,
    Disabled
}

/// <summary>
/// Access ports connect to wall jacks. Uplink ports connect the closet switch to the core network,
/// so a jack must never be patched into one.
/// </summary>
public enum PortRole
{
    Access,
    Uplink
}

public enum TicketStatus
{
    New,
    Assigned,
    InProgress,
    Resolved,
    Closed,
    Reopened
}

public enum TicketPriority
{
    P1,
    P2,
    P3,
    P4
}

public enum TicketCategory
{
    JackActivation,
    Network,
    Hardware,
    Software,
    Telephone,
    AccountAccess,
    Other
}

public enum TicketEventType
{
    Created,
    StatusChanged,
    Assigned,
    Comment,
    Updated
}
