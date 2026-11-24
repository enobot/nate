using Microsoft.AspNetCore.SignalR;
using MovieTheater.Api.Domain;

namespace MovieTheater.Api.Hubs;

public sealed record SeatChange(int SeatId, SeatStatus Status);

public sealed record SeatsChangedMessage(int ScreeningId, IReadOnlyList<SeatChange> Changes);

/// <summary>
/// Real-time seat availability. Browsers viewing a seat map join a group for that screening
/// and receive "SeatsChanged" messages whenever seats are held, released, sold, or freed.
/// The hub only pushes notifications; every change still goes through the REST API and the database.
/// </summary>
public sealed class SeatHub : Hub
{
    public const string Path = "/hubs/seats";
    public const string SeatsChangedMethod = "SeatsChanged";

    public static string GroupName(int screeningId) => $"screening-{screeningId}";

    public Task JoinScreening(int screeningId) =>
        Groups.AddToGroupAsync(Context.ConnectionId, GroupName(screeningId));

    public Task LeaveScreening(int screeningId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(screeningId));
}

public interface ISeatNotifier
{
    Task SeatsChangedAsync(int screeningId, IReadOnlyList<SeatChange> changes, CancellationToken cancellationToken = default);
}

public sealed class SignalRSeatNotifier(IHubContext<SeatHub> hub, ILogger<SignalRSeatNotifier> logger) : ISeatNotifier
{
    public async Task SeatsChangedAsync(int screeningId, IReadOnlyList<SeatChange> changes, CancellationToken cancellationToken = default)
    {
        if (changes.Count == 0)
        {
            return;
        }

        try
        {
            await hub.Clients
                .Group(SeatHub.GroupName(screeningId))
                .SendAsync(SeatHub.SeatsChangedMethod, new SeatsChangedMessage(screeningId, changes), cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // The database change already committed. A missed push is recovered when the
            // browser refetches the seat map (on reconnect or by its fallback refresh).
            logger.LogWarning(ex, "Could not broadcast seat changes for screening {ScreeningId}", screeningId);
        }
    }
}
