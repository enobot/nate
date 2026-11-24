using System.ComponentModel.DataAnnotations;
using MovieTheater.Api.Domain;
using MovieTheater.Api.Services;

namespace MovieTheater.Api.Contracts;

public sealed record MovieDto(
    int Id,
    string Title,
    string Tagline,
    string Synopsis,
    string Genre,
    string Rating,
    int RuntimeMinutes,
    string PosterPalette,
    string PosterMotif);

/// <summary>
/// A screening as shown in listings. <c>StartsAtLocal</c> is theater wall-clock time (no offset),
/// so the browser can display it without time zone conversions.
/// </summary>
public sealed record ShowtimeDto(
    int Id,
    int MovieId,
    DateTime StartsAtUtc,
    DateTime StartsAtLocal,
    DateTime EndsAtLocal,
    int AuditoriumId,
    string AuditoriumName,
    bool IsMatinee,
    int SeatsAvailable,
    int Capacity);

public sealed record MovieShowtimesDto(MovieDto Movie, IReadOnlyList<ShowtimeDto> Showtimes);

public sealed record ShowtimesResponse(DateOnly Date, IReadOnlyList<DateOnly> Dates, IReadOnlyList<MovieShowtimesDto> Movies);

public sealed record MovieDetailResponse(MovieDto Movie, IReadOnlyList<ShowtimeDto> Showtimes);

public sealed record SeatDto(int Id, string Row, int Number, string Label, SeatType SeatType, SeatStatus Status);

public sealed record AuditoriumLayoutDto(int Id, string Name, int RowCount, int SeatsPerRow, IReadOnlyList<int> AisleAfter);

public sealed record ScreeningDetailResponse(
    ShowtimeDto Screening,
    MovieDto Movie,
    AuditoriumLayoutDto Auditorium,
    IReadOnlyList<SeatDto> Seats,
    bool SalesOpen,
    DateTime ServerTimeUtc);

public sealed record ConcessionItemDto(int Id, string Name, string Description, ConcessionCategory Category, int PriceCents);

public sealed record PricingInfoResponse(
    int AdultCents,
    int ChildCents,
    int SeniorCents,
    int MatineeDiscountCents,
    int MatineeCutoffHour,
    int PremiumSurchargeCents,
    decimal SalesTaxRate,
    bool TaxTickets,
    int HoldMinutes,
    int MaxSeatsPerOrder,
    int MaxConcessionQuantity,
    int CancellationCutoffMinutes,
    IReadOnlyList<ConcessionItemDto> Concessions);

public sealed record CartHoldDto(int SeatId, string Label, string Row, int Number, SeatType SeatType);

public sealed record CartResponse(
    string CartToken,
    int? ScreeningId,
    IReadOnlyList<CartHoldDto> Holds,
    DateTime? ExpiresAtUtc,
    DateTime ServerTimeUtc);

public sealed class HoldSeatRequest
{
    [Range(1, int.MaxValue)] public int ScreeningId { get; init; }
    [Range(1, int.MaxValue)] public int SeatId { get; init; }
}

public sealed class TicketSelection
{
    [Range(1, int.MaxValue)] public int SeatId { get; init; }
    [EnumDataType(typeof(TicketType))] public TicketType TicketType { get; init; } = TicketType.Adult;
}

public sealed class ConcessionSelection
{
    [Range(1, int.MaxValue)] public int ItemId { get; init; }
    [Range(1, 20)] public int Quantity { get; init; }
}

public sealed class QuoteRequest
{
    [Range(1, int.MaxValue)] public int ScreeningId { get; init; }

    [Required, MinLength(1), MaxLength(20)]
    public List<TicketSelection> Tickets { get; init; } = [];

    [MaxLength(20)]
    public List<ConcessionSelection> Concessions { get; init; } = [];
}

public sealed class CheckoutRequest
{
    [Required, RegularExpression(Tokens.CartTokenPattern, ErrorMessage = "Cart token is not valid.")]
    public string CartToken { get; init; } = "";

    [Required, StringLength(80, MinimumLength = 2)]
    public string CustomerName { get; init; } = "";

    [Required, EmailAddress, StringLength(254)]
    public string CustomerEmail { get; init; } = "";

    [Required, MinLength(1), MaxLength(20)]
    public List<TicketSelection> Tickets { get; init; } = [];

    [MaxLength(20)]
    public List<ConcessionSelection> Concessions { get; init; } = [];

    /// <summary>Demo switch: ask the simulated payment step to decline, to show the failure path.</summary>
    public bool SimulateDecline { get; init; }
}

public sealed record TicketDto(
    int SeatId,
    string SeatLabel,
    SeatType SeatType,
    TicketType TicketType,
    int BasePriceCents,
    int DiscountCents,
    int SurchargeCents,
    int PriceCents,
    bool IsCancelled);

public sealed record OrderConcessionDto(int ItemId, string Name, int UnitPriceCents, int Quantity, int LineTotalCents);

public sealed record OrderDto(
    string OrderNumber,
    OrderStatus Status,
    string CustomerName,
    string CustomerEmail,
    int ScreeningId,
    string MovieTitle,
    string PosterPalette,
    string PosterMotif,
    string AuditoriumName,
    DateTime StartsAtUtc,
    DateTime StartsAtLocal,
    bool IsMatinee,
    IReadOnlyList<TicketDto> Tickets,
    IReadOnlyList<OrderConcessionDto> Concessions,
    int TicketSubtotalCents,
    int ConcessionSubtotalCents,
    int DiscountCents,
    int TaxCents,
    int TotalCents,
    int RefundedCents,
    string PaymentReference,
    DateTime CreatedAtUtc,
    DateTime? CancelledAtUtc,
    CancellationSource? CancelledBy,
    string? CancellationReason,
    bool CanCancel,
    DateTime CancelDeadlineUtc);

public sealed class OrderLookupRequest
{
    [Required, RegularExpression(Tokens.OrderNumberPattern, ErrorMessage = "Order numbers look like MT-7K3QX9AB.")]
    public string OrderNumber { get; init; } = "";

    [Required, EmailAddress, StringLength(254)]
    public string Email { get; init; } = "";
}

public sealed record OrderHistoryResponse(IReadOnlyList<OrderDto> Orders);

public sealed class CancelOrderRequest
{
    [Required, EmailAddress, StringLength(254)]
    public string Email { get; init; } = "";
}
