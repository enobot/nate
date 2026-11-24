using System.ComponentModel.DataAnnotations;
using ItAssetTracker.Api.Domain;

namespace ItAssetTracker.Api.Contracts;

public sealed record AssetListItemDto(
    int Id,
    string AssetTag,
    AssetType Type,
    string Manufacturer,
    string Model,
    string SerialNumber,
    AssetStatus Status,
    int? LocationId,
    string? LocationName,
    int? AssignedToId,
    string? AssignedToName,
    DateOnly? PurchaseDate,
    DateOnly? WarrantyEndDate);

public sealed record AssetDetailDto(
    int Id,
    string AssetTag,
    AssetType Type,
    string Manufacturer,
    string Model,
    string SerialNumber,
    AssetStatus Status,
    int? LocationId,
    string? LocationName,
    int? AssignedToId,
    string? AssignedToName,
    DateOnly? PurchaseDate,
    DateOnly? WarrantyEndDate,
    string? Notes,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int Version,
    int OpenRequestCount);

public sealed record AssetHistoryDto(
    int Id,
    DateTime ChangedAt,
    string? FromStatus,
    string? ToStatus,
    string? FromAssignee,
    string? ToAssignee,
    string? FromLocation,
    string? ToLocation,
    string? Note);

/// <summary>Fields shared by create and update. Validation attributes run before the controller action.</summary>
public abstract record AssetWriteRequest
{
    [Required, StringLength(20, MinimumLength = 3)]
    [RegularExpression("^[A-Za-z0-9-]+$", ErrorMessage = "Asset tag may contain only letters, numbers and dashes.")]
    public string AssetTag { get; init; } = "";

    [Required, EnumDataType(typeof(AssetType))]
    public AssetType? Type { get; init; }

    [Required, StringLength(60)]
    public string Manufacturer { get; init; } = "";

    [Required, StringLength(80)]
    public string Model { get; init; } = "";

    [Required, StringLength(40, MinimumLength = 3)]
    [RegularExpression("^[A-Za-z0-9-]+$", ErrorMessage = "Serial number may contain only letters, numbers and dashes.")]
    public string SerialNumber { get; init; } = "";

    [Required, EnumDataType(typeof(AssetStatus))]
    public AssetStatus? Status { get; init; }

    [Range(1, int.MaxValue)]
    public int? LocationId { get; init; }

    [Range(1, int.MaxValue)]
    public int? AssignedToId { get; init; }

    public DateOnly? PurchaseDate { get; init; }

    public DateOnly? WarrantyEndDate { get; init; }

    [StringLength(1000)]
    public string? Notes { get; init; }
}

public sealed record CreateAssetRequest : AssetWriteRequest;

public sealed record UpdateAssetRequest : AssetWriteRequest
{
    /// <summary>The Version the client last read. A mismatch returns 409 instead of overwriting someone else's change.</summary>
    [Required]
    public int? Version { get; init; }

    /// <summary>Optional note saved with the assignment history entry.</summary>
    [StringLength(300)]
    public string? ChangeNote { get; init; }
}

public sealed record AssetQuery
{
    [StringLength(100)]
    public string? Search { get; init; }

    [EnumDataType(typeof(AssetStatus))]
    public AssetStatus? Status { get; init; }

    [EnumDataType(typeof(AssetType))]
    public AssetType? Type { get; init; }

    [StringLength(10)]
    public string? Building { get; init; }

    public int? LocationId { get; init; }

    public int? AssignedToId { get; init; }

    /// <summary>Warranty ends on or before this many days from today (excludes retired assets).</summary>
    [Range(0, 3650)]
    public int? WarrantyWithinDays { get; init; }

    /// <summary>One of: assetTag, type, status, model, location, assignedTo, purchaseDate, warrantyEndDate. Prefix with '-' for descending.</summary>
    [StringLength(30)]
    public string? Sort { get; init; }

    public int? Page { get; init; }

    public int? PageSize { get; init; }
}
