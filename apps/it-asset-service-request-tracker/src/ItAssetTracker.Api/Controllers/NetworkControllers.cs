using ItAssetTracker.Api.Contracts;
using ItAssetTracker.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace ItAssetTracker.Api.Controllers;

[ApiController]
[Route("api/vlans")]
public sealed class VlansController(NetworkService network) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<VlanDto>> List(CancellationToken ct) => network.ListVlansAsync(ct);

    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<VlanDto>> Create(CreateVlanRequest request, CancellationToken ct)
    {
        var created = await network.CreateVlanAsync(request, ct);
        return Created($"/api/vlans/{created.VlanId}", created);
    }

    [HttpDelete("{vlanId:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Delete(int vlanId, CancellationToken ct)
    {
        await network.DeleteVlanAsync(vlanId, ct);
        return NoContent();
    }
}

[ApiController]
[Route("api/switches")]
public sealed class SwitchesController(NetworkService network) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<SwitchSummaryDto>> List(CancellationToken ct) => network.ListSwitchesAsync(ct);

    /// <summary>Switch details including every port and the jack patched to it.</summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public Task<SwitchDetailDto> Get(int id, CancellationToken ct) => network.GetSwitchAsync(id, ct);

    /// <summary>Access ports with no jack, i.e. the ports a jack can be patched to. Uplinks are excluded.</summary>
    [HttpGet("{id:int}/free-ports")]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public Task<IReadOnlyList<SwitchPortDto>> FreePorts(int id, CancellationToken ct) => network.ListFreePortsAsync(id, ct);

    /// <summary>Creates the switch and its ports (1/1/1 to 1/1/N, all disabled access ports).</summary>
    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<SwitchDetailDto>> Create(CreateSwitchRequest request, CancellationToken ct)
    {
        var created = await network.CreateSwitchAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public Task<SwitchDetailDto> Update(int id, UpdateSwitchRequest request, CancellationToken ct) =>
        network.UpdateSwitchAsync(id, request, ct);

    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await network.DeleteSwitchAsync(id, ct);
        return NoContent();
    }
}

[ApiController]
[Route("api/ports")]
public sealed class PortsController(NetworkService network) : ControllerBase
{
    /// <summary>Change a port's VLAN, admin status or description.</summary>
    [HttpPut("{id:int}")]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public Task<SwitchPortDto> Update(int id, UpdatePortRequest request, CancellationToken ct) =>
        network.UpdatePortAsync(id, request, ct);
}

[ApiController]
[Route("api/jacks")]
public sealed class JacksController(NetworkService network) : ControllerBase
{
    [HttpGet]
    public Task<PagedResult<JackDto>> List([FromQuery] JackQuery query, CancellationToken ct) => network.ListJacksAsync(query, ct);

    [HttpGet("{id:int}")]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public Task<JackDto> Get(int id, CancellationToken ct) => network.GetJackAsync(id, ct);

    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<JackDto>> Create(JackWriteRequest request, CancellationToken ct)
    {
        var created = await network.CreateJackAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public Task<JackDto> Update(int id, JackWriteRequest request, CancellationToken ct) => network.UpdateJackAsync(id, request, ct);

    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await network.DeleteJackAsync(id, ct);
        return NoContent();
    }

    [HttpPost("{id:int}/patch")]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public Task<JackDto> Patch(int id, PatchJackRequest request, CancellationToken ct) =>
        network.PatchAsync(id, request.SwitchPortId!.Value, ct);

    [HttpPost("{id:int}/unpatch")]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public Task<JackDto> Unpatch(int id, CancellationToken ct) => network.UnpatchAsync(id, ct);

    /// <summary>Patch the jack, set the port's VLAN, enable the port and mark the jack Active, in one transaction.</summary>
    [HttpPost("{id:int}/activate")]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public Task<JackDto> Activate(int id, ActivateJackRequest request, CancellationToken ct) =>
        network.ActivateAsync(id, request, ct);
}
