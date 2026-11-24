using System.ComponentModel.DataAnnotations;

namespace ItAssetTracker.Api.Contracts;

public sealed record LocationDto(
    int Id,
    string BuildingCode,
    string Building,
    int Floor,
    string Room,
    string? Description,
    string DisplayName,
    int AssetCount,
    int JackCount);

public sealed record LocationWriteRequest
{
    [Required, StringLength(10, MinimumLength = 2)]
    [RegularExpression("^[A-Za-z0-9]+$", ErrorMessage = "Building code may contain only letters and numbers.")]
    public string BuildingCode { get; init; } = "";

    [Required, StringLength(80)]
    public string Building { get; init; } = "";

    [Required, Range(-5, 100)]
    public int? Floor { get; init; }

    [Required, StringLength(20)]
    [RegularExpression("^[A-Za-z0-9 -]+$", ErrorMessage = "Room may contain only letters, numbers, spaces and dashes.")]
    public string Room { get; init; } = "";

    [StringLength(200)]
    public string? Description { get; init; }
}

public sealed record PersonDto(
    int Id,
    string FirstName,
    string LastName,
    string FullName,
    string Email,
    string Department,
    string? JobTitle,
    bool IsTechnician,
    int AssignedAssetCount);

public sealed record PersonWriteRequest
{
    [Required, StringLength(50)]
    public string FirstName { get; init; } = "";

    [Required, StringLength(50)]
    public string LastName { get; init; } = "";

    [Required, StringLength(120), EmailAddress]
    public string Email { get; init; } = "";

    [Required, StringLength(80)]
    public string Department { get; init; } = "";

    [StringLength(80)]
    public string? JobTitle { get; init; }

    public bool IsTechnician { get; init; }
}
