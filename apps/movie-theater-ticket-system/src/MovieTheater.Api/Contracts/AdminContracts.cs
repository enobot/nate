using System.ComponentModel.DataAnnotations;
using MovieTheater.Api.Domain;

namespace MovieTheater.Api.Contracts;

public sealed class LoginRequest
{
    [Required, StringLength(64)] public string Username { get; init; } = "";
    [Required, StringLength(128)] public string Password { get; init; } = "";
}

public sealed record AdminUserDto(string Username);

public sealed class MovieUpsertRequest
{
    [Required, StringLength(120, MinimumLength = 1)]
    public string Title { get; init; } = "";

    [StringLength(160)]
    public string? Tagline { get; init; }

    [Required, StringLength(1200, MinimumLength = 10)]
    public string Synopsis { get; init; } = "";

    [Required, StringLength(40, MinimumLength = 2)]
    public string Genre { get; init; } = "";

    [Required, AllowedValues("G", "PG", "PG-13", "R")]
    public string Rating { get; init; } = "";

    [Range(30, 240)]
    public int RuntimeMinutes { get; init; }

    [Required, AllowedValues("ember", "tide", "aurora", "dusk", "moss", "violet", "gold", "frost")]
    public string PosterPalette { get; init; } = "";

    [Required, AllowedValues("orbit", "waves", "peaks", "grid", "rings", "sun", "beam", "stars")]
    public string PosterMotif { get; init; } = "";

    public bool IsActive { get; init; } = true;
}

public sealed record AdminMovieDto(
    int Id,
    string Title,
    string Tagline,
    string Synopsis,
    string Genre,
    string Rating,
    int RuntimeMinutes,
    string PosterPalette,
    string PosterMotif,
    bool IsActive,
    int UpcomingScreenings,
    int TotalScreenings);

public sealed record AuditoriumDto(int Id, string Name, int RowCount, int SeatsPerRow, int Capacity);

public sealed class ScreeningUpsertRequest
{
    [Range(1, int.MaxValue)] public int MovieId { get; init; }
    [Range(1, int.MaxValue)] public int AuditoriumId { get; init; }

    /// <summary>Theater-local wall-clock start time, e.g. "2026-12-01T19:30:00" (no offset).</summary>
    [Required] public DateTime? StartsAtLocal { get; init; }
}

public sealed record AdminScreeningDto(
    int Id,
    int MovieId,
    string MovieTitle,
    int AuditoriumId,
    string AuditoriumName,
    DateTime StartsAtUtc,
    DateTime StartsAtLocal,
    DateTime EndsAtLocal,
    bool IsMatinee,
    int TicketsSold,
    int SeatsHeld,
    int Capacity,
    bool HasOrders,
    bool HasStarted);

public sealed record AdminOrderSummaryDto(
    string OrderNumber,
    OrderStatus Status,
    string CustomerName,
    string CustomerEmail,
    int ScreeningId,
    string MovieTitle,
    string AuditoriumName,
    DateTime StartsAtLocal,
    int TicketCount,
    int TotalCents,
    DateTime CreatedAtUtc);

public sealed record PagedResponse<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

public sealed class AdminCancelRequest
{
    [StringLength(200)] public string? Reason { get; init; }
}

public sealed record MovieSalesDto(int MovieId, string Title, int TicketsSold, int TicketRevenueCents);

public sealed record ConcessionSalesDto(int ItemId, string Name, int Quantity, int RevenueCents);

public sealed record OccupancyDto(
    int ScreeningId,
    string MovieTitle,
    string AuditoriumName,
    DateTime StartsAtLocal,
    int TicketsSold,
    int Capacity);

public sealed record SalesReportDto(
    DateOnly From,
    DateOnly To,
    int PaidOrders,
    int CancelledOrders,
    int TicketsSold,
    int TicketRevenueCents,
    int ConcessionRevenueCents,
    int TaxCents,
    int GrossCents,
    int RefundedCents,
    IReadOnlyList<MovieSalesDto> ByMovie,
    IReadOnlyList<ConcessionSalesDto> Concessions,
    IReadOnlyList<OccupancyDto> UpcomingOccupancy);
