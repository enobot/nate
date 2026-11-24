using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MovieTheater.Api.Contracts;
using MovieTheater.Api.Data;
using MovieTheater.Api.Domain;
using MovieTheater.Api.Errors;
using MovieTheater.Api.Hubs;
using MovieTheater.Api.Options;

namespace MovieTheater.Api.Services;

/// <summary>
/// Seat holds. A cart is identified only by a random token; its contents are the
/// <see cref="SeatHold"/> rows with that token. All seats in a cart belong to one screening
/// and share one expiry time, set when the first seat is held.
/// </summary>
public sealed class CartService(
    TheaterDbContext db,
    TheaterClock clock,
    IOptions<BookingOptions> booking,
    ISeatNotifier notifier)
{
    public async Task<CartResponse> GetCartAsync(string cartToken, CancellationToken ct)
    {
        EnsureToken(cartToken);
        var now = clock.UtcNow;
        var holds = await db.SeatHolds
            .AsNoTracking()
            .Include(h => h.Seat)
            .Where(h => h.CartToken == cartToken && h.ExpiresAtUtc > now)
            .ToListAsync(ct);

        var ordered = holds.OrderBy(h => h.Seat!.Row).ThenBy(h => h.Seat!.Number).ToList();
        return new CartResponse(
            cartToken,
            ordered.FirstOrDefault()?.ScreeningId,
            ordered.Select(h => new CartHoldDto(h.SeatId, h.Seat!.Label, h.Seat.Row, h.Seat.Number, h.Seat.SeatType)).ToList(),
            ordered.Count == 0 ? null : ordered.Min(h => h.ExpiresAtUtc),
            now);
    }

    /// <summary>
    /// Holds one seat for this cart. Runs in a write transaction (SQLite BEGIN IMMEDIATE), so two
    /// requests for the same seat are serialized: the second one sees the first hold and gets 409.
    /// The unique index on (ScreeningId, SeatId) is the final guard if anything slips past the checks.
    /// </summary>
    public async Task<CartResponse> HoldSeatAsync(string cartToken, int screeningId, int seatId, CancellationToken ct)
    {
        EnsureToken(cartToken);
        var options = booking.Value;
        List<SeatHold> released;

        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            var now = clock.UtcNow;
            var screening = await db.Screenings
                .Include(s => s.Movie)
                .FirstOrDefaultAsync(s => s.Id == screeningId, ct)
                ?? throw new NotFoundException("Screening not found.");

            if (screening.StartsAtUtc <= now || !screening.Movie!.IsActive)
            {
                throw new ConflictException("sales-closed", "Ticket sales for this showtime are closed.");
            }

            var seat = await db.Seats.FirstOrDefaultAsync(s => s.Id == seatId && s.AuditoriumId == screening.AuditoriumId, ct)
                ?? throw new NotFoundException("That seat is not in this auditorium.");

            // Clear out expired holds on this seat and in this cart before checking anything.
            released = await db.SeatHolds
                .Where(h => h.ExpiresAtUtc <= now
                    && ((h.ScreeningId == screeningId && h.SeatId == seatId) || h.CartToken == cartToken))
                .ToListAsync(ct);
            if (released.Count > 0)
            {
                db.SeatHolds.RemoveRange(released);
                await db.SaveChangesAsync(ct);
            }

            var cartHolds = await db.SeatHolds
                .Where(h => h.CartToken == cartToken)
                .ToListAsync(ct);

            if (cartHolds.Any(h => h.ScreeningId != screeningId))
            {
                throw new ConflictException(
                    "cart-other-screening",
                    "Your cart already has seats for a different showtime. Release them before choosing seats here.");
            }

            if (cartHolds.Any(h => h.SeatId == seatId))
            {
                // Already held by this cart: holding again is a no-op.
                await tx.CommitAsync(ct);
                await NotifyReleasedAsync(released, ct);
                return await GetCartAsync(cartToken, ct);
            }

            if (cartHolds.Count >= options.MaxSeatsPerOrder)
            {
                throw new ConflictException("seat-limit", $"You can hold up to {options.MaxSeatsPerOrder} seats in one order.");
            }

            var sold = await db.Tickets.AnyAsync(t => t.ScreeningId == screeningId && t.SeatId == seatId && !t.IsCancelled, ct);
            if (sold)
            {
                throw new ConflictException("seat-unavailable", $"Seat {seat.Label} has already been sold.");
            }

            var heldByAnotherCart = await db.SeatHolds.AnyAsync(h => h.ScreeningId == screeningId && h.SeatId == seatId, ct);
            if (heldByAnotherCart)
            {
                throw new ConflictException("seat-unavailable", $"Seat {seat.Label} is being held by another customer.");
            }

            var expiresAt = cartHolds.Count > 0
                ? cartHolds.Min(h => h.ExpiresAtUtc)
                : now.AddMinutes(options.HoldMinutes);

            db.SeatHolds.Add(new SeatHold
            {
                CartToken = cartToken,
                ScreeningId = screeningId,
                SeatId = seatId,
                CreatedAtUtc = now,
                ExpiresAtUtc = expiresAt,
            });

            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException ex) when (TheaterDbContext.IsUniqueViolation(ex))
            {
                throw new ConflictException("seat-unavailable", $"Seat {seat.Label} was just taken by another customer.");
            }

            await tx.CommitAsync(ct);
        }

        await NotifyReleasedAsync(released, ct);
        await notifier.SeatsChangedAsync(screeningId, [new SeatChange(seatId, SeatStatus.Held)], ct);
        return await GetCartAsync(cartToken, ct);
    }

    public async Task<CartResponse> ReleaseSeatAsync(string cartToken, int seatId, CancellationToken ct)
    {
        EnsureToken(cartToken);
        var holds = await db.SeatHolds
            .Where(h => h.CartToken == cartToken && h.SeatId == seatId)
            .ToListAsync(ct);

        if (holds.Count > 0)
        {
            db.SeatHolds.RemoveRange(holds);
            await db.SaveChangesAsync(ct);
            await NotifyReleasedAsync(holds, ct);
        }

        return await GetCartAsync(cartToken, ct);
    }

    public async Task ClearCartAsync(string cartToken, CancellationToken ct)
    {
        EnsureToken(cartToken);
        var holds = await db.SeatHolds.Where(h => h.CartToken == cartToken).ToListAsync(ct);
        if (holds.Count == 0)
        {
            return;
        }

        db.SeatHolds.RemoveRange(holds);
        await db.SaveChangesAsync(ct);
        await NotifyReleasedAsync(holds, ct);
    }

    /// <summary>Deletes every expired hold and tells seat-map viewers those seats are free again.</summary>
    public async Task<int> ReleaseExpiredHoldsAsync(CancellationToken ct)
    {
        List<SeatHold> expired;
        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            var now = clock.UtcNow;
            expired = await db.SeatHolds.Where(h => h.ExpiresAtUtc <= now).ToListAsync(ct);
            if (expired.Count == 0)
            {
                return 0;
            }

            db.SeatHolds.RemoveRange(expired);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }

        await NotifyReleasedAsync(expired, ct);
        return expired.Count;
    }

    private async Task NotifyReleasedAsync(IEnumerable<SeatHold> holds, CancellationToken ct)
    {
        foreach (var group in holds.GroupBy(h => h.ScreeningId))
        {
            await notifier.SeatsChangedAsync(
                group.Key,
                group.Select(h => new SeatChange(h.SeatId, SeatStatus.Available)).ToList(),
                ct);
        }
    }

    private static void EnsureToken(string cartToken)
    {
        if (!Tokens.IsValidCartToken(cartToken))
        {
            throw new NotFoundException("Cart not found. Start a new cart and choose your seats again.");
        }
    }
}
