using ItAssetTracker.Api.Domain;
using ItAssetTracker.Api.Domain.Rules;

namespace ItAssetTracker.Api.Data;

/// <summary>
/// Inserts fictional demo data for "Alder Creek College", an invented organization.
/// No names, rooms or addresses belong to a real organization; emails use the reserved
/// .example domain. A fixed random seed makes every reset produce the same data. Dates are
/// calculated relative to the time of seeding so ticket ages and warranty windows stay realistic.
/// </summary>
public static class DemoDataSeeder
{
    public const string OrganizationName = "Alder Creek College";
    public const string EmailDomain = "aldercreek.example";
    public const int AssetCount = 300;
    public const int TicketCount = 100;
    private const int RandomSeed = 20260115;

    private sealed record BuildingSpec(string Code, string Name, int Floors);

    private static readonly BuildingSpec[] Buildings =
    [
        new("ADM", "Halvorsen Administration Building", 3),
        new("LIB", "Marlowe Library", 4),
        new("SCI", "Oakridge Science Hall", 3),
        new("ENG", "Engineering and Computer Science", 3),
        new("STU", "Student Union", 2)
    ];

    private static readonly string[] FirstNames =
    [
        "Avery", "Jordan", "Priya", "Marcus", "Elena", "Diego", "Hannah", "Kenji", "Olivia", "Samuel",
        "Imani", "Lucas", "Mei", "Gabriel", "Fatima", "Owen", "Rosa", "Theo", "Naomi", "Victor",
        "Leah", "Andre", "Sofia", "Malik", "Grace", "Rafael", "Chloe", "Isaac", "Yara", "Caleb",
        "Nadia", "Elliot", "Zoe", "Hector", "Ines", "Wesley", "Tessa", "Omar", "Lena", "Felix"
    ];

    private static readonly string[] LastNames =
    [
        "Alvarez", "Brennan", "Castillo", "Dang", "Ellison", "Ferreira", "Gallagher", "Hoang", "Ibarra", "Jansen",
        "Kowalski", "Lindqvist", "Maddox", "Nakamura", "Okafor", "Petrov", "Quintero", "Ramsey", "Salazar", "Thornton",
        "Underwood", "Valdez", "Whitaker", "Xiong", "Yamada", "Zamora", "Abbott", "Barlow", "Cordero", "Delacroix"
    ];

    private static readonly string[] Departments =
    [
        "Admissions", "Registrar", "Financial Aid", "Library Services", "Biology", "Chemistry",
        "Mathematics", "Computer Science", "Mechanical Engineering", "Student Life", "Facilities", "Human Resources"
    ];

    private sealed record ModelSpec(string Manufacturer, string Model);

    private sealed record TypeSpec(AssetType Type, int Count, int WarrantyYears, string SerialPrefix, ModelSpec[] Models);

    private static readonly TypeSpec[] AssetTypes =
    [
        new(AssetType.Laptop, 90, 3, "LT", [new("Dell", "Latitude 5450"), new("Lenovo", "ThinkPad T14 Gen 5"), new("HP", "EliteBook 840 G11"), new("Apple", "MacBook Air 13")]),
        new(AssetType.Desktop, 70, 4, "DT", [new("Dell", "OptiPlex 7020"), new("HP", "EliteDesk 800 G9"), new("Lenovo", "ThinkCentre M90q")]),
        new(AssetType.Monitor, 70, 3, "MN", [new("Dell", "P2425H"), new("HP", "E24 G5"), new("LG", "27BQ75QB")]),
        new(AssetType.Printer, 15, 1, "PR", [new("HP", "LaserJet Pro 4001n"), new("Brother", "HL-L6210DW")]),
        new(AssetType.VoipPhone, 35, 2, "VP", [new("Alcatel-Lucent", "ALE-300 DeskPhone"), new("Poly", "CCX 400")]),
        new(AssetType.Tablet, 10, 1, "TB", [new("Apple", "iPad 10th generation"), new("Samsung", "Galaxy Tab S9 FE")]),
        new(AssetType.Projector, 10, 2, "PJ", [new("Epson", "PowerLite 1288"), new("BenQ", "MW560")])
    ];

    public static async Task SeedAsync(AppDbContext db, DateTime nowUtc, CancellationToken ct = default)
    {
        var rng = new Random(RandomSeed);
        var now = new DateTime(nowUtc.Year, nowUtc.Month, nowUtc.Day, nowUtc.Hour, nowUtc.Minute, 0, DateTimeKind.Utc);
        var today = DateOnly.FromDateTime(now);

        // ---- VLANs ----
        var vlans = new List<Vlan>
        {
            new() { VlanId = 1, Name = "DEFAULT", Description = "Switch default VLAN. Not used for user ports." },
            new() { VlanId = 10, Name = "STAFF-DATA", Description = "Faculty and staff wired data" },
            new() { VlanId = 20, Name = "VOICE", Description = "VoIP desk phones" },
            new() { VlanId = 30, Name = "STUDENT-LAB", Description = "Computer labs and library public PCs" },
            new() { VlanId = 40, Name = "PRINTERS", Description = "Network printers and copiers" },
            new() { VlanId = 50, Name = "WIRELESS-AP", Description = "Wireless access point uplinks" },
            new() { VlanId = 99, Name = "NET-MGMT", Description = "Switch management interfaces" }
        };
        db.Vlans.AddRange(vlans);

        // ---- Locations ----
        var offices = new List<Location>();
        var labs = new List<Location>();
        var closets = new Dictionary<string, List<Location>>();
        var allRooms = new List<Location>();
        Location storage = null!, workroom = null!;

        foreach (var b in Buildings)
        {
            closets[b.Code] = [];
            for (var floor = 1; floor <= b.Floors; floor++)
            {
                if (floor == 1 || (b.Code == "LIB" && floor == 3))
                {
                    var idf = new Location { BuildingCode = b.Code, Building = b.Name, Floor = floor, Room = $"IDF{floor}", Description = "Telecom closet (IDF)" };
                    closets[b.Code].Add(idf);
                    db.Locations.Add(idf);
                }

                var roomCount = b.Code == "STU" ? 4 : 4 - (floor == 4 ? 1 : 0);
                for (var r = 0; r < roomCount; r++)
                {
                    var number = floor * 100 + 4 + r * 7 + rng.Next(0, 3);
                    var isLab = (b.Code is "ENG" or "SCI" or "LIB") && r == roomCount - 1;
                    var room = new Location
                    {
                        BuildingCode = b.Code,
                        Building = b.Name,
                        Floor = floor,
                        Room = number.ToString(),
                        Description = isLab ? (b.Code == "LIB" ? "Public computer area" : "Computer lab") : "Offices"
                    };
                    db.Locations.Add(room);
                    allRooms.Add(room);
                    (isLab ? labs : offices).Add(room);
                }
            }

            if (b.Code == "ADM")
            {
                storage = new Location { BuildingCode = "ADM", Building = b.Name, Floor = 0, Room = "B012", Description = "IT storage (stock room)" };
                workroom = new Location { BuildingCode = "ADM", Building = b.Name, Floor = 0, Room = "B014", Description = "IT repair workroom" };
                db.Locations.AddRange(storage, workroom);
                allRooms.Add(workroom);
            }
        }

        // ---- People ----
        var technicianSpecs = new (string Title, string Focus)[]
        {
            ("Network Analyst", "network"), ("Network Analyst", "network"),
            ("Telecommunications Technician", "network"), ("Telecommunications Technician", "network"),
            ("Desktop Support Technician", "desktop"), ("Desktop Support Technician", "desktop"), ("Desktop Support Technician", "desktop"),
            ("Service Desk Lead", "desk")
        };

        var people = new List<Person>();
        var usedEmails = new HashSet<string>();
        Person NewPerson(int index, string department, string? title, bool tech)
        {
            var first = FirstNames[index % FirstNames.Length];
            var last = LastNames[(index * 7 + index / FirstNames.Length) % LastNames.Length];
            var email = $"{first}.{last}".ToLowerInvariant();
            var candidate = email;
            for (var n = 2; !usedEmails.Add(candidate); n++)
            {
                candidate = $"{email}{n}";
            }

            return new Person { FirstName = first, LastName = last, Email = $"{candidate}@{EmailDomain}", Department = department, JobTitle = title, IsTechnician = tech };
        }

        var technicians = new List<(Person Person, string Focus)>();
        for (var i = 0; i < technicianSpecs.Length; i++)
        {
            var p = NewPerson(i, "IT Services", technicianSpecs[i].Title, tech: true);
            technicians.Add((p, technicianSpecs[i].Focus));
            people.Add(p);
        }

        var staff = new List<Person>();
        var staffTitles = new[] { "Coordinator", "Analyst", "Specialist", "Associate Director", "Lecturer", "Professor", "Office Coordinator", "Advisor" };
        for (var i = 0; i < 52; i++)
        {
            var dept = Departments[i % Departments.Length];
            var p = NewPerson(i + technicianSpecs.Length, dept, staffTitles[rng.Next(staffTitles.Length)], tech: false);
            staff.Add(p);
            people.Add(p);
        }

        db.People.AddRange(people);

        var officeOf = new Dictionary<Person, Location>();
        foreach (var p in people)
        {
            officeOf[p] = p.IsTechnician ? workroom : offices[rng.Next(offices.Count)];
        }

        await db.SaveChangesAsync(ct);

        // ---- Switches, ports and jacks ----
        var switchSpecs = new (string Name, string Building, int ClosetIndex, int Ports, string Ip)[]
        {
            ("ADM-IDF1-SW01", "ADM", 0, 24, "10.20.10.2"),
            ("LIB-IDF1-SW01", "LIB", 0, 48, "10.20.20.2"),
            ("LIB-IDF3-SW01", "LIB", 1, 24, "10.20.20.3"),
            ("SCI-IDF1-SW01", "SCI", 0, 48, "10.20.30.2"),
            ("ENG-IDF1-SW01", "ENG", 0, 48, "10.20.40.2"),
            ("STU-IDF1-SW01", "STU", 0, 24, "10.20.50.2")
        };

        var switches = new List<NetworkSwitch>();
        foreach (var s in switchSpecs)
        {
            var sw = new NetworkSwitch
            {
                Name = s.Name,
                Model = s.Ports == 48 ? "OmniSwitch 6860E-P48" : "OmniSwitch 6860E-P24",
                ManagementIp = s.Ip,
                Location = closets[s.Building][s.ClosetIndex]
            };
            for (var n = 1; n <= s.Ports; n++)
            {
                sw.Ports.Add(new SwitchPort { PortNumber = n, PortName = NetworkRules.PortName(n), AdminStatus = PortAdminStatus.Disabled });
            }

            // The last port on every switch is the uplink to the core.
            var uplink = sw.Ports[^1];
            uplink.Role = PortRole.Uplink;
            uplink.AdminStatus = PortAdminStatus.Enabled;
            uplink.VlanId = 99;
            uplink.Description = "Uplink to core";
            switches.Add(sw);
        }

        db.NetworkSwitches.AddRange(switches);

        var jacks = new List<NetworkJack>();
        var freePorts = switches.ToDictionary(s => s, s => new Queue<SwitchPort>(s.Ports.Take(s.Ports.Count - 1)));
        foreach (var room in allRooms)
        {
            var jackCount = 2 + rng.Next(0, 3);
            for (var k = 0; k < jackCount; k++)
            {
                var letter = (char)('A' + k);
                var type = letter == 'C' ? JackType.Voice : JackType.Data;
                var jack = new NetworkJack
                {
                    Label = $"{room.Floor}-{room.Room}{letter}",
                    Location = room,
                    JackType = type,
                    Status = JackStatus.Inactive
                };

                var sw = SwitchFor(room, switches);
                var shouldPatch = rng.NextDouble() < 0.68;
                if (shouldPatch && freePorts[sw].Count > 0)
                {
                    var port = freePorts[sw].Dequeue();
                    jack.SwitchPort = port;
                    var active = rng.NextDouble() < 0.9;
                    port.VlanId = type == JackType.Voice ? 20
                        : room.Description is "Computer lab" or "Public computer area" ? 30
                        : k == 3 ? 40
                        : 10;
                    port.AdminStatus = active ? PortAdminStatus.Enabled : PortAdminStatus.Disabled;
                    port.Description = $"{room.BuildingCode} {room.Room} jack {jack.Label}";
                    jack.Status = active ? JackStatus.Active : JackStatus.Inactive;
                }
                else if (rng.NextDouble() < 0.12)
                {
                    jack.Status = JackStatus.Faulty;
                    jack.Notes = "Failed cable test. Needs re-termination.";
                }

                jacks.Add(jack);
            }
        }

        db.NetworkJacks.AddRange(jacks);
        await db.SaveChangesAsync(ct);

        // ---- Assets and assignment history ----
        var assets = new List<Asset>();
        var usedSerials = new HashSet<string>();
        var tagNumber = 100001;
        var deployable = staff.Concat(technicians.Select(t => t.Person)).ToList();

        foreach (var spec in AssetTypes)
        {
            for (var i = 0; i < spec.Count; i++)
            {
                var model = spec.Models[rng.Next(spec.Models.Length)];
                var ageDays = rng.Next(20, 6 * 365);
                var purchase = today.AddDays(-ageDays);
                var warrantyEnd = purchase.AddYears(spec.WarrantyYears);

                var roll = rng.NextDouble();
                var status = ageDays > 4 * 365 && roll < 0.45 ? AssetStatus.Retired
                    : roll < 0.72 ? AssetStatus.Deployed
                    : roll < 0.87 ? AssetStatus.InStock
                    : roll < 0.94 ? AssetStatus.InRepair
                    : AssetStatus.Retired;

                string serial;
                do
                {
                    serial = spec.SerialPrefix + RandomAlphaNumeric(rng, 8);
                }
                while (!usedSerials.Add(serial));

                var asset = new Asset
                {
                    AssetTag = $"ACC-{tagNumber++}",
                    AssetType = spec.Type,
                    Manufacturer = model.Manufacturer,
                    Model = model.Model,
                    SerialNumber = serial,
                    Status = status,
                    PurchaseDate = purchase,
                    WarrantyEndDate = warrantyEnd,
                    Version = 1
                };

                var received = purchase.ToDateTime(new TimeOnly(16, 0), DateTimeKind.Utc);
                asset.CreatedAt = received;
                asset.History.Add(new AssetHistory { ChangedAt = received, ToStatus = nameof(AssetStatus.InStock), ToLocation = storage.DisplayName, Note = "Received into IT storage" });

                Person? holder = null;
                Location? place = null;
                if (status != AssetStatus.InStock)
                {
                    // Every asset that left storage was deployed at least once.
                    (holder, place) = PickDeployment(spec.Type, rng, deployable, officeOf, labs, allRooms);
                    var deployedAt = received.AddDays(rng.Next(2, 15)).AddHours(rng.Next(0, 6));
                    asset.History.Add(new AssetHistory
                    {
                        ChangedAt = deployedAt,
                        FromStatus = nameof(AssetStatus.InStock),
                        ToStatus = nameof(AssetStatus.Deployed),
                        FromLocation = storage.DisplayName,
                        ToLocation = place.DisplayName,
                        ToAssignee = holder?.FullName,
                        Note = "Initial deployment"
                    });

                    var last = deployedAt;
                    if (holder is not null && status == AssetStatus.Deployed && ageDays > 400 && rng.NextDouble() < 0.3)
                    {
                        var (newHolder, newPlace) = PickDeployment(spec.Type, rng, deployable, officeOf, labs, allRooms);
                        last = last.AddDays(rng.Next(60, Math.Max(61, ageDays - 30)));
                        if (last > now.AddDays(-1)) last = now.AddDays(-1);
                        asset.History.Add(new AssetHistory
                        {
                            ChangedAt = last,
                            FromStatus = nameof(AssetStatus.Deployed),
                            ToStatus = nameof(AssetStatus.Deployed),
                            FromAssignee = holder.FullName,
                            ToAssignee = newHolder?.FullName,
                            FromLocation = place.DisplayName,
                            ToLocation = newPlace.DisplayName,
                            Note = "Reassigned after staff change"
                        });
                        holder = newHolder;
                        place = newPlace;
                    }

                    if (status is AssetStatus.InRepair or AssetStatus.Retired)
                    {
                        var changedAt = status == AssetStatus.InRepair
                            ? now.AddDays(-rng.Next(1, 20)).AddHours(-rng.Next(1, 8))
                            : last.AddDays(rng.Next(30, Math.Max(31, (int)(now - last).TotalDays)));
                        if (changedAt <= last) changedAt = last.AddHours(2);
                        if (changedAt > now) changedAt = now.AddHours(-3);
                        var target = status == AssetStatus.InRepair ? workroom : (rng.NextDouble() < 0.5 ? storage : null);
                        asset.History.Add(new AssetHistory
                        {
                            ChangedAt = changedAt,
                            FromStatus = nameof(AssetStatus.Deployed),
                            ToStatus = status.ToString(),
                            FromAssignee = holder?.FullName,
                            FromLocation = place.DisplayName,
                            ToLocation = target?.DisplayName,
                            Note = status == AssetStatus.InRepair ? "Sent to repair bench" : "End of life. Data wiped and sent to e-waste."
                        });
                        holder = null;
                        place = target;
                    }
                }
                else
                {
                    place = storage;
                }

                asset.AssignedTo = status == AssetStatus.Deployed ? holder : null;
                asset.Location = place;
                asset.UpdatedAt = asset.History.Max(h => h.ChangedAt);
                assets.Add(asset);
            }
        }

        db.Assets.AddRange(assets);
        await db.SaveChangesAsync(ct);

        // ---- Service requests ----
        SeedServiceRequests(db, rng, now, staff, technicians, assets, jacks, officeOf);
        await db.SaveChangesAsync(ct);
    }

    private static NetworkSwitch SwitchFor(Location room, List<NetworkSwitch> switches)
    {
        if (room.BuildingCode == "LIB")
        {
            return switches.First(s => s.Name == (room.Floor >= 3 ? "LIB-IDF3-SW01" : "LIB-IDF1-SW01"));
        }

        return switches.First(s => s.Name.StartsWith(room.BuildingCode + "-", StringComparison.Ordinal));
    }

    private static (Person? Holder, Location Place) PickDeployment(
        AssetType type, Random rng, List<Person> people, Dictionary<Person, Location> officeOf, List<Location> labs, List<Location> rooms)
    {
        switch (type)
        {
            case AssetType.Laptop:
            case AssetType.Tablet:
            case AssetType.VoipPhone:
            {
                var p = people[rng.Next(people.Count)];
                return (p, officeOf[p]);
            }
            case AssetType.Desktop:
            case AssetType.Monitor:
                if (rng.NextDouble() < 0.4)
                {
                    return (null, labs[rng.Next(labs.Count)]);
                }

                var person = people[rng.Next(people.Count)];
                return (person, officeOf[person]);
            default:
                return (null, rooms[rng.Next(rooms.Count)]);
        }
    }

    private static string RandomAlphaNumeric(Random rng, int length)
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var buffer = new char[length];
        for (var i = 0; i < length; i++)
        {
            buffer[i] = chars[rng.Next(chars.Length)];
        }

        return new string(buffer);
    }

    private sealed record TicketTemplate(TicketCategory Category, string Title, string Description, bool UsesJack, bool UsesAsset);

    private static readonly TicketTemplate[] Templates =
    [
        new(TicketCategory.JackActivation, "Activate data jack {jack} in {room}", "New staff member starting in {room}. Please activate wall jack {jack} for a wired desktop on the staff data VLAN.", true, false),
        new(TicketCategory.JackActivation, "Activate jack {jack} for office move", "{requester} is moving into {room}. Jack {jack} needs to be patched and activated before the move date.", true, false),
        new(TicketCategory.JackActivation, "Voice jack {jack} needed for new phone", "A VoIP desk phone is being installed in {room}. Please activate {jack} on the voice VLAN.", true, false),
        new(TicketCategory.Network, "No link light on jack {jack}", "The computer plugged into {jack} in {room} shows no network connection. Cable has been swapped already.", true, false),
        new(TicketCategory.Network, "Intermittent network drops in {room}", "Users in {room} lose their wired connection several times a day, usually for a minute or two. Jack {jack} is one of the affected ports.", true, false),
        new(TicketCategory.Telephone, "Desk phone shows No Service ({jack})", "The phone on jack {jack} in {room} boots but shows No Service. It worked yesterday.", true, false),
        new(TicketCategory.Telephone, "Move phone extension to jack {jack}", "Please move the extension for {requester} to the voice jack {jack} in {room}.", true, false),
        new(TicketCategory.Hardware, "{asset} will not power on", "Device {asset} does not turn on even when plugged in. No lights on the power button.", false, true),
        new(TicketCategory.Hardware, "Display flickering on {asset}", "The screen on {asset} flickers and sometimes goes black for a few seconds.", false, true),
        new(TicketCategory.Hardware, "Printer {asset} shows repeated jam errors", "{asset} reports a paper jam after every few pages even though no paper is stuck.", false, true),
        new(TicketCategory.Software, "Install statistics software on {asset}", "Please install the licensed statistics package on {asset} for the upcoming semester.", false, true),
        new(TicketCategory.Software, "Email client crashes on start ({asset})", "The email client on {asset} closes immediately after opening. Restarting did not help.", false, true),
        new(TicketCategory.AccountAccess, "Shared drive access for {dept}", "{requester} needs read/write access to the {dept} shared folder.", false, false),
        new(TicketCategory.AccountAccess, "Reset MFA device for {requester}", "{requester} replaced their phone and can no longer approve sign-in prompts.", false, false),
        new(TicketCategory.Other, "Projector setup for event in {room}", "Event in {room} next week. Need a projector and a laptop connection tested beforehand.", false, false)
    ];

    private static void SeedServiceRequests(
        AppDbContext db,
        Random rng,
        DateTime now,
        List<Person> staff,
        List<(Person Person, string Focus)> technicians,
        List<Asset> assets,
        List<NetworkJack> jacks,
        Dictionary<Person, Location> officeOf)
    {
        var finalStatuses = new List<TicketStatus>();
        void AddStatus(TicketStatus s, int count) => finalStatuses.AddRange(Enumerable.Repeat(s, count));
        AddStatus(TicketStatus.New, 10);
        AddStatus(TicketStatus.Assigned, 12);
        AddStatus(TicketStatus.InProgress, 15);
        AddStatus(TicketStatus.Reopened, 6);
        AddStatus(TicketStatus.Resolved, 17);
        AddStatus(TicketStatus.Closed, TicketCount - finalStatuses.Count);

        // Fisher-Yates shuffle with the seeded generator so the order is repeatable.
        for (var i = finalStatuses.Count - 1; i > 0; i--)
        {
            var j = rng.Next(i + 1);
            (finalStatuses[i], finalStatuses[j]) = (finalStatuses[j], finalStatuses[i]);
        }

        var deskLead = technicians.First(t => t.Focus == "desk").Person;
        var activeAssets = assets.Where(a => a.Status != AssetStatus.Retired).ToList();
        var requests = new List<ServiceRequest>();

        foreach (var final in finalStatuses)
        {
            var template = Templates[rng.Next(Templates.Length)];
            var requester = staff[rng.Next(staff.Count)];
            var priorityRoll = rng.NextDouble();
            var priority = priorityRoll < 0.05 ? TicketPriority.P1
                : priorityRoll < 0.25 ? TicketPriority.P2
                : priorityRoll < 0.75 ? TicketPriority.P3
                : TicketPriority.P4;

            NetworkJack? jack = null;
            Asset? asset = null;
            if (template.UsesJack)
            {
                var wantActive = TicketWorkflow.IsOpen(final) ? template.Category != TicketCategory.JackActivation : true;
                var pool = jacks.Where(j => j.Status == (wantActive ? JackStatus.Active : JackStatus.Inactive)
                    && (template.Category != TicketCategory.Telephone || j.JackType == JackType.Voice)).ToList();
                if (pool.Count == 0) pool = jacks;
                jack = pool[rng.Next(pool.Count)];
            }

            if (template.UsesAsset)
            {
                var pool = template.Title.Contains("Printer") ? activeAssets.Where(a => a.AssetType == AssetType.Printer).ToList()
                    : template.Category == TicketCategory.Software ? activeAssets.Where(a => a.AssetType is AssetType.Laptop or AssetType.Desktop).ToList()
                    : activeAssets;
                asset = pool[rng.Next(pool.Count)];
            }

            var room = jack?.Location ?? asset?.Location ?? officeOf[requester];
            string Fill(string text) => text
                .Replace("{jack}", jack?.Label ?? "")
                .Replace("{room}", room.DisplayName)
                .Replace("{asset}", asset?.AssetTag ?? "")
                .Replace("{requester}", requester.FullName)
                .Replace("{dept}", requester.Department);

            var focus = template.Category switch
            {
                TicketCategory.JackActivation or TicketCategory.Network or TicketCategory.Telephone => "network",
                TicketCategory.AccountAccess => rng.NextDouble() < 0.5 ? "desk" : "desktop",
                _ => "desktop"
            };
            var candidates = technicians.Where(t => t.Focus == focus).Select(t => t.Person).ToList();
            var assignee = candidates[rng.Next(candidates.Count)];

            // Build the lifecycle as a list of steps with durations, then place the whole thing
            // in the past so the last step always happens before "now".
            var steps = new List<(TicketStatus To, double Hours, string? Note)>();
            var resolveHours = priority switch
            {
                TicketPriority.P1 => 1 + rng.NextDouble() * 5,
                TicketPriority.P2 => 4 + rng.NextDouble() * 20,
                TicketPriority.P3 => 8 + rng.NextDouble() * 88,
                _ => 24 + rng.NextDouble() * 144
            };
            var resolution = template.Category switch
            {
                TicketCategory.JackActivation => $"Patched {jack?.Label} to the switch, set the VLAN and enabled the port. Link confirmed with the user.",
                TicketCategory.Network => "Re-terminated the cable at the wall plate and cleared errors on the switch port. Connection stable.",
                TicketCategory.Telephone => "Moved the phone to the voice VLAN and re-provisioned the extension. Dial tone confirmed.",
                TicketCategory.Hardware => "Replaced the faulty part and tested the device with the user.",
                TicketCategory.Software => "Installed and licensed the application. User confirmed it opens correctly.",
                TicketCategory.AccountAccess => "Access updated and confirmed with the requester.",
                _ => "Completed as requested."
            };

            if (final != TicketStatus.New)
            {
                steps.Add((TicketStatus.Assigned, 0.2 + rng.NextDouble() * 5, null));
            }

            if (final is TicketStatus.InProgress or TicketStatus.Resolved or TicketStatus.Closed or TicketStatus.Reopened)
            {
                steps.Add((TicketStatus.InProgress, 0.5 + rng.NextDouble() * 12, null));
            }

            if (final is TicketStatus.Resolved or TicketStatus.Closed or TicketStatus.Reopened)
            {
                steps.Add((TicketStatus.Resolved, resolveHours, resolution));
            }

            if (final == TicketStatus.Reopened)
            {
                steps.Add((TicketStatus.Reopened, 2 + rng.NextDouble() * 30, "User reports the problem came back the next morning."));
            }

            if (final == TicketStatus.Closed)
            {
                steps.Add((TicketStatus.Closed, 24 + rng.NextDouble() * 48, "Closed after the confirmation period with no further issues."));
            }

            var lifecycleHours = steps.Sum(s => s.Hours);
            var idleHours = final switch
            {
                TicketStatus.New => 0.2 + rng.NextDouble() * 70,
                TicketStatus.Assigned => rng.NextDouble() * 9 * 24,
                TicketStatus.InProgress => 6 + rng.NextDouble() * 35 * 24,
                TicketStatus.Reopened => 6 + rng.NextDouble() * 20 * 24,
                TicketStatus.Resolved => 1 + rng.NextDouble() * 40,
                _ => 12 + rng.NextDouble() * 100 * 24
            };

            var created = now.AddHours(-(lifecycleHours + idleHours));
            var request = new ServiceRequest
            {
                Title = Truncate(Fill(template.Title), 120),
                Description = Fill(template.Description),
                Category = template.Category,
                Priority = priority,
                Status = TicketStatus.New,
                Requester = requester,
                RelatedJack = jack,
                RelatedAsset = asset,
                CreatedAt = created,
                Version = 1
            };
            request.Events.Add(new TicketEvent
            {
                EventType = TicketEventType.Created,
                CreatedAt = created,
                ActorId = requester.Id,
                ActorName = requester.FullName,
                ToStatus = nameof(TicketStatus.New),
                Text = $"Request opened for {requester.FullName} with priority {priority}."
            });

            var t = created;
            foreach (var step in steps)
            {
                t = t.AddHours(step.Hours);
                if (step.To == TicketStatus.Assigned)
                {
                    request.Events.Add(new TicketEvent { EventType = TicketEventType.Assigned, CreatedAt = t, ActorId = deskLead.Id, ActorName = deskLead.FullName, ToAssignee = assignee.FullName });
                    request.Assignee = assignee;
                }

                var actor = step.To is TicketStatus.Assigned ? deskLead : step.To == TicketStatus.Reopened ? requester : assignee;
                request.Events.Add(new TicketEvent
                {
                    EventType = TicketEventType.StatusChanged,
                    CreatedAt = t,
                    ActorId = actor.Id,
                    ActorName = actor.FullName,
                    FromStatus = request.Status.ToString(),
                    ToStatus = step.To.ToString(),
                    Text = step.Note
                });

                request.Status = step.To;
                request.Version++;
                switch (step.To)
                {
                    case TicketStatus.Resolved:
                        request.ResolvedAt = t;
                        request.ResolutionNotes = step.Note;
                        break;
                    case TicketStatus.Reopened:
                        request.ResolvedAt = null;
                        break;
                    case TicketStatus.Closed:
                        request.ClosedAt = t;
                        break;
                }
            }

            if (request.Assignee is not null && rng.NextDouble() < 0.45)
            {
                var commentAt = created.AddHours((t - created).TotalHours * rng.NextDouble());
                request.Events.Add(new TicketEvent
                {
                    EventType = TicketEventType.Comment,
                    CreatedAt = commentAt,
                    ActorId = request.Assignee.Id,
                    ActorName = request.Assignee.FullName,
                    Text = template.UsesJack
                        ? $"Traced {jack?.Label} back to the patch panel in the IDF. Checking the switch port next."
                        : "Contacted the user to schedule a time to look at this."
                });
            }

            request.UpdatedAt = request.Events.Max(e => e.CreatedAt);
            requests.Add(request);
        }

        db.ServiceRequests.AddRange(requests);
    }

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];
}
