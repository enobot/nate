using Microsoft.Extensions.Options;
using MovieTheater.Api.Options;

namespace MovieTheater.Api.Services;

/// <summary>
/// One place for "what time is it" and theater-local time conversions. Built on
/// <see cref="TimeProvider"/> so tests can control the clock.
/// </summary>
public sealed class TheaterClock
{
    private readonly TimeProvider time;

    public TheaterClock(TimeProvider time, IOptions<TheaterOptions> options)
    {
        this.time = time;
        TimeZone = ResolveTimeZone(options.Value.TimeZone);
    }

    public TimeZoneInfo TimeZone { get; }

    public DateTime UtcNow => time.GetUtcNow().UtcDateTime;

    public DateTime LocalNow => ToLocal(UtcNow);

    public DateOnly Today => DateOnly.FromDateTime(LocalNow);

    /// <summary>
    /// Theater-local wall-clock time. The result is always <see cref="DateTimeKind.Unspecified"/>
    /// so JSON output has no offset (e.g. "2026-12-01T19:30:00").
    /// </summary>
    public DateTime ToLocal(DateTime utc) =>
        DateTime.SpecifyKind(
            TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), TimeZone),
            DateTimeKind.Unspecified);

    /// <summary>Converts a theater-local wall-clock time to UTC.</summary>
    public DateTime ToUtc(DateTime local)
    {
        var unspecified = DateTime.SpecifyKind(local, DateTimeKind.Unspecified);
        if (TimeZone.IsInvalidTime(unspecified))
        {
            throw new Errors.BadRequestException(
                "invalid-local-time",
                "That time does not exist in the theater's time zone (daylight saving change). Pick another time.");
        }

        return TimeZoneInfo.ConvertTimeToUtc(unspecified, TimeZone);
    }

    /// <summary>UTC range [start, end) covering one theater-local calendar day.</summary>
    public (DateTime StartUtc, DateTime EndUtc) DayRangeUtc(DateOnly localDate) =>
        (ToUtc(localDate.ToDateTime(TimeOnly.MinValue)), ToUtc(localDate.AddDays(1).ToDateTime(TimeOnly.MinValue)));

    private static TimeZoneInfo ResolveTimeZone(string? id)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return TimeZoneInfo.Local;
        }

        if (string.Equals(id, "UTC", StringComparison.OrdinalIgnoreCase))
        {
            return TimeZoneInfo.Utc;
        }

        return TimeZoneInfo.FindSystemTimeZoneById(id);
    }
}
