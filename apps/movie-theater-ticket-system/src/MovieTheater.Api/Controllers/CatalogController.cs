using Microsoft.AspNetCore.Mvc;
using MovieTheater.Api.Contracts;
using MovieTheater.Api.Services;

namespace MovieTheater.Api.Controllers;

[ApiController]
[Route("api")]
public sealed class CatalogController(CatalogService catalog) : ControllerBase
{
    /// <summary>Movies and their showtimes for one theater-local date (default: today).</summary>
    [HttpGet("showtimes")]
    [ProducesResponseType<ShowtimesResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public Task<ShowtimesResponse> GetShowtimes([FromQuery] DateOnly? date, CancellationToken ct) =>
        catalog.GetShowtimesAsync(date, ct);

    [HttpGet("movies/{id:int}")]
    [ProducesResponseType<MovieDetailResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<MovieDetailResponse> GetMovie(int id, CancellationToken ct) => catalog.GetMovieAsync(id, ct);

    /// <summary>Screening details with the full seat map and each seat's current status.</summary>
    [HttpGet("screenings/{id:int}")]
    [ProducesResponseType<ScreeningDetailResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<ScreeningDetailResponse> GetScreening(int id, CancellationToken ct) => catalog.GetScreeningAsync(id, ct);

    /// <summary>Current ticket prices, rules, and the concession menu.</summary>
    [HttpGet("pricing")]
    [ProducesResponseType<PricingInfoResponse>(StatusCodes.Status200OK)]
    public Task<PricingInfoResponse> GetPricing(CancellationToken ct) => catalog.GetPricingAsync(ct);
}
