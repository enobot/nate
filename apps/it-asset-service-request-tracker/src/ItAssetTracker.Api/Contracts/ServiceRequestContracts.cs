using System.ComponentModel.DataAnnotations;
using ItAssetTracker.Api.Domain;

namespace ItAssetTracker.Api.Contracts;

public sealed record ServiceRequestListItemDto(
    int Id,
    string Number,
    string Title,
    TicketCategory Category,
    TicketPriority Priority,
    TicketStatus Status,
    int RequesterId,
    string RequesterName,
    int? AssigneeId,
    string? AssigneeName,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? ResolvedAt);

public sealed record RelatedAssetDto(int Id, string AssetTag, string Description);

public sealed record RelatedJackDto(int Id, string Label, string LocationName, JackStatus Status);

public sealed record TicketEventDto(
    int Id,
    TicketEventType Type,
    DateTime CreatedAt,
    int? ActorId,
    string ActorName,
    string? FromStatus,
    string? ToStatus,
    string? FromAssignee,
    string? ToAssignee,
    string? Text);

public sealed record ServiceRequestDetailDto(
    int Id,
    string Number,
    string Title,
    string Description,
    TicketCategory Category,
    TicketPriority Priority,
    TicketStatus Status,
    int RequesterId,
    string RequesterName,
    int? AssigneeId,
    string? AssigneeName,
    RelatedAssetDto? RelatedAsset,
    RelatedJackDto? RelatedJack,
    string? ResolutionNotes,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? ResolvedAt,
    DateTime? ClosedAt,
    int Version,
    IReadOnlyList<TicketStatus> AllowedTransitions,
    IReadOnlyList<TicketEventDto> History);

public sealed record CreateServiceRequestRequest
{
    [Required, StringLength(120, MinimumLength = 5)]
    public string Title { get; init; } = "";

    [Required, StringLength(4000, MinimumLength = 10)]
    public string Description { get; init; } = "";

    [Required, EnumDataType(typeof(TicketCategory))]
    public TicketCategory? Category { get; init; }

    [Required, EnumDataType(typeof(TicketPriority))]
    public TicketPriority? Priority { get; init; }

    [Required, Range(1, int.MaxValue)]
    public int? RequesterId { get; init; }

    [Range(1, int.MaxValue)]
    public int? RelatedAssetId { get; init; }

    [Range(1, int.MaxValue)]
    public int? RelatedJackId { get; init; }

    /// <summary>Who entered the request. Defaults to the requester. Not verified: the demo has no sign-in.</summary>
    [Range(1, int.MaxValue)]
    public int? ActorId { get; init; }
}

public sealed record UpdateServiceRequestRequest
{
    [Required, StringLength(120, MinimumLength = 5)]
    public string Title { get; init; } = "";

    [Required, StringLength(4000, MinimumLength = 10)]
    public string Description { get; init; } = "";

    [Required, EnumDataType(typeof(TicketCategory))]
    public TicketCategory? Category { get; init; }

    [Required, EnumDataType(typeof(TicketPriority))]
    public TicketPriority? Priority { get; init; }

    [Range(1, int.MaxValue)]
    public int? RelatedAssetId { get; init; }

    [Range(1, int.MaxValue)]
    public int? RelatedJackId { get; init; }

    [Required, Range(1, int.MaxValue)]
    public int? ActorId { get; init; }

    [Required]
    public int? Version { get; init; }
}

public sealed record AssignServiceRequestRequest
{
    [Required, Range(1, int.MaxValue)]
    public int? AssigneeId { get; init; }

    [Required, Range(1, int.MaxValue)]
    public int? ActorId { get; init; }

    [Required]
    public int? Version { get; init; }
}

public sealed record ChangeStatusRequest
{
    [Required, EnumDataType(typeof(TicketStatus))]
    public TicketStatus? Status { get; init; }

    /// <summary>Resolution notes when resolving, the reason when reopening, otherwise an optional work note.</summary>
    [StringLength(2000)]
    public string? Note { get; init; }

    [Required, Range(1, int.MaxValue)]
    public int? ActorId { get; init; }

    [Required]
    public int? Version { get; init; }
}

public sealed record AddCommentRequest
{
    [Required, StringLength(2000, MinimumLength = 2)]
    public string Text { get; init; } = "";

    [Required, Range(1, int.MaxValue)]
    public int? ActorId { get; init; }
}

public sealed record ServiceRequestQuery
{
    [StringLength(100)]
    public string? Search { get; init; }

    [EnumDataType(typeof(TicketStatus))]
    public TicketStatus? Status { get; init; }

    [EnumDataType(typeof(TicketPriority))]
    public TicketPriority? Priority { get; init; }

    [EnumDataType(typeof(TicketCategory))]
    public TicketCategory? Category { get; init; }

    public int? AssigneeId { get; init; }

    /// <summary>True returns only requests that are not Resolved or Closed.</summary>
    public bool? OpenOnly { get; init; }

    /// <summary>True returns only requests with no assignee.</summary>
    public bool? Unassigned { get; init; }

    public int? RelatedAssetId { get; init; }

    public int? RelatedJackId { get; init; }

    /// <summary>One of: createdAt, updatedAt, priority, status. Prefix with '-' for descending. Default -createdAt.</summary>
    [StringLength(30)]
    public string? Sort { get; init; }

    public int? Page { get; init; }

    public int? PageSize { get; init; }
}
