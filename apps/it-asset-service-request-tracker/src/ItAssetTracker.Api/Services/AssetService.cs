using ItAssetTracker.Api.Contracts;
using ItAssetTracker.Api.Data;
using ItAssetTracker.Api.Domain;
using ItAssetTracker.Api.Domain.Rules;
using ItAssetTracker.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace ItAssetTracker.Api.Services;

public sealed class AssetService(AppDbContext db, TimeProvider clock)
{
    private DateTime UtcNow => clock.GetUtcNow().UtcDateTime;
    private DateOnly Today => DateOnly.FromDateTime(UtcNow);

    public async Task<PagedResult<AssetListItemDto>> ListAsync(AssetQuery q, CancellationToken ct)
    {
        var (page, pageSize) = Paging.Normalize(q.Page, q.PageSize);
        IQueryable<Asset> query = db.Assets.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var pattern = QueryHelpers.ContainsPattern(q.Search.Trim());
            var esc = QueryHelpers.LikeEscape.ToString();
            query = query.Where(a =>
                EF.Functions.Like(a.AssetTag, pattern, esc) ||
                EF.Functions.Like(a.SerialNumber, pattern, esc) ||
                EF.Functions.Like(a.Manufacturer, pattern, esc) ||
                EF.Functions.Like(a.Model, pattern, esc) ||
                (a.AssignedTo != null && EF.Functions.Like(a.AssignedTo.FirstName + " " + a.AssignedTo.LastName, pattern, esc)));
        }

        if (q.Status is { } status)
        {
            query = query.Where(a => a.Status == status);
        }

        if (q.Type is { } type)
        {
            query = query.Where(a => a.AssetType == type);
        }

        if (!string.IsNullOrWhiteSpace(q.Building))
        {
            var code = q.Building.Trim().ToUpperInvariant();
            query = query.Where(a => a.Location != null && a.Location.BuildingCode == code);
        }

        if (q.LocationId is { } locationId)
        {
            query = query.Where(a => a.LocationId == locationId);
        }

        if (q.AssignedToId is { } personId)
        {
            query = query.Where(a => a.AssignedToPersonId == personId);
        }

        if (q.WarrantyWithinDays is { } days)
        {
            var today = Today;
            var until = today.AddDays(days);
            query = query.Where(a => a.Status != AssetStatus.Retired && a.WarrantyEndDate != null
                && a.WarrantyEndDate >= today && a.WarrantyEndDate <= until);
        }

        var (field, desc) = QueryHelpers.ParseSort(q.Sort, "assetTag");
        query = field.ToLowerInvariant() switch
        {
            "type" => desc ? query.OrderByDescending(a => a.AssetType).ThenBy(a => a.AssetTag) : query.OrderBy(a => a.AssetType).ThenBy(a => a.AssetTag),
            "status" => desc ? query.OrderByDescending(a => a.Status).ThenBy(a => a.AssetTag) : query.OrderBy(a => a.Status).ThenBy(a => a.AssetTag),
            "model" => desc ? query.OrderByDescending(a => a.Manufacturer).ThenByDescending(a => a.Model) : query.OrderBy(a => a.Manufacturer).ThenBy(a => a.Model),
            "location" => desc
                ? query.OrderByDescending(a => a.Location!.BuildingCode).ThenByDescending(a => a.Location!.Room)
                : query.OrderBy(a => a.Location!.BuildingCode).ThenBy(a => a.Location!.Room),
            "assignedto" => desc
                ? query.OrderByDescending(a => a.AssignedTo!.LastName).ThenByDescending(a => a.AssignedTo!.FirstName)
                : query.OrderBy(a => a.AssignedTo!.LastName).ThenBy(a => a.AssignedTo!.FirstName),
            "purchasedate" => desc ? query.OrderByDescending(a => a.PurchaseDate).ThenBy(a => a.AssetTag) : query.OrderBy(a => a.PurchaseDate).ThenBy(a => a.AssetTag),
            "warrantyenddate" => desc ? query.OrderByDescending(a => a.WarrantyEndDate).ThenBy(a => a.AssetTag) : query.OrderBy(a => a.WarrantyEndDate).ThenBy(a => a.AssetTag),
            "assettag" => desc ? query.OrderByDescending(a => a.AssetTag) : query.OrderBy(a => a.AssetTag),
            _ => throw new BusinessRuleException("sort", $"Unknown sort field '{field}'.")
        };

        var total = await query.CountAsync(ct);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new AssetListItemDto(
                a.Id,
                a.AssetTag,
                a.AssetType,
                a.Manufacturer,
                a.Model,
                a.SerialNumber,
                a.Status,
                a.LocationId,
                a.Location != null ? a.Location.BuildingCode + " " + a.Location.Room : null,
                a.AssignedToPersonId,
                a.AssignedTo != null ? a.AssignedTo.FirstName + " " + a.AssignedTo.LastName : null,
                a.PurchaseDate,
                a.WarrantyEndDate))
            .ToListAsync(ct);

        return new PagedResult<AssetListItemDto>(items, total, page, pageSize);
    }

    public async Task<AssetDetailDto> GetAsync(int id, CancellationToken ct)
    {
        var asset = await db.Assets.AsNoTracking()
            .Include(a => a.Location)
            .Include(a => a.AssignedTo)
            .FirstOrDefaultAsync(a => a.Id == id, ct)
            ?? throw new NotFoundException($"Asset {id} was not found.");

        var openRequests = await db.ServiceRequests.CountAsync(r => r.RelatedAssetId == id
            && r.Status != TicketStatus.Resolved && r.Status != TicketStatus.Closed, ct);

        return ToDetail(asset, openRequests);
    }

    public async Task<IReadOnlyList<AssetHistoryDto>> GetHistoryAsync(int id, CancellationToken ct)
    {
        if (!await db.Assets.AnyAsync(a => a.Id == id, ct))
        {
            throw new NotFoundException($"Asset {id} was not found.");
        }

        return await db.AssetHistory.AsNoTracking()
            .Where(h => h.AssetId == id)
            .OrderByDescending(h => h.ChangedAt).ThenByDescending(h => h.Id)
            .Select(h => new AssetHistoryDto(h.Id, h.ChangedAt, h.FromStatus, h.ToStatus, h.FromAssignee, h.ToAssignee, h.FromLocation, h.ToLocation, h.Note))
            .ToListAsync(ct);
    }

    public async Task<AssetDetailDto> CreateAsync(CreateAssetRequest req, CancellationToken ct)
    {
        var tag = AssetRules.NormalizeIdentifier(req.AssetTag);
        var serial = AssetRules.NormalizeIdentifier(req.SerialNumber);
        var status = req.Status!.Value;

        AssetRules.EnsureValid(null, status, req.LocationId, req.AssignedToId, req.PurchaseDate, req.WarrantyEndDate, Today);
        var (location, person) = await LoadReferencesAsync(req.LocationId, req.AssignedToId, ct);
        await EnsureUniqueAsync(tag, serial, excludeId: null, ct);

        var now = UtcNow;
        var asset = new Asset
        {
            AssetTag = tag,
            AssetType = req.Type!.Value,
            Manufacturer = req.Manufacturer.Trim(),
            Model = req.Model.Trim(),
            SerialNumber = serial,
            Status = status,
            LocationId = location?.Id,
            AssignedToPersonId = person?.Id,
            PurchaseDate = req.PurchaseDate,
            WarrantyEndDate = req.WarrantyEndDate,
            Notes = TrimToNull(req.Notes),
            CreatedAt = now,
            UpdatedAt = now,
            Version = 1
        };
        asset.History.Add(new AssetHistory
        {
            ChangedAt = now,
            ToStatus = status.ToString(),
            ToAssignee = person?.FullName,
            ToLocation = location?.DisplayName,
            Note = "Asset added to inventory"
        });

        db.Assets.Add(asset);
        await db.SaveChangesAsync(ct);

        asset.Location = location;
        asset.AssignedTo = person;
        return ToDetail(asset, 0);
    }

    public async Task<AssetDetailDto> UpdateAsync(int id, UpdateAssetRequest req, CancellationToken ct)
    {
        var asset = await db.Assets
            .Include(a => a.Location)
            .Include(a => a.AssignedTo)
            .FirstOrDefaultAsync(a => a.Id == id, ct)
            ?? throw new NotFoundException($"Asset {id} was not found.");

        if (asset.Version != req.Version)
        {
            throw new ConflictException("This asset was changed by someone else after you loaded it. Reload and try again.");
        }

        var tag = AssetRules.NormalizeIdentifier(req.AssetTag);
        var serial = AssetRules.NormalizeIdentifier(req.SerialNumber);
        var status = req.Status!.Value;

        AssetRules.EnsureValid(asset.Status, status, req.LocationId, req.AssignedToId, req.PurchaseDate, req.WarrantyEndDate, Today);
        var (location, person) = await LoadReferencesAsync(req.LocationId, req.AssignedToId, ct);
        await EnsureUniqueAsync(tag, serial, excludeId: id, ct);

        var oldStatus = asset.Status;
        var oldAssignee = asset.AssignedTo?.FullName;
        var oldLocation = asset.Location?.DisplayName;
        var now = UtcNow;

        asset.AssetTag = tag;
        asset.AssetType = req.Type!.Value;
        asset.Manufacturer = req.Manufacturer.Trim();
        asset.Model = req.Model.Trim();
        asset.SerialNumber = serial;
        asset.Status = status;
        asset.LocationId = location?.Id;
        asset.Location = location;
        asset.AssignedToPersonId = person?.Id;
        asset.AssignedTo = person;
        asset.PurchaseDate = req.PurchaseDate;
        asset.WarrantyEndDate = req.WarrantyEndDate;
        asset.Notes = TrimToNull(req.Notes);
        asset.UpdatedAt = now;

        // The WHERE clause of the UPDATE includes "Version = <value the client read>", so a write
        // that slipped in between our read and this save makes EF throw DbUpdateConcurrencyException (409).
        db.Entry(asset).Property(a => a.Version).OriginalValue = req.Version!.Value;
        asset.Version = req.Version.Value + 1;

        var newAssignee = person?.FullName;
        var newLocation = location?.DisplayName;
        if (oldStatus != status || oldAssignee != newAssignee || oldLocation != newLocation)
        {
            db.AssetHistory.Add(new AssetHistory
            {
                AssetId = asset.Id,
                ChangedAt = now,
                FromStatus = oldStatus.ToString(),
                ToStatus = status.ToString(),
                FromAssignee = oldAssignee,
                ToAssignee = newAssignee,
                FromLocation = oldLocation,
                ToLocation = newLocation,
                Note = TrimToNull(req.ChangeNote)
            });
        }

        await db.SaveChangesAsync(ct);

        var openRequests = await db.ServiceRequests.CountAsync(r => r.RelatedAssetId == id
            && r.Status != TicketStatus.Resolved && r.Status != TicketStatus.Closed, ct);
        return ToDetail(asset, openRequests);
    }

    public async Task DeleteAsync(int id, CancellationToken ct)
    {
        var asset = await db.Assets.FirstOrDefaultAsync(a => a.Id == id, ct)
            ?? throw new NotFoundException($"Asset {id} was not found.");

        var linked = await db.ServiceRequests.CountAsync(r => r.RelatedAssetId == id, ct);
        if (linked > 0)
        {
            throw new ConflictException($"Asset {asset.AssetTag} is linked to {linked} service request(s). Retire it instead of deleting so the ticket history stays intact.");
        }

        db.Assets.Remove(asset);
        await db.SaveChangesAsync(ct);
    }

    private async Task<(Location? Location, Person? Person)> LoadReferencesAsync(int? locationId, int? personId, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        Location? location = null;
        Person? person = null;

        if (locationId is { } lid)
        {
            location = await db.Locations.FirstOrDefaultAsync(l => l.Id == lid, ct);
            if (location is null)
            {
                errors["locationId"] = [$"Location {lid} does not exist."];
            }
        }

        if (personId is { } pid)
        {
            person = await db.People.FirstOrDefaultAsync(p => p.Id == pid, ct);
            if (person is null)
            {
                errors["assignedToId"] = [$"Person {pid} does not exist."];
            }
        }

        if (errors.Count > 0)
        {
            throw new BusinessRuleException(errors);
        }

        return (location, person);
    }

    private async Task EnsureUniqueAsync(string tag, string serial, int? excludeId, CancellationToken ct)
    {
        if (await db.Assets.AnyAsync(a => a.AssetTag == tag && a.Id != excludeId, ct))
        {
            throw new ConflictException($"Asset tag {tag} is already in use.");
        }

        if (await db.Assets.AnyAsync(a => a.SerialNumber == serial && a.Id != excludeId, ct))
        {
            throw new ConflictException($"Serial number {serial} is already recorded on another asset.");
        }
    }

    private static string? TrimToNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static AssetDetailDto ToDetail(Asset a, int openRequests) => new(
        a.Id,
        a.AssetTag,
        a.AssetType,
        a.Manufacturer,
        a.Model,
        a.SerialNumber,
        a.Status,
        a.LocationId,
        a.Location?.DisplayName,
        a.AssignedToPersonId,
        a.AssignedTo?.FullName,
        a.PurchaseDate,
        a.WarrantyEndDate,
        a.Notes,
        a.CreatedAt,
        a.UpdatedAt,
        a.Version,
        openRequests);
}
