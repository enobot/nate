using ItAssetTracker.Api.Data;
using ItAssetTracker.Api.Domain;

namespace ItAssetTracker.Tests.Integration;

/// <summary>
/// A small hand-built dataset with known answers for every report. "Now" is 2026-06-15 12:00 UTC.
///
/// Assets (6): Deployed 2 (ENG), InStock 2 (ADM), InRepair 1 (LIB), Retired 1 (no location).
///   Warranty within 30 days and not retired: ACC-0001 (10 days), ACC-0004 (30 days).
///   ACC-0002 ends in 47 days, ACC-0003 expired yesterday, ACC-0005 is retired.
/// Switches: ENG-IDF1-SW01 (4 access ports: 3 patched, 2 active), LIB-IDF1-SW01 (2 free access ports
///   plus uplink port 1/1/3, which reports must not count and jacks must never use).
/// Jacks (5): 2 active, 1 inactive patched, 1 inactive unpatched, 1 faulty.
/// Requests (8): open = T1 New P1, T2 Assigned P2, T3 InProgress P2, T4 Reopened P3, T8 New P4.
///   Resolved/closed: T5 JackActivation 6h, T6 Hardware 30h, T7 JackActivation 2h (60 days ago).
/// </summary>
public static class TestData
{
    public static DateTime Now => ApiFactory.FixedNow;

    public static async Task SeedAsync(AppDbContext db, DateTime now)
    {
        var eng214 = new Location { BuildingCode = "ENG", Building = "Engineering Hall", Floor = 2, Room = "214" };
        var engIdf = new Location { BuildingCode = "ENG", Building = "Engineering Hall", Floor = 1, Room = "IDF1" };
        var lib105 = new Location { BuildingCode = "LIB", Building = "Fenn Library", Floor = 1, Room = "105" };
        var admStorage = new Location { BuildingCode = "ADM", Building = "Admin Building", Floor = 0, Room = "B012" };
        db.Locations.AddRange(eng214, engIdf, lib105, admStorage);

        var alex = new Person { FirstName = "Alex", LastName = "Analyst", Email = "alex.analyst@test.example", Department = "IT Services", IsTechnician = true };
        var sam = new Person { FirstName = "Sam", LastName = "Support", Email = "sam.support@test.example", Department = "IT Services", IsTechnician = true };
        var pat = new Person { FirstName = "Pat", LastName = "Requester", Email = "pat.requester@test.example", Department = "Registrar" };
        var jamie = new Person { FirstName = "Jamie", LastName = "Staff", Email = "jamie.staff@test.example", Department = "Biology" };
        db.People.AddRange(alex, sam, pat, jamie);

        db.Vlans.AddRange(
            new Vlan { VlanId = 10, Name = "STAFF-DATA" },
            new Vlan { VlanId = 20, Name = "VOICE" });

        var eng = new NetworkSwitch { Name = "ENG-IDF1-SW01", Model = "Test 4-port", ManagementIp = "10.20.40.2", Location = engIdf };
        for (var n = 1; n <= 4; n++)
        {
            eng.Ports.Add(new SwitchPort { PortNumber = n, PortName = $"1/1/{n}", AdminStatus = PortAdminStatus.Disabled });
        }

        eng.Ports[0].AdminStatus = PortAdminStatus.Enabled;
        eng.Ports[0].VlanId = 10;
        eng.Ports[1].AdminStatus = PortAdminStatus.Enabled;
        eng.Ports[1].VlanId = 20;

        var lib = new NetworkSwitch { Name = "LIB-IDF1-SW01", Model = "Test 2-port", ManagementIp = "10.20.20.2", Location = lib105 };
        for (var n = 1; n <= 2; n++)
        {
            lib.Ports.Add(new SwitchPort { PortNumber = n, PortName = $"1/1/{n}", AdminStatus = PortAdminStatus.Disabled });
        }

        lib.Ports.Add(new SwitchPort
        {
            PortNumber = 3,
            PortName = "1/1/3",
            Role = PortRole.Uplink,
            AdminStatus = PortAdminStatus.Enabled,
            VlanId = 10,
            Description = "Uplink to core"
        });

        db.NetworkSwitches.AddRange(eng, lib);

        var j1 = new NetworkJack { Label = "2-214A", Location = eng214, JackType = JackType.Data, Status = JackStatus.Active, SwitchPort = eng.Ports[0] };
        var j2 = new NetworkJack { Label = "2-214C", Location = eng214, JackType = JackType.Voice, Status = JackStatus.Active, SwitchPort = eng.Ports[1] };
        var j3 = new NetworkJack { Label = "2-214B", Location = eng214, JackType = JackType.Data, Status = JackStatus.Inactive, SwitchPort = eng.Ports[2] };
        var j4 = new NetworkJack { Label = "1-105A", Location = lib105, JackType = JackType.Data, Status = JackStatus.Inactive };
        var j5 = new NetworkJack { Label = "1-105B", Location = lib105, JackType = JackType.Data, Status = JackStatus.Faulty };
        db.NetworkJacks.AddRange(j1, j2, j3, j4, j5);

        var today = DateOnly.FromDateTime(now);
        Asset NewAsset(string tag, AssetType type, AssetStatus status, Location? location, Person? person, int? warrantyDays) => new()
        {
            AssetTag = tag,
            AssetType = type,
            Manufacturer = "Dell",
            Model = $"Model {tag}",
            SerialNumber = "SN" + tag.Replace("-", ""),
            Status = status,
            Location = location,
            AssignedTo = person,
            PurchaseDate = today.AddYears(-2),
            WarrantyEndDate = warrantyDays is { } d ? today.AddDays(d) : null,
            CreatedAt = now.AddYears(-2),
            UpdatedAt = now.AddYears(-2),
            Version = 1
        };

        var a1 = NewAsset("ACC-0001", AssetType.Laptop, AssetStatus.Deployed, eng214, pat, 10);
        var a2 = NewAsset("ACC-0002", AssetType.Desktop, AssetStatus.Deployed, eng214, null, 47);
        var a3 = NewAsset("ACC-0003", AssetType.Monitor, AssetStatus.InStock, admStorage, null, -1);
        var a4 = NewAsset("ACC-0004", AssetType.Printer, AssetStatus.InRepair, lib105, null, 30);
        var a5 = NewAsset("ACC-0005", AssetType.Laptop, AssetStatus.Retired, null, null, 5);
        var a6 = NewAsset("ACC-0006", AssetType.Laptop, AssetStatus.InStock, admStorage, null, null);
        db.Assets.AddRange(a1, a2, a3, a4, a5, a6);

        await db.SaveChangesAsync();

        ServiceRequest Ticket(string title, TicketCategory category, TicketPriority priority, TicketStatus status,
            double createdHoursAgo, Person? assignee, double? resolvedAfterHours = null)
        {
            var created = now.AddHours(-createdHoursAgo);
            var r = new ServiceRequest
            {
                Title = title,
                Description = $"Fixture request: {title}",
                Category = category,
                Priority = priority,
                Status = status,
                Requester = pat,
                Assignee = assignee,
                CreatedAt = created,
                UpdatedAt = created,
                ResolvedAt = resolvedAfterHours is { } h ? created.AddHours(h) : null,
                ClosedAt = status == TicketStatus.Closed && resolvedAfterHours is { } c ? created.AddHours(c + 24) : null,
                ResolutionNotes = resolvedAfterHours is null ? null : "Fixed in fixture",
                Version = 1
            };
            r.Events.Add(new TicketEvent { EventType = TicketEventType.Created, CreatedAt = created, ActorId = pat.Id, ActorName = pat.FullName, ToStatus = "New" });
            return r;
        }

        db.ServiceRequests.AddRange(
            Ticket("T1 activate jack 1-105A", TicketCategory.JackActivation, TicketPriority.P1, TicketStatus.New, 2, null),
            Ticket("T2 slow network", TicketCategory.Network, TicketPriority.P2, TicketStatus.Assigned, 48, alex),
            Ticket("T3 laptop broken", TicketCategory.Hardware, TicketPriority.P2, TicketStatus.InProgress, 5 * 24, sam),
            Ticket("T4 phone no service", TicketCategory.Telephone, TicketPriority.P3, TicketStatus.Reopened, 40 * 24, alex),
            Ticket("T5 activate jack 2-214A", TicketCategory.JackActivation, TicketPriority.P3, TicketStatus.Resolved, 5 * 24, alex, 6),
            Ticket("T6 monitor flicker", TicketCategory.Hardware, TicketPriority.P4, TicketStatus.Closed, 20 * 24, sam, 30),
            Ticket("T7 activate jack 2-214C", TicketCategory.JackActivation, TicketPriority.P3, TicketStatus.Closed, 60 * 24, alex, 2),
            Ticket("T8 install software", TicketCategory.Software, TicketPriority.P4, TicketStatus.New, 8 * 24, null));

        await db.SaveChangesAsync();
    }
}
