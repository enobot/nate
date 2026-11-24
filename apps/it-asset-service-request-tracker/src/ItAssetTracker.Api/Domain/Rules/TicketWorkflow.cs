namespace ItAssetTracker.Api.Domain.Rules;

/// <summary>
/// Service request lifecycle. This class is the single source of truth for which status
/// changes are allowed; the API also returns <see cref="AllowedNext"/> so the UI only shows valid buttons.
/// </summary>
public static class TicketWorkflow
{
    private static readonly Dictionary<TicketStatus, TicketStatus[]> Transitions = new()
    {
        [TicketStatus.New] = [TicketStatus.Assigned],
        [TicketStatus.Assigned] = [TicketStatus.InProgress, TicketStatus.Resolved],
        [TicketStatus.InProgress] = [TicketStatus.Resolved],
        [TicketStatus.Resolved] = [TicketStatus.Closed, TicketStatus.Reopened],
        [TicketStatus.Reopened] = [TicketStatus.Assigned, TicketStatus.InProgress, TicketStatus.Resolved],
        [TicketStatus.Closed] = []
    };

    public const int MinNoteLength = 5;

    public static IReadOnlyList<TicketStatus> AllowedNext(TicketStatus current) => Transitions[current];

    public static bool CanTransition(TicketStatus from, TicketStatus to) => Transitions[from].Contains(to);

    public static bool IsOpen(TicketStatus status) => status is not (TicketStatus.Resolved or TicketStatus.Closed);

    /// <summary>
    /// Throws if the change from <paramref name="from"/> to <paramref name="to"/> is not allowed.
    /// </summary>
    /// <param name="hasAssignee">Whether the ticket currently has an assigned technician.</param>
    /// <param name="note">Resolution notes (for Resolved) or the reason (for Reopened).</param>
    public static void EnsureTransition(TicketStatus from, TicketStatus to, bool hasAssignee, string? note)
    {
        if (from == to)
        {
            throw new ConflictException($"The request is already {to}.");
        }

        if (!CanTransition(from, to))
        {
            var allowed = Transitions[from];
            var options = allowed.Length == 0 ? "none (Closed is final)" : string.Join(", ", allowed);
            throw new ConflictException($"Cannot change status from {from} to {to}. Allowed next statuses: {options}.");
        }

        if (to is TicketStatus.Assigned or TicketStatus.InProgress or TicketStatus.Resolved && !hasAssignee)
        {
            throw new BusinessRuleException("status", $"Assign a technician before moving the request to {to}.");
        }

        var trimmed = note?.Trim() ?? "";
        if (to == TicketStatus.Resolved && trimmed.Length < MinNoteLength)
        {
            throw new BusinessRuleException("note", $"Resolution notes are required (at least {MinNoteLength} characters).");
        }

        if (to == TicketStatus.Reopened && trimmed.Length < MinNoteLength)
        {
            throw new BusinessRuleException("note", $"Give a reason for reopening (at least {MinNoteLength} characters).");
        }
    }

    /// <summary>Assignment is allowed while the request is still being worked.</summary>
    public static void EnsureCanAssign(TicketStatus current)
    {
        if (current is TicketStatus.Resolved or TicketStatus.Closed)
        {
            throw new ConflictException($"A {current} request cannot be reassigned. Reopen it first.");
        }
    }
}
