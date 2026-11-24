using ItAssetTracker.Api.Domain;
using ItAssetTracker.Api.Domain.Rules;

namespace ItAssetTracker.Tests.Unit;

public class TicketWorkflowTests
{
    // Every allowed edge in the lifecycle. Any pair not listed here must be rejected.
    private static readonly (TicketStatus From, TicketStatus To)[] AllowedEdges =
    [
        (TicketStatus.New, TicketStatus.Assigned),
        (TicketStatus.Assigned, TicketStatus.InProgress),
        (TicketStatus.Assigned, TicketStatus.Resolved),
        (TicketStatus.InProgress, TicketStatus.Resolved),
        (TicketStatus.Resolved, TicketStatus.Closed),
        (TicketStatus.Resolved, TicketStatus.Reopened),
        (TicketStatus.Reopened, TicketStatus.Assigned),
        (TicketStatus.Reopened, TicketStatus.InProgress),
        (TicketStatus.Reopened, TicketStatus.Resolved)
    ];

    public static TheoryData<TicketStatus, TicketStatus> AllPairs()
    {
        var data = new TheoryData<TicketStatus, TicketStatus>();
        foreach (var from in Enum.GetValues<TicketStatus>())
        {
            foreach (var to in Enum.GetValues<TicketStatus>())
            {
                data.Add(from, to);
            }
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(AllPairs))]
    public void CanTransition_matches_the_documented_lifecycle(TicketStatus from, TicketStatus to)
    {
        var expected = AllowedEdges.Contains((from, to));
        Assert.Equal(expected, TicketWorkflow.CanTransition(from, to));
    }

    [Fact]
    public void Closed_is_final()
    {
        Assert.Empty(TicketWorkflow.AllowedNext(TicketStatus.Closed));
        var ex = Assert.Throws<ConflictException>(() =>
            TicketWorkflow.EnsureTransition(TicketStatus.Closed, TicketStatus.Reopened, hasAssignee: true, note: "Still broken"));
        Assert.Contains("Closed is final", ex.Message);
    }

    [Fact]
    public void New_cannot_jump_straight_to_Resolved()
    {
        Assert.Throws<ConflictException>(() =>
            TicketWorkflow.EnsureTransition(TicketStatus.New, TicketStatus.Resolved, hasAssignee: true, note: "Fixed it"));
    }

    [Fact]
    public void Same_status_is_rejected()
    {
        Assert.Throws<ConflictException>(() =>
            TicketWorkflow.EnsureTransition(TicketStatus.Assigned, TicketStatus.Assigned, hasAssignee: true, note: null));
    }

    [Theory]
    [InlineData(TicketStatus.Reopened, TicketStatus.Assigned)]
    [InlineData(TicketStatus.Reopened, TicketStatus.InProgress)]
    [InlineData(TicketStatus.Assigned, TicketStatus.Resolved)]
    public void Working_statuses_require_an_assignee(TicketStatus from, TicketStatus to)
    {
        var ex = Assert.Throws<BusinessRuleException>(() =>
            TicketWorkflow.EnsureTransition(from, to, hasAssignee: false, note: "Long enough note"));
        Assert.True(ex.Errors.ContainsKey("status"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("done")]
    public void Resolving_requires_resolution_notes(string? note)
    {
        var ex = Assert.Throws<BusinessRuleException>(() =>
            TicketWorkflow.EnsureTransition(TicketStatus.InProgress, TicketStatus.Resolved, hasAssignee: true, note));
        Assert.True(ex.Errors.ContainsKey("note"));
    }

    [Fact]
    public void Resolving_with_notes_and_assignee_is_allowed()
    {
        TicketWorkflow.EnsureTransition(TicketStatus.InProgress, TicketStatus.Resolved, hasAssignee: true, note: "Replaced patch cable");
    }

    [Fact]
    public void Reopening_requires_a_reason()
    {
        Assert.Throws<BusinessRuleException>(() =>
            TicketWorkflow.EnsureTransition(TicketStatus.Resolved, TicketStatus.Reopened, hasAssignee: true, note: ""));
        TicketWorkflow.EnsureTransition(TicketStatus.Resolved, TicketStatus.Reopened, hasAssignee: true, note: "Problem is back");
    }

    [Theory]
    [InlineData(TicketStatus.Resolved)]
    [InlineData(TicketStatus.Closed)]
    public void Finished_requests_cannot_be_reassigned(TicketStatus status)
    {
        Assert.Throws<ConflictException>(() => TicketWorkflow.EnsureCanAssign(status));
    }

    [Theory]
    [InlineData(TicketStatus.New, true)]
    [InlineData(TicketStatus.Assigned, true)]
    [InlineData(TicketStatus.InProgress, true)]
    [InlineData(TicketStatus.Reopened, true)]
    [InlineData(TicketStatus.Resolved, false)]
    [InlineData(TicketStatus.Closed, false)]
    public void IsOpen_treats_resolved_and_closed_as_done(TicketStatus status, bool expected)
    {
        Assert.Equal(expected, TicketWorkflow.IsOpen(status));
    }
}
