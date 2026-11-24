using ItAssetTracker.Api.Contracts;
using ItAssetTracker.Api.Data;
using ItAssetTracker.Api.Domain;
using ItAssetTracker.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace ItAssetTracker.Api.Controllers;

[ApiController]
[Route("api/reports")]
public sealed class ReportsController(ReportService reports) : ControllerBase
{
    /// <summary>The title, description and exact SQL text of every report.</summary>
    [HttpGet("definitions")]
    public IReadOnlyList<ReportDefinitionDto> Definitions() => ReportService.Definitions;

    [HttpGet("assets-by-status")]
    public Task<List<StatusCountRow>> AssetsByStatus(CancellationToken ct) => reports.AssetsByStatusAsync(ct);

    [HttpGet("assets-by-building")]
    public Task<List<AssetsByBuildingRow>> AssetsByBuilding(CancellationToken ct) => reports.AssetsByBuildingAsync(ct);

    [HttpGet("warranty-expiring")]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public Task<List<WarrantyExpiringRow>> WarrantyExpiring([FromQuery] int days = 90, CancellationToken ct = default)
    {
        if (days is < 1 or > ReportService.MaxWarrantyDays)
        {
            throw new BusinessRuleException("days", $"days must be between 1 and {ReportService.MaxWarrantyDays}.");
        }

        return reports.WarrantyExpiringAsync(days, ct);
    }

    [HttpGet("open-tickets-by-priority")]
    public Task<List<OpenTicketsByPriorityRow>> OpenTicketsByPriority(CancellationToken ct) => reports.OpenTicketsByPriorityAsync(ct);

    [HttpGet("ticket-aging")]
    public Task<List<TicketAgingRow>> TicketAging(CancellationToken ct) => reports.TicketAgingAsync(ct);

    [HttpGet("resolution-time")]
    public Task<List<ResolutionTimeRow>> ResolutionTime(CancellationToken ct) => reports.ResolutionTimeByCategoryAsync(ct);

    [HttpGet("jack-utilization")]
    public Task<List<JackUtilizationRow>> JackUtilization(CancellationToken ct) => reports.JackUtilizationAsync(ct);

    [HttpGet("technician-workload")]
    public Task<List<TechnicianWorkloadRow>> TechnicianWorkload(CancellationToken ct) => reports.TechnicianWorkloadAsync(ct);
}

[ApiController]
[Route("api/dashboard")]
public sealed class DashboardController(ReportService reports) : ControllerBase
{
    /// <summary>Every number on the dashboard, computed from the database on each request.</summary>
    [HttpGet]
    public Task<DashboardDto> Get(CancellationToken ct) => reports.DashboardAsync(ct);
}

[ApiController]
[Route("api/demo")]
public sealed class DemoController(AppDbContext db, TimeProvider clock, IConfiguration configuration) : ControllerBase
{
    private bool ResetEnabled => configuration.GetValue("Demo:EnableResetEndpoint", false);

    [HttpGet]
    public async Task<object> Info(CancellationToken ct) => new
    {
        Organization = DemoDataSeeder.OrganizationName,
        Fictional = true,
        ResetEnabled,
        Counts = await DatabaseInitializer.CountsAsync(db, ct)
    };

    /// <summary>Deletes all data and reloads the fictional demo data. Only available when Demo:EnableResetEndpoint is true.</summary>
    [HttpPost("reset")]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<object> Reset(CancellationToken ct)
    {
        if (!ResetEnabled)
        {
            throw new NotFoundException("Demo reset is disabled on this server.");
        }

        await DatabaseInitializer.ResetDemoDataAsync(db, clock.GetUtcNow().UtcDateTime, ct);
        return new { Reset = true, Counts = await DatabaseInitializer.CountsAsync(db, ct) };
    }
}
