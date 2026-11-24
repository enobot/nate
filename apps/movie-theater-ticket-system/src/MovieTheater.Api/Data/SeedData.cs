using MovieTheater.Api.Domain;
using MovieTheater.Api.Services;

namespace MovieTheater.Api.Data;

/// <summary>
/// Fictional sample data. Every title, synopsis, and customer below is invented for this demo.
/// The data is deterministic: the same movies, auditoriums, seat layouts, schedule pattern, and
/// sample orders are created every time. Only the dates move, because the week of screenings
/// starts on the day the database is created.
/// </summary>
public static class SeedData
{
    public sealed record MovieSeed(string Title, string Tagline, string Synopsis, string Genre, string Rating, int Runtime, string Palette, string Motif);

    public static readonly MovieSeed[] Movies =
    [
        new("Orbit of Small Hours", "Some signals only arrive after midnight.",
            "A night-shift astronomer at a mountain observatory picks up a signal that repeats at exactly 3:17 a.m. As she traces it, she finds it is describing the observatory itself, one room at a time.",
            "Sci-Fi", "PG-13", 128, "violet", "orbit"),
        new("The Clockmaker's Fog", "Every clock in town stopped at once. Except one.",
            "In a harbor town where every clock stopped on the same foggy morning, a clockmaker's apprentice repairs the single clock that still ticks and starts finding notes hidden in its gears.",
            "Mystery", "PG-13", 112, "frost", "rings"),
        new("Pocket Full of Comets", "Finders keepers does not apply to comets.",
            "Two siblings catch a falling comet in a jam jar during a summer power outage. They have one week to return it to the sky before it outgrows the jar, the house, and the neighborhood.",
            "Family", "G", 94, "gold", "stars"),
        new("Neon Tide Runners", "The gates close at high tide.",
            "Courier crews race across a flooded coastal city to deliver the last shipment before the sea barriers seal for the season. One rider is carrying something the city council wants lost.",
            "Action", "PG-13", 121, "tide", "waves"),
        new("Saltwind Station", "The distress call came before the storm.",
            "A weather station crew is cut off by a week-long storm. When they replay the distress call that brought the rescue boat, they realize it was sent before the storm began.",
            "Thriller", "R", 107, "ember", "beam"),
        new("Ferns & Fireworks", "Same festival. Same night. Very different plans.",
            "A careful botanist and a reckless pyrotechnician are both booked as the main event of a small-town garden festival. Neither will cancel, and the town has one field.",
            "Comedy", "PG-13", 101, "moss", "sun"),
        new("The Last Lighthouse Choir", "One more song for the coast.",
            "A retired music teacher gathers the keepers of six decommissioned lighthouses for a final concert, carried by radio to the ships that once relied on their lights.",
            "Drama", "PG", 118, "dusk", "peaks"),
        new("Hollow Pines Overnight", "The ranger station radio answers back.",
            "A group of camp counselors spend the night before opening day at an empty lakeside camp. The old ranger radio starts answering questions nobody has asked yet.",
            "Horror", "R", 99, "aurora", "grid"),
    ];

    public sealed record AuditoriumSeed(string Name, int Rows, int SeatsPerRow, string AisleAfter, Func<string, int, SeatType> SeatTypeFor);

    public static readonly AuditoriumSeed[] Auditoriums =
    [
        new("Auditorium 1", 8, 14, "3,11", (row, n) =>
            row == "A" && n is 1 or 2 or 13 or 14 ? SeatType.Accessible
            : row is "E" or "F" && n is >= 4 and <= 11 ? SeatType.Premium
            : SeatType.Standard),
        new("Auditorium 2", 7, 12, "2,10", (row, n) =>
            row == "A" && n is 1 or 2 or 11 or 12 ? SeatType.Accessible
            : row == "E" && n is >= 3 and <= 10 ? SeatType.Premium
            : SeatType.Standard),
        new("Auditorium 3", 5, 8, "4", (row, n) =>
            row == "A" && n is 1 or 8 ? SeatType.Accessible
            : row is "C" or "D" or "E" ? SeatType.Premium
            : SeatType.Standard),
    ];

    /// <summary>Daily start times (theater-local) per auditorium, in the same order as <see cref="Auditoriums"/>.</summary>
    public static readonly TimeOnly[][] DailySlots =
    [
        [new(11, 0), new(14, 15), new(17, 30), new(20, 45)],
        [new(12, 0), new(15, 15), new(18, 30), new(21, 40)],
        [new(13, 0), new(16, 30), new(19, 45)],
    ];

    public static readonly (string Name, string Description, ConcessionCategory Category, int PriceCents)[] Concessions =
    [
        ("Popcorn (Small)", "Fresh popped, lightly salted.", ConcessionCategory.Snack, 650),
        ("Popcorn (Large)", "Free butter topping on request.", ConcessionCategory.Snack, 900),
        ("Nachos", "Tortilla chips with warm cheese sauce.", ConcessionCategory.Snack, 800),
        ("Pretzel Bites", "Soft pretzel bites with mustard.", ConcessionCategory.Snack, 700),
        ("Candy Box", "Assorted chocolate or fruit candy.", ConcessionCategory.Snack, 475),
        ("Fountain Drink (Medium)", "Choice of soda or iced tea.", ConcessionCategory.Drink, 550),
        ("Fountain Drink (Large)", "Choice of soda or iced tea.", ConcessionCategory.Drink, 650),
        ("Bottled Water", "Still water, 500 ml.", ConcessionCategory.Drink, 400),
        ("Date Night Combo", "Large popcorn and two medium drinks.", ConcessionCategory.Combo, 1800),
    ];

    /// <summary>Number of days of screenings created, starting with the creation day.</summary>
    public const int ScheduleDays = 7;

    /// <summary>
    /// Builds all seed entities. Sample orders are priced with the real <see cref="PriceCalculator"/>,
    /// so their totals follow the same rules as live orders.
    /// </summary>
    public static void Populate(TheaterDbContext db, TheaterClock clock, PriceCalculator pricing)
    {
        var now = clock.UtcNow;
        var today = clock.Today;

        var movies = Movies.Select(m => new Movie
        {
            Title = m.Title,
            Tagline = m.Tagline,
            Synopsis = m.Synopsis,
            Genre = m.Genre,
            Rating = m.Rating,
            RuntimeMinutes = m.Runtime,
            PosterPalette = m.Palette,
            PosterMotif = m.Motif,
            IsActive = true,
            CreatedAtUtc = now,
        }).ToList();
        db.Movies.AddRange(movies);

        var auditoriums = Auditoriums.Select(a =>
        {
            var auditorium = new Auditorium { Name = a.Name, RowCount = a.Rows, SeatsPerRow = a.SeatsPerRow, AisleAfter = a.AisleAfter };
            for (var r = 0; r < a.Rows; r++)
            {
                var row = ((char)('A' + r)).ToString();
                for (var n = 1; n <= a.SeatsPerRow; n++)
                {
                    auditorium.Seats.Add(new Seat { Row = row, Number = n, SeatType = a.SeatTypeFor(row, n) });
                }
            }

            return auditorium;
        }).ToList();
        db.Auditoriums.AddRange(auditoriums);

        var concessions = Concessions.Select((c, i) => new ConcessionItem
        {
            Name = c.Name,
            Description = c.Description,
            Category = c.Category,
            PriceCents = c.PriceCents,
            IsAvailable = true,
            SortOrder = i,
        }).ToList();
        db.ConcessionItems.AddRange(concessions);

        // A rotating schedule: each slot shows a different movie each day.
        var screenings = new List<Screening>();
        for (var day = 0; day < ScheduleDays; day++)
        {
            var date = today.AddDays(day);
            for (var a = 0; a < auditoriums.Count; a++)
            {
                for (var s = 0; s < DailySlots[a].Length; s++)
                {
                    var movie = movies[(day + (a * 3) + (s * 5)) % movies.Count];
                    var local = date.ToDateTime(DailySlots[a][s]);
                    screenings.Add(new Screening
                    {
                        Movie = movie,
                        Auditorium = auditoriums[a],
                        StartsAtUtc = clock.ToUtc(local),
                        IsMatinee = pricing.IsMatinee(local),
                        CreatedAtUtc = now,
                    });
                }
            }
        }

        db.Screenings.AddRange(screenings);

        // Sample orders on upcoming screenings so the seat maps and the sales report have data.
        var upcoming = screenings.Where(s => s.StartsAtUtc > now.AddHours(2)).OrderBy(s => s.StartsAtUtc).ToList();
        var samples = new (int ScreeningIndex, string Name, string Email, (string Seat, TicketType Type)[] Seats, (int Item, int Qty)[] Snacks, bool Cancelled)[]
        {
            (0, "Jordan Rivera", "jordan.rivera@example.com", [("E5", TicketType.Adult), ("E6", TicketType.Adult)], [(8, 1)], false),
            (1, "Priya Natarajan", "priya.n@example.com", [("D4", TicketType.Adult), ("D5", TicketType.Child), ("D6", TicketType.Child)], [(1, 1), (5, 2)], false),
            (2, "Marcus Bell", "marcus.bell@example.com", [("A1", TicketType.Senior), ("A2", TicketType.Adult)], [], false),
            (3, "Jordan Rivera", "jordan.rivera@example.com", [("C3", TicketType.Adult)], [(4, 1)], true),
            (4, "Elena Sato", "elena.sato@example.com", [("D7", TicketType.Adult), ("D8", TicketType.Adult)], [(2, 1), (6, 2)], false),
            (5, "Sam Okafor", "sam.okafor@example.com", [("B6", TicketType.Senior), ("B7", TicketType.Senior)], [(7, 2)], false),
            (6, "Lucia Moreno", "lucia.moreno@example.com", [("C4", TicketType.Adult), ("C5", TicketType.Adult), ("C6", TicketType.Child), ("C7", TicketType.Child)], [(0, 2), (5, 2)], false),
        };

        for (var i = 0; i < samples.Length && i < upcoming.Count; i++)
        {
            var sample = samples[i];
            var screening = upcoming[Math.Min(sample.ScreeningIndex * 2, upcoming.Count - 1)];
            var seats = sample.Seats
                .Select(x => (Seat: screening.Auditorium!.Seats.First(seat => seat.Label == x.Seat), x.Type))
                .ToList();
            var quote = pricing.Quote(
                seats.Select(x => (new PricedSeat(0, x.Seat.Label, x.Seat.SeatType), x.Type)).ToList(),
                sample.Snacks.Select(x => (new PricedConcession(0, concessions[x.Item].Name, concessions[x.Item].PriceCents), x.Qty)).ToList(),
                screening.IsMatinee);

            var createdAt = now.AddHours(-(samples.Length - i) * 5);
            var order = new Order
            {
                OrderNumber = $"MT-SEED{i + 1:0000}",
                Screening = screening,
                CustomerName = sample.Name,
                CustomerEmail = sample.Email,
                Status = sample.Cancelled ? OrderStatus.Cancelled : OrderStatus.Paid,
                TicketSubtotalCents = quote.TicketSubtotalCents,
                ConcessionSubtotalCents = quote.ConcessionSubtotalCents,
                DiscountCents = quote.DiscountCents,
                TaxCents = quote.TaxCents,
                TotalCents = quote.TotalCents,
                RefundedCents = sample.Cancelled ? quote.TotalCents : 0,
                PaymentReference = $"SIM-SEED{i + 1:00000000}",
                CreatedAtUtc = createdAt,
                CancelledAtUtc = sample.Cancelled ? createdAt.AddHours(1) : null,
                CancelledBy = sample.Cancelled ? CancellationSource.Customer : null,
            };

            for (var t = 0; t < seats.Count; t++)
            {
                var line = quote.Tickets[t];
                order.Tickets.Add(new Ticket
                {
                    Screening = screening,
                    Seat = seats[t].Seat,
                    TicketType = line.TicketType,
                    SeatType = line.SeatType,
                    BasePriceCents = line.BasePriceCents,
                    DiscountCents = line.DiscountCents,
                    SurchargeCents = line.SurchargeCents,
                    PriceCents = line.PriceCents,
                    IsCancelled = sample.Cancelled,
                });
            }

            foreach (var (item, qty) in sample.Snacks)
            {
                order.ConcessionLines.Add(new OrderConcessionLine
                {
                    ConcessionItem = concessions[item],
                    Name = concessions[item].Name,
                    UnitPriceCents = concessions[item].PriceCents,
                    Quantity = qty,
                    LineTotalCents = concessions[item].PriceCents * qty,
                });
            }

            db.Orders.Add(order);
        }
    }
}
