using Microsoft.Extensions.Options;
using MovieTheater.Api.Options;

namespace MovieTheater.Api.Services;

/// <summary>
/// Releases expired seat holds on a timer so that seat maps update even when nobody touches
/// those seats. Expired holds are also ignored by every query, so correctness does not depend
/// on this job running on time; it only keeps the table small and pushes "available" updates.
/// </summary>
public sealed class ExpiredHoldCleanupService(
    IServiceScopeFactory scopes,
    IOptions<BookingOptions> booking,
    TimeProvider time,
    ILogger<ExpiredHoldCleanupService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var seconds = booking.Value.HoldCleanupIntervalSeconds;
        if (seconds <= 0)
        {
            logger.LogInformation("Expired hold cleanup is turned off.");
            return;
        }

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(seconds), time);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var carts = scope.ServiceProvider.GetRequiredService<CartService>();
                var released = await carts.ReleaseExpiredHoldsAsync(stoppingToken);
                if (released > 0)
                {
                    logger.LogInformation("Released {Count} expired seat holds.", released);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                // Keep the loop alive; the next tick will try again.
                logger.LogError(ex, "Expired hold cleanup failed.");
            }
        }
    }
}
