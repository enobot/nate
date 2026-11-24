using ItAssetTracker.Api.Contracts;
using ItAssetTracker.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace ItAssetTracker.Api.Controllers;

[ApiController]
[Route("api/assets")]
public sealed class AssetsController(AssetService assets) : ControllerBase
{
    /// <summary>Search, filter, sort and page the equipment inventory.</summary>
    [HttpGet]
    public Task<PagedResult<AssetListItemDto>> List([FromQuery] AssetQuery query, CancellationToken ct) =>
        assets.ListAsync(query, ct);

    [HttpGet("{id:int}")]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public Task<AssetDetailDto> Get(int id, CancellationToken ct) => assets.GetAsync(id, ct);

    /// <summary>Status, location and assignee changes, newest first.</summary>
    [HttpGet("{id:int}/history")]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public Task<IReadOnlyList<AssetHistoryDto>> History(int id, CancellationToken ct) => assets.GetHistoryAsync(id, ct);

    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AssetDetailDto>> Create(CreateAssetRequest request, CancellationToken ct)
    {
        var created = await assets.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public Task<AssetDetailDto> Update(int id, UpdateAssetRequest request, CancellationToken ct) =>
        assets.UpdateAsync(id, request, ct);

    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await assets.DeleteAsync(id, ct);
        return NoContent();
    }
}
