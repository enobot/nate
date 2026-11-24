using MovieTheater.Api.Options;

namespace MovieTheater.Api.Domain;

/// <summary>A seat to be priced. Only the seat type affects the price.</summary>
public sealed record PricedSeat(int SeatId, string Label, SeatType SeatType);

/// <summary>A concession item to be priced, using the server's current menu price.</summary>
public sealed record PricedConcession(int ItemId, string Name, int UnitPriceCents);

public sealed record TicketPrice(int BasePriceCents, int DiscountCents, int SurchargeCents, int PriceCents);

public sealed record TicketLineQuote(
    int SeatId,
    string SeatLabel,
    SeatType SeatType,
    TicketType TicketType,
    int BasePriceCents,
    int DiscountCents,
    int SurchargeCents,
    int PriceCents);

public sealed record ConcessionLineQuote(int ItemId, string Name, int UnitPriceCents, int Quantity, int LineTotalCents);

public sealed record OrderQuote(
    IReadOnlyList<TicketLineQuote> Tickets,
    IReadOnlyList<ConcessionLineQuote> Concessions,
    bool IsMatinee,
    int TicketSubtotalCents,
    int ConcessionSubtotalCents,
    int DiscountCents,
    decimal SalesTaxRate,
    int TaxCents,
    int TotalCents);

/// <summary>
/// The ticket and concession pricing rules. This class is pure (no database, no clock),
/// so every rule is covered by plain unit tests. The server always prices orders with this
/// class and never trusts a price sent by the browser.
/// </summary>
public sealed class PriceCalculator(PricingOptions rules)
{
    public PricingOptions Rules { get; } = rules;

    /// <summary>A screening is a matinee when it starts before the cutoff hour, theater-local time.</summary>
    public bool IsMatinee(DateTime theaterLocalStart) => theaterLocalStart.Hour < Rules.MatineeCutoffHour;

    public int BasePriceFor(TicketType ticketType) => ticketType switch
    {
        TicketType.Adult => Rules.AdultCents,
        TicketType.Child => Rules.ChildCents,
        TicketType.Senior => Rules.SeniorCents,
        _ => throw new ArgumentOutOfRangeException(nameof(ticketType), ticketType, "Unknown ticket type."),
    };

    public TicketPrice PriceTicket(TicketType ticketType, SeatType seatType, bool isMatinee)
    {
        var basePrice = BasePriceFor(ticketType);

        // The matinee discount can never push a ticket below zero.
        var discount = isMatinee ? Math.Min(Rules.MatineeDiscountCents, basePrice) : 0;

        // Accessible seats are priced like standard seats; only premium seats carry a surcharge.
        var surcharge = seatType == SeatType.Premium ? Rules.PremiumSurchargeCents : 0;

        return new TicketPrice(basePrice, discount, surcharge, basePrice - discount + surcharge);
    }

    /// <summary>Tax in whole cents, rounded half away from zero (e.g. 46.5 cents becomes 47).</summary>
    public int CalculateTax(int taxableCents) =>
        (int)Math.Round(taxableCents * Rules.SalesTaxRate, 0, MidpointRounding.AwayFromZero);

    public OrderQuote Quote(
        IReadOnlyList<(PricedSeat Seat, TicketType TicketType)> tickets,
        IReadOnlyList<(PricedConcession Item, int Quantity)> concessions,
        bool isMatinee)
    {
        ArgumentNullException.ThrowIfNull(tickets);
        ArgumentNullException.ThrowIfNull(concessions);

        var ticketLines = tickets
            .Select(t =>
            {
                var price = PriceTicket(t.TicketType, t.Seat.SeatType, isMatinee);
                return new TicketLineQuote(
                    t.Seat.SeatId,
                    t.Seat.Label,
                    t.Seat.SeatType,
                    t.TicketType,
                    price.BasePriceCents,
                    price.DiscountCents,
                    price.SurchargeCents,
                    price.PriceCents);
            })
            .ToList();

        var concessionLines = concessions
            .Select(c =>
            {
                if (c.Quantity <= 0)
                {
                    throw new ArgumentOutOfRangeException(nameof(concessions), "Concession quantity must be positive.");
                }

                return new ConcessionLineQuote(c.Item.ItemId, c.Item.Name, c.Item.UnitPriceCents, c.Quantity, c.Item.UnitPriceCents * c.Quantity);
            })
            .ToList();

        var ticketSubtotal = ticketLines.Sum(t => t.PriceCents);
        var concessionSubtotal = concessionLines.Sum(c => c.LineTotalCents);
        var discount = ticketLines.Sum(t => t.DiscountCents);
        var taxable = concessionSubtotal + (Rules.TaxTickets ? ticketSubtotal : 0);
        var tax = CalculateTax(taxable);

        return new OrderQuote(
            ticketLines,
            concessionLines,
            isMatinee,
            ticketSubtotal,
            concessionSubtotal,
            discount,
            Rules.SalesTaxRate,
            tax,
            ticketSubtotal + concessionSubtotal + tax);
    }
}
