using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MovieTheater.Api.Contracts;
using MovieTheater.Api.Domain;
using MovieTheater.Api.Infrastructure;
using MovieTheater.Api.Services;

namespace MovieTheater.Api.Controllers;

[ApiController]
[Route("api/admin/movies")]
[Authorize(Policy = AuthPolicies.Admin)]
public sealed class AdminMoviesController(AdminCatalogService admin) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<AdminMovieDto>> List(CancellationToken ct) => admin.GetMoviesAsync(ct);

    [HttpPost]
    [ProducesResponseType<AdminMovieDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AdminMovieDto>> Create(MovieUpsertRequest request, CancellationToken ct)
    {
        var movie = await admin.CreateMovieAsync(request, ct);
        return StatusCode(StatusCodes.Status201Created, movie);
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType<AdminMovieDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<AdminMovieDto> Update(int id, MovieUpsertRequest request, CancellationToken ct) =>
        admin.UpdateMovieAsync(id, request, ct);

    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await admin.DeleteMovieAsync(id, ct);
        return NoContent();
    }
}

[ApiController]
[Route("api/admin")]
[Authorize(Policy = AuthPolicies.Admin)]
public sealed class AdminScreeningsController(AdminCatalogService admin) : ControllerBase
{
    [HttpGet("auditoriums")]
    public Task<IReadOnlyList<AuditoriumDto>> Auditoriums(CancellationToken ct) => admin.GetAuditoriumsAsync(ct);

    /// <summary>Screenings between two theater-local dates (default: the next 7 days).</summary>
    [HttpGet("screenings")]
    [ProducesResponseType<IReadOnlyList<AdminScreeningDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public Task<IReadOnlyList<AdminScreeningDto>> List(
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] int? movieId,
        CancellationToken ct) =>
        admin.GetScreeningsAsync(from, to, movieId, ct);

    [HttpPost("screenings")]
    [ProducesResponseType<AdminScreeningDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AdminScreeningDto>> Create(ScreeningUpsertRequest request, CancellationToken ct)
    {
        var screening = await admin.CreateScreeningAsync(request, ct);
        return StatusCode(StatusCodes.Status201Created, screening);
    }

    [HttpPut("screenings/{id:int}")]
    [ProducesResponseType<AdminScreeningDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<AdminScreeningDto> Update(int id, ScreeningUpsertRequest request, CancellationToken ct) =>
        admin.UpdateScreeningAsync(id, request, ct);

    [HttpDelete("screenings/{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await admin.DeleteScreeningAsync(id, ct);
        return NoContent();
    }
}

[ApiController]
[Route("api/admin")]
[Authorize(Policy = AuthPolicies.Admin)]
public sealed class AdminOrdersController(AdminOrderService adminOrders, OrderService orders) : ControllerBase
{
    [HttpGet("orders")]
    public Task<PagedResponse<AdminOrderSummaryDto>> Search(
        [FromQuery] OrderStatus? status,
        [FromQuery] int? screeningId,
        [FromQuery] string? search,
        CancellationToken ct,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25) =>
        adminOrders.SearchOrdersAsync(status, screeningId, search, page, pageSize, ct);

    [HttpGet("orders/{orderNumber}")]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<OrderDto> Get(string orderNumber, CancellationToken ct) => orders.GetOrderDtoAsync(orderNumber, ct);

    /// <summary>Admin cancellation. Not limited by the customer cutoff; the refund is simulated.</summary>
    [HttpPost("orders/{orderNumber}/cancel")]
    [ProducesResponseType<OrderDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<OrderDto> Cancel(string orderNumber, AdminCancelRequest request, CancellationToken ct) =>
        orders.CancelByAdminAsync(orderNumber, request.Reason, ct);

    /// <summary>Sales for orders placed between two theater-local dates (default: the last 30 days).</summary>
    [HttpGet("reports/sales")]
    [ProducesResponseType<SalesReportDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public Task<SalesReportDto> Sales([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct) =>
        adminOrders.GetSalesReportAsync(from, to, ct);
}
