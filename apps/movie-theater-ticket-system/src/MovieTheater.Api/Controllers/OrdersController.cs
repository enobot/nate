using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MovieTheater.Api.Contracts;
using MovieTheater.Api.Domain;
using MovieTheater.Api.Infrastructure;
using MovieTheater.Api.Services;

namespace MovieTheater.Api.Controllers;

[ApiController]
[Route("api/orders")]
public sealed class OrdersController(OrderService orders) : ControllerBase
{
    /// <summary>Prices a selection of seats, ticket types, and concessions. Prices come only from the server.</summary>
    [HttpPost("quote")]
    [ProducesResponseType<OrderQuote>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<OrderQuote> Quote(QuoteRequest request, CancellationToken ct) => orders.QuoteAsync(request, ct);

    /// <summary>
    /// Simulated checkout. No real payment is processed and no card details are accepted.
    /// Returns 201 for a new order, or 200 with the existing order if this cart was already checked out.
    /// </summary>
    [HttpPost]
    [ProducesResponseType<OrderDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status402PaymentRequired)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<OrderDto>> Checkout(CheckoutRequest request, CancellationToken ct)
    {
        var (order, created) = await orders.CheckoutAsync(request, ct);
        return created ? StatusCode(StatusCodes.Status201Created, order) : Ok(order);
    }

    /// <summary>
    /// Order history: send any one order number with its email to see every order for that email.
    /// POST keeps the email out of URLs and server logs.
    /// </summary>
    [HttpPost("history")]
    [EnableRateLimiting(RateLimitPolicies.OrderLookup)]
    [ProducesResponseType<OrderHistoryResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    public async Task<OrderHistoryResponse> History(OrderLookupRequest request, CancellationToken ct) =>
        new(await orders.GetHistoryAsync(request.OrderNumber, request.Email, ct));

    /// <summary>Cancels a paid order (simulated refund). Closes a set number of minutes before showtime.</summary>
    [HttpPost("{orderNumber}/cancel")]
    [EnableRateLimiting(RateLimitPolicies.OrderLookup)]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<OrderDto> Cancel(string orderNumber, CancelOrderRequest request, CancellationToken ct) =>
        orders.CancelByCustomerAsync(orderNumber, request.Email, ct);
}
