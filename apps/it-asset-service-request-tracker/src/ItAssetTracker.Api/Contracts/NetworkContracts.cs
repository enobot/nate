using System.ComponentModel.DataAnnotations;
using ItAssetTracker.Api.Domain;

namespace ItAssetTracker.Api.Contracts;

public sealed record VlanDto(int VlanId, string Name, string? Description, int PortCount);

public sealed record CreateVlanRequest
{
    // The range is checked again in NetworkRules so the rule is enforced even if this attribute is removed.
    [Required, Range(1, 4094, ErrorMessage = "VLAN ID must be between 1 and 4094.")]
    public int? VlanId { get; init; }

    [Required, StringLength(40)]
    [RegularExpression("^[A-Za-z0-9_-]+$", ErrorMessage = "VLAN name may contain only letters, numbers, dashes and underscores.")]
    public string Name { get; init; } = "";

    [StringLength(200)]
    public string? Description { get; init; }
}

public sealed record SwitchSummaryDto(
    int Id,
    string Name,
    string Model,
    string ManagementIp,
    int LocationId,
    string LocationName,
    string Building,
    int PortCount,
    int AccessPorts,
    int EnabledPorts,
    int PatchedPorts,
    int ActiveJacks);

public sealed record PortJackDto(int Id, string Label, string LocationName, JackType Type, JackStatus Status);

public sealed record SwitchPortDto(
    int Id,
    int SwitchId,
    string PortName,
    int PortNumber,
    int? VlanId,
    string? VlanName,
    PortAdminStatus AdminStatus,
    PortRole Role,
    string? Description,
    PortJackDto? Jack);

public sealed record SwitchDetailDto(
    int Id,
    string Name,
    string Model,
    string ManagementIp,
    int LocationId,
    string LocationName,
    string Building,
    IReadOnlyList<SwitchPortDto> Ports);

public sealed record CreateSwitchRequest
{
    [Required, StringLength(40, MinimumLength = 3)]
    [RegularExpression("^[A-Za-z0-9-]+$", ErrorMessage = "Switch name may contain only letters, numbers and dashes.")]
    public string Name { get; init; } = "";

    [Required, StringLength(60)]
    public string Model { get; init; } = "";

    [Required, StringLength(15)]
    public string ManagementIp { get; init; } = "";

    [Required, Range(1, int.MaxValue)]
    public int? LocationId { get; init; }

    [Required, Range(1, 96, ErrorMessage = "Port count must be between 1 and 96.")]
    public int? PortCount { get; init; }
}

public sealed record UpdateSwitchRequest
{
    [Required, StringLength(40, MinimumLength = 3)]
    [RegularExpression("^[A-Za-z0-9-]+$", ErrorMessage = "Switch name may contain only letters, numbers and dashes.")]
    public string Name { get; init; } = "";

    [Required, StringLength(60)]
    public string Model { get; init; } = "";

    [Required, StringLength(15)]
    public string ManagementIp { get; init; } = "";

    [Required, Range(1, int.MaxValue)]
    public int? LocationId { get; init; }
}

public sealed record UpdatePortRequest
{
    /// <summary>Null clears the VLAN. Range is validated by NetworkRules (1-4094) and the VLAN must exist.</summary>
    public int? VlanId { get; init; }

    [Required, EnumDataType(typeof(PortAdminStatus))]
    public PortAdminStatus? AdminStatus { get; init; }

    [StringLength(100)]
    public string? Description { get; init; }
}

public sealed record JackDto(
    int Id,
    string Label,
    int LocationId,
    string LocationName,
    string BuildingCode,
    JackType Type,
    JackStatus Status,
    int? SwitchPortId,
    int? SwitchId,
    string? SwitchName,
    string? PortName,
    int? VlanId,
    string? Notes);

public sealed record JackWriteRequest
{
    [Required, StringLength(20, MinimumLength = 2)]
    [RegularExpression("^[A-Za-z0-9-]+$", ErrorMessage = "Jack label may contain only letters, numbers and dashes, e.g. 2-214B.")]
    public string Label { get; init; } = "";

    [Required, Range(1, int.MaxValue)]
    public int? LocationId { get; init; }

    [Required, EnumDataType(typeof(JackType))]
    public JackType? Type { get; init; }

    [Required, EnumDataType(typeof(JackStatus))]
    public JackStatus? Status { get; init; }

    [StringLength(500)]
    public string? Notes { get; init; }
}

public sealed record PatchJackRequest
{
    [Required, Range(1, int.MaxValue)]
    public int? SwitchPortId { get; init; }
}

public sealed record ActivateJackRequest
{
    [Required, Range(1, int.MaxValue)]
    public int? SwitchPortId { get; init; }

    [Required]
    public int? VlanId { get; init; }
}

public sealed record JackQuery
{
    [StringLength(50)]
    public string? Search { get; init; }

    [EnumDataType(typeof(JackStatus))]
    public JackStatus? Status { get; init; }

    [EnumDataType(typeof(JackType))]
    public JackType? Type { get; init; }

    [StringLength(10)]
    public string? Building { get; init; }

    public bool? Patched { get; init; }

    public int? Page { get; init; }

    public int? PageSize { get; init; }
}
