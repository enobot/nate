# Code walkthrough

This document follows one real request through the code, explains the main design decisions, and
ends with practice interview questions about this project.

## 1. One request, end to end: "Activate jack 2-214B"

A technician opens **Network > Jacks**, clicks **Activate** on an inactive jack, picks a free port on
`ENG-IDF1-SW01`, chooses VLAN 10 and submits.

### React (browser)

1. `client/src/pages/NetworkPage.tsx` renders the jacks table. The **Activate** button opens
   `ActivateJackDialog` (`client/src/components/NetworkDialogs.tsx`).
2. The dialog loads `api.switches.freePorts(id)` (`GET /api/switches/{id}/free-ports`), which returns
   only access ports with no jack. Uplink ports are never returned. If the list is empty, the dialog
   shows "No free access ports on ADM-IDF1-SW01" and disables the buttons. Otherwise it runs quick
   client checks (a port and a VLAN must be chosen) and then calls:

   ```ts
   api.jacks.activate(jack.id, portId, vlanId)
   // -> apiRequest('/api/jacks/49/activate', { method: 'POST', body: { switchPortId, vlanId } })
   ```

3. `client/src/api/client.ts` sends the JSON with `fetch`. If the response is not 2xx it reads the
   ProblemDetails body and throws an `ApiError` with `status`, `detail` and per-field `fieldErrors`.
   The dialog shows that error, or on success closes, shows a notice and reloads the table.

In development, the request goes to the Vite server on port 5202, which forwards `/api` to 5201. In
the demo and in Docker, the page and the API come from the same ASP.NET Core process.

### ASP.NET Core (server)

4. Middleware in `Program.cs` runs first: exception handler, status-code pages, rate limiter (writes
   only, outside Development), security headers, compression, static files.
5. Routing matches `POST api/jacks/{id:int}/activate` in `Controllers/NetworkControllers.cs`
   (`JacksController.Activate`). Because the class has `[ApiController]`, the body is bound to
   `ActivateJackRequest` and its DataAnnotations (`[Required]`, `[Range]`) are checked before the
   action runs. A failure returns 400 ProblemDetails automatically.
6. The controller only calls the service: `network.ActivateAsync(id, request, ct)`.

### Service and domain rules

7. `Services/NetworkService.ActivateAsync`:
   - loads the jack (404 if missing) and the port including any jack already on it (400 if the port id is unknown);
   - `NetworkRules.EnsureValidVlanId(vlanId)` (400 outside 1-4094) and checks the VLAN exists (400);
   - `NetworkRules.EnsureCanPatch(jack, port, port.Jack?.Id)` (409 if the port is an uplink, the jack
     is faulty or already on another port, or the port already has a different jack). The UI never
     offers an uplink, but the server still checks, because the API can be called directly;
   - sets `jack.SwitchPortId`, `port.VlanId`, `port.AdminStatus = Enabled`, `jack.Status = Active`;
   - `NetworkRules.EnsureCanBeActive(jack, port)` as a final check;
   - `SaveChangesAsync()`.
8. Rule violations are thrown as `BusinessRuleException` (400) or `ConflictException` (409).
   `Infrastructure/ProblemExceptionHandler.cs` turns them into ProblemDetails.

### EF Core and SQLite

9. `SaveChangesAsync` sends both UPDATE statements (jack and port) inside one transaction, so either
   both changes are saved or neither is.
10. If another request patched a jack to the same port a moment earlier, the filtered unique index
    `IX_NetworkJacks_SwitchPortId` rejects the write. SQLite reports a constraint error (code 19),
    and the exception handler returns 409 instead of 500.
11. The service reads the jack back through a LINQ projection (`JackProjection`) and the controller
    returns it as JSON with status 200.

The same shape (React page, `api` function, controller, service, rule class, EF Core) is used for
assets and service requests.

## 2. Key design decisions

**Controllers stay thin, services hold the logic, rules are pure functions.** The rule classes in
`Domain/Rules` take plain values and throw on a violation. They need no database, so the unit tests
call them directly. Services load data, call the rules and save.

**Exceptions for rule violations, mapped in one place.** Services throw `BusinessRuleException`,
`ConflictException` or `NotFoundException`, and one `IExceptionHandler` maps them to 400, 409 or 404.
The alternative (returning result objects from every method) is more explicit but adds code to every
call site. The trade-off is that exceptions are used for expected outcomes.

**Enums stored as text.** `ConfigureConventions` stores all enums as strings. It costs a little
space, but the SQL reports can say `WHERE Status = 'Deployed'`, and inserting a new enum value in the
middle cannot shift existing data the way integer storage could.

**UTC everywhere.** SQLite has no time zone type, so every `DateTime` is written as UTC and a value
converter marks values read back as UTC. JSON then ends in `Z` and the browser converts to local time.
`TimeProvider` is injected instead of calling `DateTime.UtcNow`, so tests can freeze the clock.

**Raw SQL only for reports.** CRUD uses LINQ. Reports use hand-written SQL because grouping with
date math is clearer in SQL, and the exact text can be shown to the user. Each query is a constant
string with `{0}` placeholders passed through `FormattableStringFactory.Create`, so EF Core sends the
values as parameters.

**Optimistic concurrency instead of locks.** A `Version` column is compared on every update. Nobody
holds a lock while a form is open, and a conflict is rare and reported clearly.

**Snapshots in history tables.** `AssetHistory` and `TicketEvent` store names as text, not only
foreign keys, so the audit trail stays readable after a person or room changes.

**The server decides which buttons to show.** Ticket responses include `allowedTransitions`, taken
from the same table the server enforces, so the UI never has its own copy of the workflow.

**One deployable unit.** The React build is served from `wwwroot` with a fallback to `index.html`
for client routes, and unknown `/api/*` paths return a JSON 404. One container, one origin, no CORS
in production.

**Self-initializing database.** On startup the app applies migrations and seeds an empty database.
That makes `dotnet run` work on a fresh clone and lets a container start on a host with no
persistent disk. For a larger production system, migrations would usually run as a separate
deployment step instead.

## 3. Interview questions and short answers

**1. Why use EF Core migrations instead of writing CREATE TABLE scripts?**
The schema comes from the C# model, and each change becomes a versioned migration file in source
control. `__EFMigrationsHistory` records what has been applied, so any database can be brought to the
current version with one command (`dotnet ef database update`) or at startup with `MigrateAsync()`.

**2. What does a unique index prevent that a check in C# does not?**
The C# check ("is this asset tag already used?") has a race: two requests can both see "no" and both
insert. The unique index is enforced by the database, so the second insert fails no matter what. The
code keeps both: the check for a friendly message, the index as the guarantee, and the constraint
error mapped to 409.

**3. How are ticket status changes enforced?**
`TicketWorkflow` has a dictionary from each status to the statuses allowed next. `EnsureTransition`
throws 409 for a move not in the table and 400 when a required assignee or note is missing. Every
status endpoint calls it on the server, and a unit test checks all 36 from/to pairs.

**4. Which HTTP status codes does the API use and why?**
200 for reads and updates, 201 with a `Location` header for creates, 204 for deletes, 400 for invalid
input, 404 for an unknown id, 409 when the request conflicts with current data (duplicates, invalid
transitions, stale versions, records still in use), 429 when the write limit is reached. Errors use
the RFC 9457 ProblemDetails format.

**5. What is the difference between the 400 and the 409 cases?**
400 means the request itself is wrong and would be wrong on any day (VLAN 5000, missing title). 409
means the request is well formed but clashes with the current state (that tag already exists, the
ticket is already closed, someone saved first).

**6. How would you move from SQLite to SQL Server or PostgreSQL?**
Install `Microsoft.EntityFrameworkCore.SqlServer` or `Npgsql.EntityFrameworkCore.PostgreSQL`, change
`UseSqlite` to `UseSqlServer` or `UseNpgsql`, update the connection string, and create a new initial
migration for that provider. Then port the report SQL (`julianday()` becomes `DATEDIFF` or interval
math) and the SQLite-specific error code in `ProblemExceptionHandler`. The entities, services and
LINQ queries stay the same.

**7. How do you stop SQL injection here?**
LINQ queries are translated to parameterized SQL by EF Core. The report queries are constants whose
values go in through `{0}` placeholders that become DbParameters. User input is never concatenated
into SQL. Search text also has LIKE wildcards (`%`, `_`) escaped so they match literally.

**8. What is optimistic concurrency and how does it work in this app?**
Each asset and ticket has a `Version`. The client sends the version it loaded. EF Core includes
`WHERE Version = @loaded` in the UPDATE and the code increments the version. If someone else saved in
between, zero rows match, EF Core throws `DbUpdateConcurrencyException`, and the API returns 409.

**9. Why validate in both React and ASP.NET Core?**
Browser validation gives instant feedback, but anyone can call the API directly, so the server must
be the authority. The server repeats every check, and the React forms display server field errors
next to the matching input.

**10. How do the integration tests work?**
`WebApplicationFactory<Program>` starts the real app in memory. Each test class gets its own
temporary SQLite file, the real migrations run at startup, a fixed `TimeProvider` freezes "now", and
a small dataset with hand-worked answers is inserted. Tests call the API over HTTP and check status
codes, ProblemDetails bodies and report numbers.

**11. Why does a port have at most one jack, and how is it enforced?**
Physically, one patch cable connects one wall jack to one switch port. The jack table has a single
nullable `SwitchPortId` column (so a jack can only reference one port) with a unique index filtered
to non-null values (so a port can be referenced by only one jack).

**11b. Why can't a jack be patched into an uplink port?**
The uplink connects the closet switch to the core network. Plugging a wall jack into it would take
every user on that switch offline. Each port has a `Role` (`Access` or `Uplink`, added by the
`AddSwitchPortRole` migration). `NetworkRules.EnsureCanPatch` rejects an uplink with 409, the
free-ports query only returns access ports, and the port edit endpoint will not disable an uplink
or change its VLAN. The migration also marked the uplinks in databases created before the column existed.

**12. What happens when the app starts on a host with no persistent disk?**
The database file does not exist. `MigrateAsync()` creates it and applies the migration, the seeder
sees no locations and loads the demo data, and the app is ready. Visitors' changes are lost on the
next restart, which is documented as acceptable for fictional demo data.

**13. Why is there no login, and what would you add?**
The goal was a local demo. Faking a login would be worse than being honest about it. For a real
deployment: ASP.NET Core authentication with an identity provider such as Microsoft Entra ID,
`[Authorize]` with roles on the controllers, the actor taken from the signed-in user instead of the
"Working as" picker, and per-user rate limits.

**14. How is the frontend tested without a real backend?**
Vitest renders the real page components in jsdom. Only the global `fetch` is replaced with a small
router that returns JSON or ProblemDetails. The real API client, validation and components all run,
so a test can prove that a 409 body ends up on screen.

**15. What would you measure before optimizing?**
Endpoint latency and payload size first. Here the API answered in about 6-11 ms on localhost, and the
biggest cost was the 366 KB JavaScript bundle, so compression and long-term caching of hashed files
came first. Next would be browser metrics (LCP and INP) on a real device, which have not been
measured yet.
