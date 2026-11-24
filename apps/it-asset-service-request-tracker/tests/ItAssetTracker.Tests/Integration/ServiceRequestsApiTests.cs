using System.Net;
using ItAssetTracker.Api.Contracts;
using ItAssetTracker.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace ItAssetTracker.Tests.Integration;

public class ServiceRequestsApiTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    private async Task<int> PersonAsync(string email)
    {
        await using var db = factory.CreateDbContext();
        return (await db.People.SingleAsync(p => p.Email == email)).Id;
    }

    private async Task<ServiceRequestDetailDto> CreateAsync(string title = "Activate jack 2-214B for new hire")
    {
        var pat = await PersonAsync("pat.requester@test.example");
        await using var db = factory.CreateDbContext();
        var jack = await db.NetworkJacks.SingleAsync(j => j.Label == "2-214B");
        var response = await _client.PostJsonAsync("/api/service-requests", new
        {
            title,
            description = "New staff member starts Monday in ENG 214.",
            category = "JackActivation",
            priority = "P3",
            requesterId = pat,
            relatedJackId = jack.Id
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadAsync<ServiceRequestDetailDto>();
    }

    private Task<HttpResponseMessage> StatusAsync(ServiceRequestDetailDto r, string status, int actor, string? note = null) =>
        _client.PostJsonAsync($"/api/service-requests/{r.Id}/status", new { status, note, actorId = actor, version = r.Version });

    [Fact]
    public async Task New_request_starts_in_New_with_a_created_event()
    {
        var r = await CreateAsync();
        Assert.Equal(TicketStatus.New, r.Status);
        Assert.Equal($"SR{r.Id:D6}", r.Number);
        Assert.Equal([TicketStatus.Assigned], r.AllowedTransitions);
        var created = Assert.Single(r.History);
        Assert.Equal((TicketEventType.Created, "Pat Requester"), (created.Type, created.ActorName));
        Assert.Equal("2-214B", r.RelatedJack?.Label);
        Assert.Equal(ApiFactory.FixedNow, r.CreatedAt);
    }

    [Fact]
    public async Task Full_lifecycle_records_history_and_timestamps()
    {
        var alex = await PersonAsync("alex.analyst@test.example");
        var r = await CreateAsync();

        var assigned = await (await _client.PostJsonAsync($"/api/service-requests/{r.Id}/assign", new { assigneeId = alex, actorId = alex, version = r.Version }))
            .ReadAsync<ServiceRequestDetailDto>();
        Assert.Equal((TicketStatus.Assigned, "Alex Analyst"), (assigned.Status, assigned.AssigneeName));

        var working = await (await StatusAsync(assigned, "InProgress", alex)).ReadAsync<ServiceRequestDetailDto>();
        var resolved = await (await StatusAsync(working, "Resolved", alex, "Patched 2-214B to 1/1/3 on VLAN 10.")).ReadAsync<ServiceRequestDetailDto>();
        Assert.Equal(TicketStatus.Resolved, resolved.Status);
        Assert.Equal(ApiFactory.FixedNow, resolved.ResolvedAt);
        Assert.Equal("Patched 2-214B to 1/1/3 on VLAN 10.", resolved.ResolutionNotes);
        Assert.Equal([TicketStatus.Closed, TicketStatus.Reopened], resolved.AllowedTransitions);

        var closed = await (await StatusAsync(resolved, "Closed", alex)).ReadAsync<ServiceRequestDetailDto>();
        Assert.Equal(TicketStatus.Closed, closed.Status);
        Assert.NotNull(closed.ClosedAt);
        Assert.Empty(closed.AllowedTransitions);

        var types = closed.History.Select(h => h.Type).ToArray();
        Assert.Equal(
            [TicketEventType.Created, TicketEventType.Assigned, TicketEventType.StatusChanged, TicketEventType.StatusChanged, TicketEventType.StatusChanged, TicketEventType.StatusChanged],
            types);
        Assert.Equal(["New", "Assigned", "InProgress", "Resolved", "Closed"],
            closed.History.Where(h => h.Type != TicketEventType.Assigned).Select(h => h.ToStatus!).ToArray());

        // Closed is final.
        var reopen = await StatusAsync(closed, "Reopened", alex, "It broke again");
        Assert.Equal(HttpStatusCode.Conflict, reopen.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await _client.PutJsonAsync($"/api/service-requests/{r.Id}", new
        {
            title = "Edit after close", description = "Should not be allowed now.", category = "Network", priority = "P1", actorId = alex, version = closed.Version
        })).StatusCode);
    }

    [Fact]
    public async Task Skipping_steps_is_rejected_with_409()
    {
        var alex = await PersonAsync("alex.analyst@test.example");
        var r = await CreateAsync();
        var response = await StatusAsync(r, "Resolved", alex, "Done already");
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var problem = await response.ReadAsync<Problem>();
        Assert.Contains("Cannot change status from New to Resolved", problem.Detail);
    }

    [Fact]
    public async Task Resolving_without_notes_is_400()
    {
        var alex = await PersonAsync("alex.analyst@test.example");
        var r = await CreateAsync();
        var assigned = await (await _client.PostJsonAsync($"/api/service-requests/{r.Id}/assign", new { assigneeId = alex, actorId = alex, version = r.Version }))
            .ReadAsync<ServiceRequestDetailDto>();
        var response = await StatusAsync(assigned, "Resolved", alex, "  ");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True((await response.ReadAsync<Problem>()).Errors!.ContainsKey("note"));
    }

    [Fact]
    public async Task Reopen_from_resolved_clears_resolution_time()
    {
        var alex = await PersonAsync("alex.analyst@test.example");
        var r = await CreateAsync();
        var a = await (await _client.PostJsonAsync($"/api/service-requests/{r.Id}/assign", new { assigneeId = alex, actorId = alex, version = r.Version })).ReadAsync<ServiceRequestDetailDto>();
        var resolved = await (await StatusAsync(a, "Resolved", alex, "Activated the port")).ReadAsync<ServiceRequestDetailDto>();
        var reopened = await (await StatusAsync(resolved, "Reopened", alex, "User still has no link")).ReadAsync<ServiceRequestDetailDto>();
        Assert.Equal(TicketStatus.Reopened, reopened.Status);
        Assert.Null(reopened.ResolvedAt);
        Assert.Contains(TicketStatus.InProgress, reopened.AllowedTransitions);
    }

    [Fact]
    public async Task Only_technicians_can_be_assigned()
    {
        var pat = await PersonAsync("pat.requester@test.example");
        var r = await CreateAsync();
        var response = await _client.PostJsonAsync($"/api/service-requests/{r.Id}/assign", new { assigneeId = pat, actorId = pat, version = r.Version });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True((await response.ReadAsync<Problem>()).Errors!.ContainsKey("assigneeId"));
    }

    [Fact]
    public async Task Reassignment_is_recorded_and_repeating_it_is_a_no_op()
    {
        var alex = await PersonAsync("alex.analyst@test.example");
        var sam = await PersonAsync("sam.support@test.example");
        var r = await CreateAsync();
        var first = await (await _client.PostJsonAsync($"/api/service-requests/{r.Id}/assign", new { assigneeId = alex, actorId = alex, version = r.Version })).ReadAsync<ServiceRequestDetailDto>();
        var second = await (await _client.PostJsonAsync($"/api/service-requests/{r.Id}/assign", new { assigneeId = sam, actorId = alex, version = first.Version })).ReadAsync<ServiceRequestDetailDto>();
        var assignEvent = second.History.Last(h => h.Type == TicketEventType.Assigned);
        Assert.Equal(("Alex Analyst", "Sam Support"), (assignEvent.FromAssignee, assignEvent.ToAssignee));

        var repeat = await (await _client.PostJsonAsync($"/api/service-requests/{r.Id}/assign", new { assigneeId = sam, actorId = alex, version = second.Version })).ReadAsync<ServiceRequestDetailDto>();
        Assert.Equal(second.History.Count, repeat.History.Count);
        Assert.Equal(second.Version, repeat.Version);
    }

    [Fact]
    public async Task Stale_version_on_status_change_returns_409()
    {
        var alex = await PersonAsync("alex.analyst@test.example");
        var r = await CreateAsync();
        Assert.Equal(HttpStatusCode.OK, (await _client.PostJsonAsync($"/api/service-requests/{r.Id}/assign", new { assigneeId = alex, actorId = alex, version = r.Version })).StatusCode);

        // r still holds version 1; the request is now at version 2.
        Assert.Equal(HttpStatusCode.Conflict, (await StatusAsync(r, "InProgress", alex)).StatusCode);
    }

    [Fact]
    public async Task Comments_and_edits_are_added_to_the_timeline()
    {
        var alex = await PersonAsync("alex.analyst@test.example");
        var r = await CreateAsync();
        var commented = await (await _client.PostJsonAsync($"/api/service-requests/{r.Id}/comments", new { text = "Checked the patch panel.", actorId = alex }))
            .ReadAsync<ServiceRequestDetailDto>();
        var comment = commented.History.Last();
        Assert.Equal((TicketEventType.Comment, "Checked the patch panel.", "Alex Analyst"), (comment.Type, comment.Text, comment.ActorName));
        Assert.Equal(r.Version, commented.Version);

        var edited = await (await _client.PutJsonAsync($"/api/service-requests/{r.Id}", new
        {
            title = r.Title,
            description = "New staff member starts Monday in ENG 214.",
            category = "JackActivation",
            priority = "P1",
            relatedJackId = r.RelatedJack!.Id,
            actorId = alex,
            version = commented.Version
        })).ReadAsync<ServiceRequestDetailDto>();
        Assert.Equal(TicketPriority.P1, edited.Priority);
        Assert.Equal("Updated priority P3 -> P1.", edited.History.Last().Text);
    }

    [Fact]
    public async Task Create_validates_fields_and_references()
    {
        var shortTitle = await _client.PostJsonAsync("/api/service-requests", new { title = "Hi", description = "Too short", category = "Other", priority = "P5", requesterId = 1 });
        Assert.Equal(HttpStatusCode.BadRequest, shortTitle.StatusCode);

        var pat = await PersonAsync("pat.requester@test.example");
        var badJack = await _client.PostJsonAsync("/api/service-requests", new
        {
            title = "Jack that does not exist", description = "Referencing a missing jack id.", category = "Network", priority = "P3", requesterId = pat, relatedJackId = 999999
        });
        Assert.Equal(HttpStatusCode.BadRequest, badJack.StatusCode);
        Assert.True((await badJack.ReadAsync<Problem>()).Errors!.ContainsKey("relatedJackId"));
    }

    [Fact]
    public async Task List_filters_and_searches_by_number()
    {
        var open = await (await _client.GetAsync("/api/service-requests?openOnly=true&priority=P2")).ReadAsync<PagedResult<ServiceRequestListItemDto>>();
        Assert.Equal(["T2 slow network", "T3 laptop broken"], open.Items.Select(i => i.Title).ToArray());

        var unassigned = await (await _client.GetAsync("/api/service-requests?unassigned=true&status=New&search=T8")).ReadAsync<PagedResult<ServiceRequestListItemDto>>();
        var t8 = Assert.Single(unassigned.Items);

        var byNumber = await (await _client.GetAsync($"/api/service-requests?search={t8.Number}")).ReadAsync<PagedResult<ServiceRequestListItemDto>>();
        Assert.Equal(t8.Id, Assert.Single(byNumber.Items).Id);

        var byPriority = await (await _client.GetAsync("/api/service-requests?search=T&sort=priority&pageSize=1")).ReadAsync<PagedResult<ServiceRequestListItemDto>>();
        Assert.Equal(TicketPriority.P1, byPriority.Items[0].Priority);
    }

    [Fact]
    public async Task Missing_request_returns_404_problem()
    {
        var response = await _client.GetAsync("/api/service-requests/424242");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Contains("SR424242", (await response.ReadAsync<Problem>()).Detail);
    }
}
