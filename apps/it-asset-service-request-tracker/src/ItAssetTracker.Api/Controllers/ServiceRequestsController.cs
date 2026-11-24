using ItAssetTracker.Api.Contracts;
using ItAssetTracker.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace ItAssetTracker.Api.Controllers;

/// <summary>
/// Service requests (tickets). There is intentionally no DELETE: tickets are kept as an audit trail
/// and are closed instead.
/// </summary>
[ApiController]
[Route("api/service-requests")]
public sealed class ServiceRequestsController(ServiceRequestService requests) : ControllerBase
{
    [HttpGet]
    public Task<PagedResult<ServiceRequestListItemDto>> List([FromQuery] ServiceRequestQuery query, CancellationToken ct) =>
        requests.ListAsync(query, ct);

    /// <summary>Full request with history timeline and the statuses it can move to next.</summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public Task<ServiceRequestDetailDto> Get(int id, CancellationToken ct) => requests.GetAsync(id, ct);

    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ServiceRequestDetailDto>> Create(CreateServiceRequestRequest request, CancellationToken ct)
    {
        var created = await requests.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public Task<ServiceRequestDetailDto> Update(int id, UpdateServiceRequestRequest request, CancellationToken ct) =>
        requests.UpdateAsync(id, request, ct);

    [HttpPost("{id:int}/assign")]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public Task<ServiceRequestDetailDto> Assign(int id, AssignServiceRequestRequest request, CancellationToken ct) =>
        requests.AssignAsync(id, request, ct);

    [HttpPost("{id:int}/status")]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public Task<ServiceRequestDetailDto> ChangeStatus(int id, ChangeStatusRequest request, CancellationToken ct) =>
        requests.ChangeStatusAsync(id, request, ct);

    [HttpPost("{id:int}/comments")]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public Task<ServiceRequestDetailDto> AddComment(int id, AddCommentRequest request, CancellationToken ct) =>
        requests.AddCommentAsync(id, request, ct);
}
