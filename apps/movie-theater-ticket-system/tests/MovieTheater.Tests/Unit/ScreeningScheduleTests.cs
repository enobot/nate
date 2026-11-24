using MovieTheater.Api.Domain;

namespace MovieTheater.Tests.Unit;

public class ScreeningScheduleTests
{
    private const int Buffer = 20;
    private static readonly DateTime SevenPm = new(2026, 3, 3, 19, 0, 0, DateTimeKind.Utc);

    // A 120-minute movie at 7:00 PM keeps the auditorium busy until 9:20 PM with the cleaning buffer.
    private static readonly ScheduledSlot Existing = new(1, SevenPm, 120, "Existing Movie");

    [Fact]
    public void Busy_until_includes_runtime_and_cleaning_buffer()
    {
        Assert.Equal(SevenPm.AddMinutes(140), ScreeningSchedule.BusyUntil(SevenPm, 120, Buffer));
    }

    [Fact]
    public void Intervals_that_only_touch_do_not_overlap()
    {
        var end = SevenPm.AddHours(2);
        Assert.False(ScreeningSchedule.Overlaps(SevenPm, end, end, end.AddHours(1)));
    }

    [Fact]
    public void Starting_during_another_screening_conflicts()
    {
        var conflict = ScreeningSchedule.FindConflict(SevenPm.AddMinutes(90), 100, [Existing], Buffer);
        Assert.Equal(Existing, conflict);
    }

    [Fact]
    public void Starting_during_the_cleaning_break_conflicts()
    {
        var conflict = ScreeningSchedule.FindConflict(SevenPm.AddMinutes(130), 100, [Existing], Buffer);
        Assert.Equal(Existing, conflict);
    }

    [Fact]
    public void Starting_exactly_when_the_auditorium_is_clear_is_allowed()
    {
        Assert.Null(ScreeningSchedule.FindConflict(SevenPm.AddMinutes(140), 100, [Existing], Buffer));
    }

    [Fact]
    public void Running_into_the_next_screening_conflicts()
    {
        // 5:00 PM + 110 min + 20 min buffer = 7:10 PM, which runs into the 7:00 PM show.
        var conflict = ScreeningSchedule.FindConflict(SevenPm.AddHours(-2), 110, [Existing], Buffer);
        Assert.Equal(Existing, conflict);
    }

    [Fact]
    public void Ending_with_the_buffer_right_at_the_next_start_is_allowed()
    {
        // 5:00 PM + 100 min + 20 min buffer = 7:00 PM exactly.
        Assert.Null(ScreeningSchedule.FindConflict(SevenPm.AddHours(-2), 100, [Existing], Buffer));
    }

    [Fact]
    public void A_screening_does_not_conflict_with_itself_when_edited()
    {
        Assert.Null(ScreeningSchedule.FindConflict(SevenPm.AddMinutes(10), 120, [Existing], Buffer, ignoreScreeningId: 1));
    }

    [Fact]
    public void Earliest_conflict_is_reported_first()
    {
        var later = new ScheduledSlot(2, SevenPm.AddHours(3), 90, "Later Movie");
        var conflict = ScreeningSchedule.FindConflict(SevenPm.AddMinutes(30), 300, [later, Existing], Buffer);
        Assert.Equal(Existing, conflict);
    }

    [Fact]
    public void Empty_auditorium_has_no_conflicts()
    {
        Assert.Null(ScreeningSchedule.FindConflict(SevenPm, 120, [], Buffer));
    }
}
