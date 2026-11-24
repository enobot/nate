namespace MovieTheater.Api.Domain;

/// <summary>An existing booking of an auditorium: start time plus the runtime of its movie.</summary>
public sealed record ScheduledSlot(int ScreeningId, DateTime StartsAtUtc, int RuntimeMinutes, string MovieTitle);

/// <summary>
/// Rules for placing screenings in an auditorium. Pure functions so they can be unit tested
/// without a database.
/// </summary>
public static class ScreeningSchedule
{
    /// <summary>
    /// The auditorium is busy from the start time until the movie ends plus the cleaning buffer.
    /// </summary>
    public static DateTime BusyUntil(DateTime startsAtUtc, int runtimeMinutes, int cleaningBufferMinutes) =>
        startsAtUtc.AddMinutes(runtimeMinutes + cleaningBufferMinutes);

    /// <summary>Half-open intervals [start, end): a screening may begin exactly when the previous one is clear.</summary>
    public static bool Overlaps(DateTime startA, DateTime endA, DateTime startB, DateTime endB) =>
        startA < endB && startB < endA;

    /// <summary>Returns the first existing slot that conflicts with the proposed one, or null.</summary>
    public static ScheduledSlot? FindConflict(
        DateTime proposedStartUtc,
        int proposedRuntimeMinutes,
        IEnumerable<ScheduledSlot> existing,
        int cleaningBufferMinutes,
        int? ignoreScreeningId = null)
    {
        var proposedEnd = BusyUntil(proposedStartUtc, proposedRuntimeMinutes, cleaningBufferMinutes);

        return existing
            .Where(s => s.ScreeningId != ignoreScreeningId)
            .OrderBy(s => s.StartsAtUtc)
            .FirstOrDefault(s => Overlaps(
                proposedStartUtc,
                proposedEnd,
                s.StartsAtUtc,
                BusyUntil(s.StartsAtUtc, s.RuntimeMinutes, cleaningBufferMinutes)));
    }
}
