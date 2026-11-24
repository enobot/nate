using ItAssetTracker.Api.Contracts;
using ItAssetTracker.Api.Data;
using ItAssetTracker.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace ItAssetTracker.Api.Services;

/// <summary>Locations (buildings and rooms) and people.</summary>
public sealed class DirectoryService(AppDbContext db)
{
    public async Task<IReadOnlyList<LocationDto>> ListLocationsAsync(CancellationToken ct) =>
        await db.Locations.AsNoTracking()
            .OrderBy(l => l.BuildingCode).ThenBy(l => l.Floor).ThenBy(l => l.Room)
            .Select(l => new LocationDto(
                l.Id, l.BuildingCode, l.Building, l.Floor, l.Room, l.Description,
                l.BuildingCode + " " + l.Room,
                db.Assets.Count(a => a.LocationId == l.Id),
                db.NetworkJacks.Count(j => j.LocationId == l.Id)))
            .ToListAsync(ct);

    public async Task<LocationDto> CreateLocationAsync(LocationWriteRequest req, CancellationToken ct)
    {
        var code = req.BuildingCode.Trim().ToUpperInvariant();
        var room = req.Room.Trim().ToUpperInvariant();
        if (await db.Locations.AnyAsync(l => l.BuildingCode == code && l.Room == room, ct))
        {
            throw new ConflictException($"Room {room} already exists in building {code}.");
        }

        var location = new Location
        {
            BuildingCode = code,
            Building = req.Building.Trim(),
            Floor = req.Floor!.Value,
            Room = room,
            Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim()
        };
        db.Locations.Add(location);
        await db.SaveChangesAsync(ct);
        return new LocationDto(location.Id, code, location.Building, location.Floor, room, location.Description, location.DisplayName, 0, 0);
    }

    public async Task<LocationDto> UpdateLocationAsync(int id, LocationWriteRequest req, CancellationToken ct)
    {
        var location = await db.Locations.FirstOrDefaultAsync(l => l.Id == id, ct)
            ?? throw new NotFoundException($"Location {id} was not found.");

        var code = req.BuildingCode.Trim().ToUpperInvariant();
        var room = req.Room.Trim().ToUpperInvariant();
        if (await db.Locations.AnyAsync(l => l.BuildingCode == code && l.Room == room && l.Id != id, ct))
        {
            throw new ConflictException($"Room {room} already exists in building {code}.");
        }

        location.BuildingCode = code;
        location.Building = req.Building.Trim();
        location.Floor = req.Floor!.Value;
        location.Room = room;
        location.Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim();
        await db.SaveChangesAsync(ct);

        return new LocationDto(location.Id, code, location.Building, location.Floor, room, location.Description, location.DisplayName,
            await db.Assets.CountAsync(a => a.LocationId == id, ct),
            await db.NetworkJacks.CountAsync(j => j.LocationId == id, ct));
    }

    public async Task DeleteLocationAsync(int id, CancellationToken ct)
    {
        var location = await db.Locations.FirstOrDefaultAsync(l => l.Id == id, ct)
            ?? throw new NotFoundException($"Location {id} was not found.");

        var assets = await db.Assets.CountAsync(a => a.LocationId == id, ct);
        var jacks = await db.NetworkJacks.CountAsync(j => j.LocationId == id, ct);
        var switches = await db.NetworkSwitches.CountAsync(s => s.LocationId == id, ct);
        if (assets + jacks + switches > 0)
        {
            throw new ConflictException($"{location.DisplayName} is still used by {assets} asset(s), {jacks} jack(s) and {switches} switch(es). Move them first.");
        }

        db.Locations.Remove(location);
        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<PersonDto>> ListPeopleAsync(bool technicianOnly, string? search, CancellationToken ct)
    {
        IQueryable<Person> query = db.People.AsNoTracking();
        if (technicianOnly)
        {
            query = query.Where(p => p.IsTechnician);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = Infrastructure.QueryHelpers.ContainsPattern(search.Trim());
            var esc = Infrastructure.QueryHelpers.LikeEscape.ToString();
            query = query.Where(p => EF.Functions.Like(p.FirstName + " " + p.LastName, pattern, esc)
                || EF.Functions.Like(p.Email, pattern, esc)
                || EF.Functions.Like(p.Department, pattern, esc));
        }

        return await query
            .OrderBy(p => p.LastName).ThenBy(p => p.FirstName)
            .Select(p => new PersonDto(p.Id, p.FirstName, p.LastName, p.FirstName + " " + p.LastName, p.Email, p.Department, p.JobTitle,
                p.IsTechnician, db.Assets.Count(a => a.AssignedToPersonId == p.Id)))
            .ToListAsync(ct);
    }

    public async Task<PersonDto> CreatePersonAsync(PersonWriteRequest req, CancellationToken ct)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        if (await db.People.AnyAsync(p => p.Email == email, ct))
        {
            throw new ConflictException($"{email} is already used by another person.");
        }

        var person = new Person
        {
            FirstName = req.FirstName.Trim(),
            LastName = req.LastName.Trim(),
            Email = email,
            Department = req.Department.Trim(),
            JobTitle = string.IsNullOrWhiteSpace(req.JobTitle) ? null : req.JobTitle.Trim(),
            IsTechnician = req.IsTechnician
        };
        db.People.Add(person);
        await db.SaveChangesAsync(ct);
        return ToDto(person, 0);
    }

    public async Task<PersonDto> UpdatePersonAsync(int id, PersonWriteRequest req, CancellationToken ct)
    {
        var person = await db.People.FirstOrDefaultAsync(p => p.Id == id, ct)
            ?? throw new NotFoundException($"Person {id} was not found.");

        var email = req.Email.Trim().ToLowerInvariant();
        if (await db.People.AnyAsync(p => p.Email == email && p.Id != id, ct))
        {
            throw new ConflictException($"{email} is already used by another person.");
        }

        if (person.IsTechnician && !req.IsTechnician)
        {
            var open = await db.ServiceRequests.CountAsync(r => r.AssigneeId == id
                && r.Status != TicketStatus.Resolved && r.Status != TicketStatus.Closed, ct);
            if (open > 0)
            {
                throw new ConflictException($"{person.FullName} still has {open} open service request(s). Reassign them first.");
            }
        }

        person.FirstName = req.FirstName.Trim();
        person.LastName = req.LastName.Trim();
        person.Email = email;
        person.Department = req.Department.Trim();
        person.JobTitle = string.IsNullOrWhiteSpace(req.JobTitle) ? null : req.JobTitle.Trim();
        person.IsTechnician = req.IsTechnician;
        await db.SaveChangesAsync(ct);

        return ToDto(person, await db.Assets.CountAsync(a => a.AssignedToPersonId == id, ct));
    }

    public async Task DeletePersonAsync(int id, CancellationToken ct)
    {
        var person = await db.People.FirstOrDefaultAsync(p => p.Id == id, ct)
            ?? throw new NotFoundException($"Person {id} was not found.");

        var assets = await db.Assets.CountAsync(a => a.AssignedToPersonId == id, ct);
        var requests = await db.ServiceRequests.CountAsync(r => r.RequesterId == id || r.AssigneeId == id, ct);
        if (assets + requests > 0)
        {
            throw new ConflictException($"{person.FullName} has {assets} assigned asset(s) and {requests} service request(s). Reassign them before removing this person.");
        }

        db.People.Remove(person);
        await db.SaveChangesAsync(ct);
    }

    private static PersonDto ToDto(Person p, int assetCount) =>
        new(p.Id, p.FirstName, p.LastName, p.FullName, p.Email, p.Department, p.JobTitle, p.IsTechnician, assetCount);
}
