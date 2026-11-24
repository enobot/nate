using MovieTheater.Api.Domain;
using MovieTheater.Api.Options;

namespace MovieTheater.Tests.Unit;

public class PriceCalculatorTests
{
    // Default rules from appsettings.json, written out so the expected numbers are easy to check by hand.
    private static PricingOptions DefaultRules() => new()
    {
        AdultCents = 1450,
        ChildCents = 1050,
        SeniorCents = 1150,
        MatineeDiscountCents = 300,
        MatineeCutoffHour = 16,
        PremiumSurchargeCents = 350,
        SalesTaxRate = 0.0775m,
        TaxTickets = false,
    };

    private static readonly PriceCalculator Calculator = new(DefaultRules());

    private static PricedSeat Seat(SeatType type, string label = "C7") => new(1, label, type);

    [Theory]
    [InlineData(TicketType.Adult, 1450)]
    [InlineData(TicketType.Child, 1050)]
    [InlineData(TicketType.Senior, 1150)]
    public void Evening_standard_seat_costs_the_base_price(TicketType type, int expected)
    {
        var price = Calculator.PriceTicket(type, SeatType.Standard, isMatinee: false);

        Assert.Equal(expected, price.BasePriceCents);
        Assert.Equal(0, price.DiscountCents);
        Assert.Equal(0, price.SurchargeCents);
        Assert.Equal(expected, price.PriceCents);
    }

    [Theory]
    [InlineData(TicketType.Adult, 1150)]
    [InlineData(TicketType.Child, 750)]
    [InlineData(TicketType.Senior, 850)]
    public void Matinee_takes_the_discount_off_every_ticket_type(TicketType type, int expected)
    {
        var price = Calculator.PriceTicket(type, SeatType.Standard, isMatinee: true);

        Assert.Equal(300, price.DiscountCents);
        Assert.Equal(expected, price.PriceCents);
    }

    [Fact]
    public void Premium_seat_adds_the_surcharge()
    {
        var price = Calculator.PriceTicket(TicketType.Adult, SeatType.Premium, isMatinee: false);

        Assert.Equal(350, price.SurchargeCents);
        Assert.Equal(1800, price.PriceCents);
    }

    [Fact]
    public void Premium_matinee_applies_discount_and_surcharge()
    {
        var price = Calculator.PriceTicket(TicketType.Child, SeatType.Premium, isMatinee: true);

        // 10.50 - 3.00 + 3.50
        Assert.Equal(1100, price.PriceCents);
    }

    [Fact]
    public void Accessible_seat_costs_the_same_as_standard()
    {
        var accessible = Calculator.PriceTicket(TicketType.Senior, SeatType.Accessible, isMatinee: false);
        var standard = Calculator.PriceTicket(TicketType.Senior, SeatType.Standard, isMatinee: false);

        Assert.Equal(standard, accessible);
    }

    [Fact]
    public void Matinee_discount_never_makes_a_ticket_negative()
    {
        var rules = DefaultRules();
        rules.MatineeDiscountCents = 5000;
        var calculator = new PriceCalculator(rules);

        var price = calculator.PriceTicket(TicketType.Child, SeatType.Standard, isMatinee: true);

        Assert.Equal(1050, price.DiscountCents);
        Assert.Equal(0, price.PriceCents);
    }

    [Theory]
    [InlineData(11, 0, true)]
    [InlineData(15, 59, true)]
    [InlineData(16, 0, false)]
    [InlineData(21, 40, false)]
    public void Matinee_means_starting_before_the_cutoff_hour(int hour, int minute, bool expected)
    {
        Assert.Equal(expected, Calculator.IsMatinee(new DateTime(2026, 3, 3, hour, minute, 0)));
    }

    [Fact]
    public void Matinee_cutoff_is_configurable()
    {
        var rules = DefaultRules();
        rules.MatineeCutoffHour = 18;
        var calculator = new PriceCalculator(rules);

        Assert.True(calculator.IsMatinee(new DateTime(2026, 3, 3, 17, 30, 0)));
    }

    [Fact]
    public void Tax_is_charged_on_concessions_only_by_default()
    {
        var quote = Calculator.Quote(
            [(Seat(SeatType.Standard, "C7"), TicketType.Adult), (Seat(SeatType.Standard, "C8"), TicketType.Child)],
            [(new PricedConcession(2, "Popcorn (Large)", 900), 1), (new PricedConcession(6, "Fountain Drink (Medium)", 550), 2)],
            isMatinee: false);

        Assert.Equal(2500, quote.TicketSubtotalCents);       // 14.50 + 10.50
        Assert.Equal(2000, quote.ConcessionSubtotalCents);   // 9.00 + 2 x 5.50
        Assert.Equal(155, quote.TaxCents);                   // 7.75% of 20.00
        Assert.Equal(4655, quote.TotalCents);
        Assert.Equal(0.0775m, quote.SalesTaxRate);
    }

    [Fact]
    public void Tickets_are_taxed_when_the_setting_is_on()
    {
        var rules = DefaultRules();
        rules.TaxTickets = true;
        var calculator = new PriceCalculator(rules);

        var quote = calculator.Quote([(Seat(SeatType.Standard), TicketType.Adult)], [], isMatinee: false);

        Assert.Equal(112, quote.TaxCents);  // 7.75% of 14.50 = 1.12375, rounds to 1.12
        Assert.Equal(1562, quote.TotalCents);
    }

    [Theory]
    [InlineData(600, 47)]   // 46.5 cents rounds half away from zero
    [InlineData(1000, 78)]  // 77.5 cents rounds up
    [InlineData(1, 0)]      // 0.0775 cents rounds to nothing
    [InlineData(0, 0)]
    public void Tax_rounds_to_whole_cents_half_away_from_zero(int taxable, int expected)
    {
        Assert.Equal(expected, Calculator.CalculateTax(taxable));
    }

    [Fact]
    public void Quote_reports_the_matinee_discount_total()
    {
        var quote = Calculator.Quote(
            [(Seat(SeatType.Premium, "E5"), TicketType.Adult), (Seat(SeatType.Standard, "E6"), TicketType.Senior)],
            [],
            isMatinee: true);

        Assert.True(quote.IsMatinee);
        Assert.Equal(600, quote.DiscountCents);
        Assert.Equal(1500 + 850, quote.TicketSubtotalCents);
        Assert.Equal(0, quote.TaxCents);
        Assert.Equal(2350, quote.TotalCents);
        Assert.Collection(
            quote.Tickets,
            t => Assert.Equal(("E5", 1500), (t.SeatLabel, t.PriceCents)),
            t => Assert.Equal(("E6", 850), (t.SeatLabel, t.PriceCents)));
    }

    [Fact]
    public void Empty_quote_is_zero()
    {
        var quote = Calculator.Quote([], [], isMatinee: false);

        Assert.Equal(0, quote.TotalCents);
        Assert.Empty(quote.Tickets);
    }

    [Fact]
    public void Concession_quantity_must_be_positive()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            Calculator.Quote([], [(new PricedConcession(1, "Candy Box", 475), 0)], isMatinee: false));
    }

    [Fact]
    public void Concession_line_total_is_unit_price_times_quantity()
    {
        var quote = Calculator.Quote([], [(new PricedConcession(5, "Candy Box", 475), 3)], isMatinee: false);

        var line = Assert.Single(quote.Concessions);
        Assert.Equal(1425, line.LineTotalCents);
        Assert.Equal(110, quote.TaxCents);  // 7.75% of 14.25 = 1.104375
        Assert.Equal(1535, quote.TotalCents);
    }
}
