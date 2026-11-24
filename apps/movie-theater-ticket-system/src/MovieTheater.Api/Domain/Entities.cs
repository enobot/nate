namespace MovieTheater.Api.Domain;

public class Movie
{
    public int Id { get; set; }
    public required string Title { get; set; }
    public string Tagline { get; set; } = "";
    public required string Synopsis { get; set; }
    public required string Genre { get; set; }
    public required string Rating { get; set; }
    public int RuntimeMinutes { get; set; }

    /// <summary>Colour palette key for the poster art drawn in the browser (see <see cref="PosterStyles"/>).</summary>
    public required string PosterPalette { get; set; }

    /// <summary>Shape motif key for the poster art drawn in the browser (see <see cref="PosterStyles"/>).</summary>
    public required string PosterMotif { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; }

    public List<Screening> Screenings { get; set; } = [];
}

public class Auditorium
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public int RowCount { get; set; }
    public int SeatsPerRow { get; set; }

    /// <summary>Comma-separated seat numbers that have an aisle after them, e.g. "3,11".</summary>
    public string AisleAfter { get; set; } = "";

    public List<Seat> Seats { get; set; } = [];
}

public class Seat
{
    public int Id { get; set; }
    public int AuditoriumId { get; set; }
    public Auditorium? Auditorium { get; set; }

    /// <summary>Row letter, "A" is closest to the screen.</summary>
    public required string Row { get; set; }

    public int Number { get; set; }
    public SeatType SeatType { get; set; }

    public string Label => $"{Row}{Number}";
}

public class Screening
{
    public int Id { get; set; }
    public int MovieId { get; set; }
    public Movie? Movie { get; set; }
    public int AuditoriumId { get; set; }
    public Auditorium? Auditorium { get; set; }

    /// <summary>Start time stored in UTC. Converted to theater-local time for display and matinee rules.</summary>
    public DateTime StartsAtUtc { get; set; }

    /// <summary>Set from the theater-local start time when the screening is created or moved.</summary>
    public bool IsMatinee { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public List<Ticket> Tickets { get; set; } = [];
    public List<SeatHold> Holds { get; set; } = [];
}

/// <summary>
/// A temporary claim on one seat for one screening while it sits in a shopping cart.
/// The unique index on (ScreeningId, SeatId) means only one cart can hold a seat at a time.
/// </summary>
public class SeatHold
{
    public int Id { get; set; }
    public required string CartToken { get; set; }
    public int ScreeningId { get; set; }
    public Screening? Screening { get; set; }
    public int SeatId { get; set; }
    public Seat? Seat { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
}

public class Order
{
    public int Id { get; set; }
    public required string OrderNumber { get; set; }

    /// <summary>
    /// The cart that produced this order. Unique, so a repeated checkout request for the same cart
    /// returns the existing order instead of charging twice. Null for seeded sample orders.
    /// </summary>
    public string? CartToken { get; set; }

    public int ScreeningId { get; set; }
    public Screening? Screening { get; set; }

    public required string CustomerName { get; set; }

    /// <summary>Stored trimmed and lower-cased so lookups are case-insensitive.</summary>
    public required string CustomerEmail { get; set; }

    public OrderStatus Status { get; set; }

    public int TicketSubtotalCents { get; set; }
    public int ConcessionSubtotalCents { get; set; }
    public int DiscountCents { get; set; }
    public int TaxCents { get; set; }
    public int TotalCents { get; set; }
    public int RefundedCents { get; set; }

    /// <summary>Reference for the simulated payment. No real payment is processed.</summary>
    public required string PaymentReference { get; set; }

    public DateTime CreatedAtUtc { get; set; }
    public DateTime? CancelledAtUtc { get; set; }
    public CancellationSource? CancelledBy { get; set; }
    public string? CancellationReason { get; set; }

    public List<Ticket> Tickets { get; set; } = [];
    public List<OrderConcessionLine> ConcessionLines { get; set; } = [];
}

/// <summary>
/// One sold seat. A filtered unique index on (ScreeningId, SeatId) WHERE IsCancelled = 0
/// guarantees a seat can only be sold once per screening, while cancelled tickets stay as history.
/// </summary>
public class Ticket
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order? Order { get; set; }
    public int ScreeningId { get; set; }
    public Screening? Screening { get; set; }
    public int SeatId { get; set; }
    public Seat? Seat { get; set; }

    public TicketType TicketType { get; set; }
    public SeatType SeatType { get; set; }

    public int BasePriceCents { get; set; }
    public int DiscountCents { get; set; }
    public int SurchargeCents { get; set; }
    public int PriceCents { get; set; }

    public bool IsCancelled { get; set; }
}

public class ConcessionItem
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public string Description { get; set; } = "";
    public ConcessionCategory Category { get; set; }
    public int PriceCents { get; set; }
    public bool IsAvailable { get; set; } = true;
    public int SortOrder { get; set; }
}

public class OrderConcessionLine
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order? Order { get; set; }
    public int ConcessionItemId { get; set; }
    public ConcessionItem? ConcessionItem { get; set; }

    /// <summary>Name and price are copied at purchase so later menu changes do not rewrite history.</summary>
    public required string Name { get; set; }

    public int UnitPriceCents { get; set; }
    public int Quantity { get; set; }
    public int LineTotalCents { get; set; }
}
