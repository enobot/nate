using Microsoft.AspNetCore.Mvc;
using MovieTheater.Api.Contracts;
using MovieTheater.Api.Services;

namespace MovieTheater.Api.Controllers;

[ApiController]
[Route("api/carts")]
public sealed class CartsController(CartService carts) : ControllerBase
{
    /// <summary>Starts a new, empty cart and returns its random token.</summary>
    [HttpPost]
    [ProducesResponseType<CartResponse>(StatusCodes.Status201Created)]
    public async Task<ActionResult<CartResponse>> Create(CancellationToken ct)
    {
        var cart = await carts.GetCartAsync(Tokens.NewCartToken(), ct);
        return CreatedAtAction(nameof(Get), new { cartToken = cart.CartToken }, cart);
    }

    [HttpGet("{cartToken}")]
    [ProducesResponseType<CartResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<CartResponse> Get(string cartToken, CancellationToken ct) => carts.GetCartAsync(cartToken, ct);

    /// <summary>Holds a seat for this cart. Returns 409 if someone else holds or bought it.</summary>
    [HttpPost("{cartToken}/holds")]
    [ProducesResponseType<CartResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<CartResponse> Hold(string cartToken, HoldSeatRequest request, CancellationToken ct) =>
        carts.HoldSeatAsync(cartToken, request.ScreeningId, request.SeatId, ct);

    [HttpDelete("{cartToken}/holds/{seatId:int}")]
    [ProducesResponseType<CartResponse>(StatusCodes.Status200OK)]
    public Task<CartResponse> Release(string cartToken, int seatId, CancellationToken ct) =>
        carts.ReleaseSeatAsync(cartToken, seatId, ct);

    /// <summary>Releases every seat in the cart.</summary>
    [HttpDelete("{cartToken}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Clear(string cartToken, CancellationToken ct)
    {
        await carts.ClearCartAsync(cartToken, ct);
        return NoContent();
    }
}
