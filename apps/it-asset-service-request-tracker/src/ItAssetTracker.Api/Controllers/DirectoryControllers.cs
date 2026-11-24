using ItAssetTracker.Api.Contracts;
using ItAssetTracker.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace ItAssetTracker.Api.Controllers;

[ApiController]
[Route("api/locations")]
public sealed class LocationsController(DirectoryService directory) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<LocationDto>> List(CancellationToken ct) => directory.ListLocationsAsync(ct);

    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<LocationDto>> Create(LocationWriteRequest request, CancellationToken ct)
    {
        var created = await directory.CreateLocationAsync(request, ct);
        return Created($"/api/locations/{created.Id}", created);
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public Task<LocationDto> Update(int id, LocationWriteRequest request, CancellationToken ct) =>
        directory.UpdateLocationAsync(id, request, ct);

    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await directory.DeleteLocationAsync(id, ct);
        return NoContent();
    }
}

[ApiController]
[Route("api/people")]
public sealed class PeopleController(DirectoryService directory) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<PersonDto>> List([FromQuery] bool technicianOnly = false, [FromQuery] string? search = null, CancellationToken ct = default)
    {
        if (search is { Length: > 100 })
        {
            search = search[..100];
        }

        return directory.ListPeopleAsync(technicianOnly, search, ct);
    }

    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PersonDto>> Create(PersonWriteRequest request, CancellationToken ct)
    {
        var created = await directory.CreatePersonAsync(request, ct);
        return Created($"/api/people/{created.Id}", created);
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public Task<PersonDto> Update(int id, PersonWriteRequest request, CancellationToken ct) =>
        directory.UpdatePersonAsync(id, request, ct);

    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await directory.DeletePersonAsync(id, ct);
        return NoContent();
    }
}
