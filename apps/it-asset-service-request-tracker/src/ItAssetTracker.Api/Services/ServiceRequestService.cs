using System.Text.RegularExpressions;
using ItAssetTracker.Api.Contracts;
using ItAssetTracker.Api.Data;
using ItAssetTracker.Api.Domain;
using ItAssetTracker.Api.Domain.Rules;
using ItAssetTracker.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace ItAssetTracker.Api.Services;

public sealed partial class ServiceRequestService(AppDbContext db, TimeProvider clock)
{
    private DateTime UtcNow => clock.GetUtcNow().UtcDateTime;

    [GeneratedRegex(@"^(?:SR)?0*(\d{1,9})$", RegexOptions.IgnoreCase)]
    private static partial Regex NumberPattern();

    public async Task<PagedResult<ServiceRequestListItemDto>> ListAsync(ServiceRequestQuery q, CancellationToken ct)
    {
        var (page, pageSize) = Paging.Normalize(q.Page, q.PageSize);
        IQueryable<ServiceRequest> query = db.ServiceRequests.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var term = q.Search.Trim();
            var pattern = QueryHelpers.ContainsPattern(term);
            var esc = QueryHelpers.LikeEscape.ToString();
            var numberMatch = NumberPattern().Match(term);
            var idFromNumber = numberMatch.Success && int.TryParse(numberMatch.Groups[1].Value, out var n) ? n : -1;

            query = query.Where(r => r.Id == idFromNumber
                || EF.Functions.Like(r.Title, pattern, esc)
                || EF.Functions.Like(r.Description, pattern, esc)
                || EF.Functions.Like(r.Requester!.FirstName + " " + r.Requester.LastName, pattern, esc)
                || (r.RelatedJack != null && EF.Functions.Like(r.RelatedJack.Label, pattern, esc))
                || (r.RelatedAsset != null && EF.Functions.Like(r.RelatedAsset.AssetTag, pattern, esc)));
        }

        if (q.Status is { } status)
        {
            query = query.Where(r => r.Status == status);
        }

        if (q.Priority is { } priority)
        {
            query = query.Where(r => r.Priority == priority);
        }

        if (q.Category is { } category)
        {
            query = query.Where(r => r.Category == category);
        }

        if (q.AssigneeId is { } assigneeId)
        {
            query = query.Where(r => r.AssigneeId == assigneeId);
        }

        if (q.Unassigned == true)
        {
            query = query.Where(r => r.AssigneeId == null);
        }

        if (q.OpenOnly == true)
        {
            query = query.Where(r => r.Status != TicketStatus.Resolved && r.Status != TicketStatus.Closed);
        }

        if (q.RelatedAssetId is { } assetId)
        {
            query = query.Where(r => r.RelatedAssetId == assetId);
        }

        if (q.RelatedJackId is { } jackId)
        {
            query = query.Where(r => r.RelatedJackId == jackId);
        }

        var (field, desc) = QueryHelpers.ParseSort(q.Sort, "createdAt", defaultDescending: true);
        query = field.ToLowerInvariant() switch
        {
            "createdat" => desc ? query.OrderByDescending(r => r.CreatedAt).ThenByDescending(r => r.Id) : query.OrderBy(r => r.CreatedAt).ThenBy(r => r.Id),
            "updatedat" => desc ? query.OrderByDescending(r => r.UpdatedAt).ThenByDescending(r => r.Id) : query.OrderBy(r => r.UpdatedAt).ThenBy(r => r.Id),
            // Priority is stored as text P1-P4, so alphabetical order is also urgency order.
            "priority" => desc ? query.OrderByDescending(r => r.Priority).ThenBy(r => r.CreatedAt) : query.OrderBy(r => r.Priority).ThenBy(r => r.CreatedAt),
            "status" => desc ? query.OrderByDescending(r => r.Status).ThenByDescending(r => r.CreatedAt) : query.OrderBy(r => r.Status).ThenByDescending(r => r.CreatedAt),
            _ => throw new BusinessRuleException("sort", $"Unknown sort field '{field}'.")
        };

        var total = await query.CountAsync(ct);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(r => new ServiceRequestListItemDto(
                r.Id,
                "",
                r.Title,
                r.Category,
                r.Priority,
                r.Status,
                r.RequesterId,
                r.Requester!.FirstName + " " + r.Requester.LastName,
                r.AssigneeId,
                r.Assignee != null ? r.Assignee.FirstName + " " + r.Assignee.LastName : null,
                r.CreatedAt,
                r.UpdatedAt,
                r.ResolvedAt))
            .ToListAsync(ct);

        // The display number is derived from the id in C# (it is not a database column).
        var numbered = items.Select(i => i with { Number = ServiceRequest.FormatNumber(i.Id) }).ToList();
        return new PagedResult<ServiceRequestListItemDto>(numbered, total, page, pageSize);
    }

    public async Task<ServiceRequestDetailDto> GetAsync(int id, CancellationToken ct)
    {
        var r = await db.ServiceRequests.AsNoTracking()
            .Include(x => x.Requester)
            .Include(x => x.Assignee)
            .Include(x => x.RelatedAsset)
            .Include(x => x.RelatedJack).ThenInclude(j => j!.Location)
            .Include(x => x.Events)
            .AsSplitQuery()
            .FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new NotFoundException($"Service request {ServiceRequest.FormatNumber(id)} was not found.");

        return ToDetail(r);
    }

    public async Task<ServiceRequestDetailDto> CreateAsync(CreateServiceRequestRequest req, CancellationToken ct)
    {
        var requester = await db.People.FirstOrDefaultAsync(p => p.Id == req.RequesterId, ct)
            ?? throw new BusinessRuleException("requesterId", $"Person {req.RequesterId} does not exist.");
        var actor = req.ActorId is { } actorId && actorId != requester.Id
            ? await RequireActorAsync(actorId, ct)
            : requester;
        await EnsureRelatedExistAsync(req.RelatedAssetId, req.RelatedJackId, ct);

        var now = UtcNow;
        var request = new ServiceRequest
        {
            Title = req.Title.Trim(),
            Description = req.Description.Trim(),
            Category = req.Category!.Value,
            Priority = req.Priority!.Value,
            Status = TicketStatus.New,
            RequesterId = requester.Id,
            RelatedAssetId = req.RelatedAssetId,
            RelatedJackId = req.RelatedJackId,
            CreatedAt = now,
            UpdatedAt = now,
            Version = 1
        };
        request.Events.Add(new TicketEvent
        {
            EventType = TicketEventType.Created,
            CreatedAt = now,
            ActorId = actor.Id,
            ActorName = actor.FullName,
            ToStatus = TicketStatus.New.ToString(),
            Text = $"Request opened for {requester.FullName} with priority {request.Priority}."
        });

        db.ServiceRequests.Add(request);
        await db.SaveChangesAsync(ct);
        return await GetAsync(request.Id, ct);
    }

    public async Task<ServiceRequestDetailDto> UpdateAsync(int id, UpdateServiceRequestRequest req, CancellationToken ct)
    {
        var request = await LoadForChangeAsync(id, req.Version!.Value, ct);
        if (request.Status == TicketStatus.Closed)
        {
            throw new ConflictException("Closed requests cannot be edited.");
        }

        var actor = await RequireActorAsync(req.ActorId!.Value, ct);
        await EnsureRelatedExistAsync(req.RelatedAssetId, req.RelatedJackId, ct);

        var changes = new List<string>();
        var title = req.Title.Trim();
        var description = req.Description.Trim();
        if (request.Title != title) changes.Add("title");
        if (request.Description != description) changes.Add("description");
        if (request.Category != req.Category) changes.Add($"category {request.Category} -> {req.Category}");
        if (request.Priority != req.Priority) changes.Add($"priority {request.Priority} -> {req.Priority}");
        if (request.RelatedAssetId != req.RelatedAssetId) changes.Add("related asset");
        if (request.RelatedJackId != req.RelatedJackId) changes.Add("related jack");

        if (changes.Count == 0)
        {
            return await GetAsync(id, ct);
        }

        var now = UtcNow;
        request.Title = title;
        request.Description = description;
        request.Category = req.Category!.Value;
        request.Priority = req.Priority!.Value;
        request.RelatedAssetId = req.RelatedAssetId;
        request.RelatedJackId = req.RelatedJackId;
        Touch(request, req.Version.Value, now);
        db.TicketEvents.Add(new TicketEvent
        {
            ServiceRequestId = id,
            EventType = TicketEventType.Updated,
            CreatedAt = now,
            ActorId = actor.Id,
            ActorName = actor.FullName,
            Text = "Updated " + string.Join(", ", changes) + "."
        });

        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<ServiceRequestDetailDto> AssignAsync(int id, AssignServiceRequestRequest req, CancellationToken ct)
    {
        var request = await LoadForChangeAsync(id, req.Version!.Value, ct);
        TicketWorkflow.EnsureCanAssign(request.Status);

        var actor = await RequireActorAsync(req.ActorId!.Value, ct);
        var assignee = await db.People.FirstOrDefaultAsync(p => p.Id == req.AssigneeId, ct)
            ?? throw new BusinessRuleException("assigneeId", $"Person {req.AssigneeId} does not exist.");
        if (!assignee.IsTechnician)
        {
            throw new BusinessRuleException("assigneeId", $"{assignee.FullName} is not a technician and cannot be assigned requests.");
        }

        var assigneeChanged = request.AssigneeId != assignee.Id;
        var moveToAssigned = request.Status is TicketStatus.New or TicketStatus.Reopened;
        if (!assigneeChanged && !moveToAssigned)
        {
            // Repeating the same assignment (for example a double-click) changes nothing.
            return await GetAsync(id, ct);
        }

        var now = UtcNow;
        if (assigneeChanged)
        {
            db.TicketEvents.Add(new TicketEvent
            {
                ServiceRequestId = id,
                EventType = TicketEventType.Assigned,
                CreatedAt = now,
                ActorId = actor.Id,
                ActorName = actor.FullName,
                FromAssignee = request.Assignee?.FullName,
                ToAssignee = assignee.FullName
            });
            request.AssigneeId = assignee.Id;
            request.Assignee = assignee;
        }

        if (moveToAssigned)
        {
            db.TicketEvents.Add(new TicketEvent
            {
                ServiceRequestId = id,
                EventType = TicketEventType.StatusChanged,
                CreatedAt = now,
                ActorId = actor.Id,
                ActorName = actor.FullName,
                FromStatus = request.Status.ToString(),
                ToStatus = TicketStatus.Assigned.ToString()
            });
            request.Status = TicketStatus.Assigned;
        }

        Touch(request, req.Version.Value, now);
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<ServiceRequestDetailDto> ChangeStatusAsync(int id, ChangeStatusRequest req, CancellationToken ct)
    {
        var request = await LoadForChangeAsync(id, req.Version!.Value, ct);
        var target = req.Status!.Value;
        TicketWorkflow.EnsureTransition(request.Status, target, request.AssigneeId is not null, req.Note);
        var actor = await RequireActorAsync(req.ActorId!.Value, ct);

        var now = UtcNow;
        var note = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim();
        db.TicketEvents.Add(new TicketEvent
        {
            ServiceRequestId = id,
            EventType = TicketEventType.StatusChanged,
            CreatedAt = now,
            ActorId = actor.Id,
            ActorName = actor.FullName,
            FromStatus = request.Status.ToString(),
            ToStatus = target.ToString(),
            Text = note
        });

        switch (target)
        {
            case TicketStatus.Resolved:
                request.ResolvedAt = now;
                request.ResolutionNotes = note;
                break;
            case TicketStatus.Closed:
                request.ClosedAt = now;
                break;
            case TicketStatus.Reopened:
                // Time-to-resolve is measured to the latest resolution, so clear the old one.
                request.ResolvedAt = null;
                request.ClosedAt = null;
                break;
        }

        request.Status = target;
        Touch(request, req.Version.Value, now);
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<ServiceRequestDetailDto> AddCommentAsync(int id, AddCommentRequest req, CancellationToken ct)
    {
        var request = await db.ServiceRequests.FirstOrDefaultAsync(r => r.Id == id, ct)
            ?? throw new NotFoundException($"Service request {ServiceRequest.FormatNumber(id)} was not found.");
        var actor = await RequireActorAsync(req.ActorId!.Value, ct);

        var now = UtcNow;
        db.TicketEvents.Add(new TicketEvent
        {
            ServiceRequestId = id,
            EventType = TicketEventType.Comment,
            CreatedAt = now,
            ActorId = actor.Id,
            ActorName = actor.FullName,
            Text = req.Text.Trim()
        });

        // Comments do not bump Version: adding a note should not invalidate someone else's open edit form.
        request.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    private async Task<ServiceRequest> LoadForChangeAsync(int id, int clientVersion, CancellationToken ct)
    {
        var request = await db.ServiceRequests.Include(r => r.Assignee).FirstOrDefaultAsync(r => r.Id == id, ct)
            ?? throw new NotFoundException($"Service request {ServiceRequest.FormatNumber(id)} was not found.");

        if (request.Version != clientVersion)
        {
            throw new ConflictException("This request was changed by someone else after you loaded it. Reload to see the latest version.");
        }

        return request;
    }

    /// <summary>Bumps the concurrency token. EF adds "AND Version = clientVersion" to the UPDATE.</summary>
    private void Touch(ServiceRequest request, int clientVersion, DateTime now)
    {
        db.Entry(request).Property(r => r.Version).OriginalValue = clientVersion;
        request.Version = clientVersion + 1;
        request.UpdatedAt = now;
    }

    private async Task<Person> RequireActorAsync(int actorId, CancellationToken ct) =>
        await db.People.FirstOrDefaultAsync(p => p.Id == actorId, ct)
        ?? throw new BusinessRuleException("actorId", $"Person {actorId} does not exist.");

    private async Task EnsureRelatedExistAsync(int? assetId, int? jackId, CancellationToken ct)
    {
        if (assetId is { } a && !await db.Assets.AnyAsync(x => x.Id == a, ct))
        {
            throw new BusinessRuleException("relatedAssetId", $"Asset {a} does not exist.");
        }

        if (jackId is { } j && !await db.NetworkJacks.AnyAsync(x => x.Id == j, ct))
        {
            throw new BusinessRuleException("relatedJackId", $"Jack {j} does not exist.");
        }
    }

    private static ServiceRequestDetailDto ToDetail(ServiceRequest r) => new(
        r.Id,
        r.Number,
        r.Title,
        r.Description,
        r.Category,
        r.Priority,
        r.Status,
        r.RequesterId,
        r.Requester!.FullName,
        r.AssigneeId,
        r.Assignee?.FullName,
        r.RelatedAsset is null ? null : new RelatedAssetDto(r.RelatedAsset.Id, r.RelatedAsset.AssetTag, $"{r.RelatedAsset.Manufacturer} {r.RelatedAsset.Model}"),
        r.RelatedJack is null ? null : new RelatedJackDto(r.RelatedJack.Id, r.RelatedJack.Label, r.RelatedJack.Location!.DisplayName, r.RelatedJack.Status),
        r.ResolutionNotes,
        r.CreatedAt,
        r.UpdatedAt,
        r.ResolvedAt,
        r.ClosedAt,
        r.Version,
        TicketWorkflow.AllowedNext(r.Status),
        r.Events
            .OrderBy(e => e.CreatedAt).ThenBy(e => e.Id)
            .Select(e => new TicketEventDto(e.Id, e.EventType, e.CreatedAt, e.ActorId, e.ActorName, e.FromStatus, e.ToStatus, e.FromAssignee, e.ToAssignee, e.Text))
            .ToList());
}
