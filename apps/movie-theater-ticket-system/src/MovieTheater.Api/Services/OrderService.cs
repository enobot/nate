using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MovieTheater.Api.Contracts;
using MovieTheater.Api.Data;
using MovieTheater.Api.Domain;
using MovieTheater.Api.Errors;
using MovieTheater.Api.Hubs;
using MovieTheater.Api.Options;

namespace MovieTheater.Api.Services;

/// <summary>Price quotes, simulated checkout, order history, and cancellation.</summary>
public sealed class OrderService(
    TheaterDbContext db,
    TheaterClock clock,
    PriceCalculator pricing,
    IOptions<BookingOptions> booking,
    ISeatNotifier notifier)
{
    public async Task<OrderQuote> QuoteAsync(QuoteRequest request, CancellationToken ct)
    {
        var screening = await db.Screenings.AsNoTracking().FirstOrDefaultAsync(s => s.Id == request.ScreeningId, ct)
            ?? throw new NotFoundException("Screening not found.");

        var (tickets, concessions) = await ResolveSelectionsAsync(screening, request.Tickets, request.Concessions, ct);
        return pricing.Quote(tickets, concessions, screening.IsMatinee);
    }

    /// <summary>
    /// Turns the cart's held seats into a paid order. Everything happens in one write transaction:
    /// verify the holds, price the order on the server, insert tickets, delete the holds.
    /// If the same cart is checked out twice (double click, retry after a timeout), the existing
    /// order is returned instead of creating a second one.
    /// </summary>
    public async Task<(OrderDto Order, bool Created)> CheckoutAsync(CheckoutRequest request, CancellationToken ct)
    {
        var email = Tokens.NormalizeEmail(request.CustomerEmail);
        var name = request.CustomerName.Trim();
        if (name.Length < 2)
        {
            throw new BadRequestException("invalid-name", "Enter the name for the order.");
        }

        Order order;

        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            var existing = await db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.CartToken == request.CartToken, ct);
            if (existing is not null)
            {
                if (existing.CustomerEmail != email)
                {
                    throw new ConflictException("cart-already-checked-out", "This cart has already been checked out.");
                }

                return (await GetOrderDtoAsync(existing.Id, ct), false);
            }

            var now = clock.UtcNow;
            var holds = await db.SeatHolds.Where(h => h.CartToken == request.CartToken).ToListAsync(ct);
            var activeHolds = holds.Where(h => h.ExpiresAtUtc > now).ToList();
            if (activeHolds.Count == 0)
            {
                throw new ConflictException(
                    "hold-expired",
                    "Your seat hold expired or your cart is empty. Please choose your seats again.");
            }

            var requestedSeatIds = request.Tickets.Select(t => t.SeatId).ToHashSet();
            if (!requestedSeatIds.SetEquals(activeHolds.Select(h => h.SeatId)))
            {
                throw new ConflictException(
                    "cart-changed",
                    "The seats in your cart changed (a hold may have expired). Review your cart and try again.");
            }

            var screening = await db.Screenings
                .Include(s => s.Movie)
                .FirstAsync(s => s.Id == activeHolds[0].ScreeningId, ct);
            if (screening.StartsAtUtc <= now)
            {
                throw new ConflictException("sales-closed", "Ticket sales for this showtime are closed.");
            }

            var (tickets, concessions) = await ResolveSelectionsAsync(screening, request.Tickets, request.Concessions, ct);
            var quote = pricing.Quote(tickets, concessions, screening.IsMatinee);

            if (request.SimulateDecline)
            {
                // Nothing is saved, so the seats stay held and the customer can try again.
                throw new AppException(
                    StatusCodes.Status402PaymentRequired,
                    "payment-declined",
                    "Payment declined",
                    "The simulated payment was declined. No money moved and your seats are still held. Try again.");
            }

            order = new Order
            {
                OrderNumber = await NewUniqueOrderNumberAsync(ct),
                CartToken = request.CartToken,
                ScreeningId = screening.Id,
                CustomerName = name,
                CustomerEmail = email,
                Status = OrderStatus.Paid,
                TicketSubtotalCents = quote.TicketSubtotalCents,
                ConcessionSubtotalCents = quote.ConcessionSubtotalCents,
                DiscountCents = quote.DiscountCents,
                TaxCents = quote.TaxCents,
                TotalCents = quote.TotalCents,
                PaymentReference = Tokens.NewPaymentReference(),
                CreatedAtUtc = now,
                Tickets = quote.Tickets.Select(t => new Ticket
                {
                    ScreeningId = screening.Id,
                    SeatId = t.SeatId,
                    TicketType = t.TicketType,
                    SeatType = t.SeatType,
                    BasePriceCents = t.BasePriceCents,
                    DiscountCents = t.DiscountCents,
                    SurchargeCents = t.SurchargeCents,
                    PriceCents = t.PriceCents,
                }).ToList(),
                ConcessionLines = quote.Concessions.Select(c => new OrderConcessionLine
                {
                    ConcessionItemId = c.ItemId,
                    Name = c.Name,
                    UnitPriceCents = c.UnitPriceCents,
                    Quantity = c.Quantity,
                    LineTotalCents = c.LineTotalCents,
                }).ToList(),
            };

            db.Orders.Add(order);
            db.SeatHolds.RemoveRange(holds);

            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException ex) when (TheaterDbContext.IsUniqueViolation(ex))
            {
                throw new ConflictException(
                    "seat-unavailable",
                    "One of your seats was just sold to someone else. Please choose different seats.");
            }

            await tx.CommitAsync(ct);
        }

        await notifier.SeatsChangedAsync(
            order.ScreeningId,
            order.Tickets.Select(t => new SeatChange(t.SeatId, SeatStatus.Sold)).ToList(),
            ct);

        return (await GetOrderDtoAsync(order.Id, ct), true);
    }

    /// <summary>
    /// Order history for a customer without accounts: the order number proves the customer owns
    /// the email, then every order for that email is returned. A wrong pair gets the same 404 as
    /// a missing one, so the endpoint does not reveal which emails have orders.
    /// </summary>
    public async Task<IReadOnlyList<OrderDto>> GetHistoryAsync(string orderNumber, string email, CancellationToken ct)
    {
        var number = Tokens.NormalizeOrderNumber(orderNumber);
        var normalizedEmail = Tokens.NormalizeEmail(email);

        var owns = await db.Orders.AnyAsync(o => o.OrderNumber == number && o.CustomerEmail == normalizedEmail, ct);
        if (!owns)
        {
            throw new NotFoundException("We couldn't find an order with that number and email.");
        }

        var orders = await OrdersWithDetails()
            .Where(o => o.CustomerEmail == normalizedEmail)
            .ToListAsync(ct);

        return orders
            .OrderByDescending(o => o.CreatedAtUtc)
            .ThenByDescending(o => o.Id)
            .Select(ToDto)
            .ToList();
    }

    public async Task<OrderDto> CancelByCustomerAsync(string orderNumber, string email, CancellationToken ct)
    {
        var number = Tokens.NormalizeOrderNumber(orderNumber);
        var normalizedEmail = Tokens.NormalizeEmail(email);
        return await CancelAsync(
            o => o.OrderNumber == number && o.CustomerEmail == normalizedEmail,
            CancellationSource.Customer,
            reason: null,
            ct);
    }

    public Task<OrderDto> CancelByAdminAsync(string orderNumber, string? reason, CancellationToken ct)
    {
        var number = Tokens.NormalizeOrderNumber(orderNumber);
        var trimmed = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
        return CancelAsync(o => o.OrderNumber == number, CancellationSource.Admin, trimmed, ct);
    }

    public async Task<OrderDto> GetOrderDtoAsync(int orderId, CancellationToken ct)
    {
        var order = await OrdersWithDetails().FirstAsync(o => o.Id == orderId, ct);
        return ToDto(order);
    }

    public async Task<OrderDto> GetOrderDtoAsync(string orderNumber, CancellationToken ct)
    {
        var number = Tokens.NormalizeOrderNumber(orderNumber);
        var order = await OrdersWithDetails().FirstOrDefaultAsync(o => o.OrderNumber == number, ct)
            ?? throw new NotFoundException("Order not found.");
        return ToDto(order);
    }

    /// <summary>The last moment a customer can cancel online.</summary>
    public DateTime CancelDeadlineUtc(DateTime screeningStartsAtUtc) =>
        screeningStartsAtUtc.AddMinutes(-booking.Value.CancellationCutoffMinutes);

    private async Task<OrderDto> CancelAsync(
        System.Linq.Expressions.Expression<Func<Order, bool>> match,
        CancellationSource source,
        string? reason,
        CancellationToken ct)
    {
        Order order;
        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            order = await db.Orders
                .Include(o => o.Tickets)
                .Include(o => o.Screening)
                .FirstOrDefaultAsync(match, ct)
                ?? throw new NotFoundException("We couldn't find an order with that number and email.");

            if (order.Status == OrderStatus.Cancelled)
            {
                throw new ConflictException("already-cancelled", "This order is already cancelled.");
            }

            var now = clock.UtcNow;
            if (source == CancellationSource.Customer && now >= CancelDeadlineUtc(order.Screening!.StartsAtUtc))
            {
                throw new ConflictException(
                    "cancellation-closed",
                    $"Online cancellation closes {booking.Value.CancellationCutoffMinutes} minutes before showtime.");
            }

            order.Status = OrderStatus.Cancelled;
            order.CancelledAtUtc = now;
            order.CancelledBy = source;
            order.CancellationReason = reason;
            order.RefundedCents = order.TotalCents;
            foreach (var ticket in order.Tickets)
            {
                ticket.IsCancelled = true;
            }

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }

        await notifier.SeatsChangedAsync(
            order.ScreeningId,
            order.Tickets.Select(t => new SeatChange(t.SeatId, SeatStatus.Available)).ToList(),
            ct);

        return await GetOrderDtoAsync(order.Id, ct);
    }

    /// <summary>
    /// Loads seats and menu items from the database so that prices, seat types, and item names
    /// always come from the server, never from the request.
    /// </summary>
    private async Task<(List<(PricedSeat Seat, TicketType TicketType)> Tickets, List<(PricedConcession Item, int Quantity)> Concessions)>
        ResolveSelectionsAsync(
            Screening screening,
            IReadOnlyList<TicketSelection> ticketSelections,
            IReadOnlyList<ConcessionSelection> concessionSelections,
            CancellationToken ct)
    {
        var options = booking.Value;

        if (ticketSelections.Count == 0)
        {
            throw new BadRequestException("no-tickets", "Choose at least one seat.");
        }

        if (ticketSelections.Count > options.MaxSeatsPerOrder)
        {
            throw new BadRequestException("seat-limit", $"An order can have at most {options.MaxSeatsPerOrder} tickets.");
        }

        var seatIds = ticketSelections.Select(t => t.SeatId).ToList();
        if (seatIds.Distinct().Count() != seatIds.Count)
        {
            throw new BadRequestException("duplicate-seat", "Each seat can only appear once in an order.");
        }

        var seats = await db.Seats
            .AsNoTracking()
            .Where(s => seatIds.Contains(s.Id) && s.AuditoriumId == screening.AuditoriumId)
            .ToDictionaryAsync(s => s.Id, ct);
        if (seats.Count != seatIds.Count)
        {
            throw new BadRequestException("unknown-seat", "One or more seats are not part of this auditorium.");
        }

        var itemIds = concessionSelections.Select(c => c.ItemId).ToList();
        if (itemIds.Distinct().Count() != itemIds.Count)
        {
            throw new BadRequestException("duplicate-concession", "List each concession item once and set its quantity.");
        }

        if (concessionSelections.Any(c => c.Quantity < 1 || c.Quantity > options.MaxConcessionQuantity))
        {
            throw new BadRequestException(
                "concession-quantity",
                $"Concession quantities must be between 1 and {options.MaxConcessionQuantity}.");
        }

        var items = await db.ConcessionItems
            .AsNoTracking()
            .Where(c => itemIds.Contains(c.Id) && c.IsAvailable)
            .ToDictionaryAsync(c => c.Id, ct);
        if (items.Count != itemIds.Count)
        {
            throw new BadRequestException("unknown-concession", "One or more concession items are not available.");
        }

        var tickets = ticketSelections
            .Select(t => (Entity: seats[t.SeatId], t.TicketType))
            .OrderBy(t => t.Entity.Row, StringComparer.Ordinal)
            .ThenBy(t => t.Entity.Number)
            .Select(t => (new PricedSeat(t.Entity.Id, t.Entity.Label, t.Entity.SeatType), t.TicketType))
            .ToList();

        var concessions = concessionSelections
            .Select(c =>
            {
                var item = items[c.ItemId];
                return (new PricedConcession(item.Id, item.Name, item.PriceCents), c.Quantity);
            })
            .ToList();

        return (tickets, concessions);
    }

    private async Task<string> NewUniqueOrderNumberAsync(CancellationToken ct)
    {
        // 32^8 possible numbers, so a collision is very unlikely; check anyway inside the transaction.
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var candidate = Tokens.NewOrderNumber();
            if (!await db.Orders.AnyAsync(o => o.OrderNumber == candidate, ct))
            {
                return candidate;
            }
        }

        throw new InvalidOperationException("Could not generate a unique order number.");
    }

    private IQueryable<Order> OrdersWithDetails() =>
        db.Orders
            .AsNoTracking()
            .AsSplitQuery()
            .Include(o => o.Tickets).ThenInclude(t => t.Seat)
            .Include(o => o.ConcessionLines)
            .Include(o => o.Screening).ThenInclude(s => s!.Movie)
            .Include(o => o.Screening).ThenInclude(s => s!.Auditorium);

    private OrderDto ToDto(Order o)
    {
        var screening = o.Screening!;
        var deadline = CancelDeadlineUtc(screening.StartsAtUtc);
        var canCancel = o.Status == OrderStatus.Paid && clock.UtcNow < deadline;

        return new OrderDto(
            o.OrderNumber,
            o.Status,
            o.CustomerName,
            o.CustomerEmail,
            o.ScreeningId,
            screening.Movie!.Title,
            screening.Movie.PosterPalette,
            screening.Movie.PosterMotif,
            screening.Auditorium!.Name,
            screening.StartsAtUtc,
            clock.ToLocal(screening.StartsAtUtc),
            screening.IsMatinee,
            o.Tickets
                .OrderBy(t => t.Seat!.Row)
                .ThenBy(t => t.Seat!.Number)
                .Select(t => new TicketDto(
                    t.SeatId,
                    t.Seat!.Label,
                    t.SeatType,
                    t.TicketType,
                    t.BasePriceCents,
                    t.DiscountCents,
                    t.SurchargeCents,
                    t.PriceCents,
                    t.IsCancelled))
                .ToList(),
            o.ConcessionLines
                .OrderBy(l => l.Name)
                .Select(l => new OrderConcessionDto(l.ConcessionItemId, l.Name, l.UnitPriceCents, l.Quantity, l.LineTotalCents))
                .ToList(),
            o.TicketSubtotalCents,
            o.ConcessionSubtotalCents,
            o.DiscountCents,
            o.TaxCents,
            o.TotalCents,
            o.RefundedCents,
            o.PaymentReference,
            o.CreatedAtUtc,
            o.CancelledAtUtc,
            o.CancelledBy,
            o.CancellationReason,
            canCancel,
            deadline);
    }
}
