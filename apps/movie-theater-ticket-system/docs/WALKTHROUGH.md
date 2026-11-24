# Walkthrough

This document follows one booking from start to finish, explains the main design decisions, and ends with interview-style questions and answers about the project.

The project is an expanded portfolio rebuild, as a web application, of Nathanael Haig's academic C# desktop project. It is not the original coursework submission.

## 1. The booking flow, end to end

### Browse

1. The home page calls `GET /api/showtimes` (or `?date=yyyy-MM-dd` once a day is picked). `CatalogService.GetShowtimesAsync` loads that theater-local day's screenings that have not started yet, for active movies only, with each screening's capacity and seats left (sold tickets plus active holds, counted with `GROUP BY` queries). Without a date it picks the first day in the 7-day window that still has an upcoming screening, using the theater's time zone, so a late-evening visitor lands on tomorrow. The response's `date` tells the client which day was chosen, and `dates[0]` is always today.
2. Times come back twice: `startsAtUtc` (an exact instant) and `startsAtLocal` (theater wall-clock time with no offset, such as `2026-12-01T19:30:00`). The client displays the local value as-is, so a visitor in another time zone still sees the theater's schedule.

### Pick seats

3. The seat page calls `GET /api/screenings/{id}`, which returns the auditorium layout (rows, seat numbers, aisles) and every seat's status: `Available`, `Held`, or `Sold`.
4. The page opens a SignalR connection to `/hubs/seats` and calls `JoinScreening(id)`, which puts the connection in a group named `screening-{id}`.
5. Clicking a seat calls `POST /api/carts/{cartToken}/holds`. The cart token is a random 128-bit value from `POST /api/carts`. `CartService.HoldSeatAsync` then:
   - opens a write transaction (`BEGIN IMMEDIATE`);
   - checks that sales are open and that the seat belongs to this auditorium;
   - deletes expired holds on that seat and in this cart;
   - rejects the request if the cart holds seats for another showtime, is at the 10-seat limit, or the seat is sold or held by someone else (409);
   - inserts the hold. All seats in a cart share the expiry time set by the first seat, 10 minutes later;
   - commits, then broadcasts `SeatsChanged { seatId, status: Held }` to the screening's group.
6. Everyone else viewing that showtime sees the seat change to "held" immediately. The browser that holds it shows it as "selected by you", because the cart lists its own holds.

### Cart and quote

7. The cart page lets the customer pick a ticket type per seat and add concessions. Each change calls `POST /api/orders/quote` with only ids, ticket types, and quantities. `OrderService.QuoteAsync` loads the seats and menu items from the database and runs `PriceCalculator.Quote`.
8. A countdown shows how long the hold lasts. When it reaches zero, the client asks the server for the cart again. The server already treats those holds as expired.

### Checkout (simulated)

9. `POST /api/orders` sends the cart token, name, email, ticket choices, and concessions. There are no card fields. `OrderService.CheckoutAsync`, inside one write transaction:
   - returns the existing order if this cart was already checked out (idempotency);
   - requires the requested seats to be exactly the cart's unexpired holds (409 `hold-expired` or `cart-changed` otherwise);
   - prices everything on the server;
   - if the demo "simulate decline" box was ticked, stops with 402, leaving the seats held;
   - creates the order with a random order number (`MT-` plus 8 characters) and a `SIM-` payment reference, inserts the tickets, and deletes the holds;
   - commits, then broadcasts `Sold` for each seat.
10. The confirmation page shows the order, which the client keeps in session storage for that tab.

### History and cancellation

11. `POST /api/orders/history` takes an order number and email. If that pair matches, it returns every order for that email. If it doesn't, the response is the same 404 whether or not the email exists, so the endpoint can't be used to check which emails have orders. It is rate-limited.
12. `POST /api/orders/{orderNumber}/cancel` checks the email, refuses if the order is already cancelled or the screening starts within 30 minutes, then marks the order and its tickets cancelled, records a simulated refund, and broadcasts `Available` for the seats. The partial unique index on active tickets lets those seats be sold again.

### Admin

13. `POST /api/admin/auth/login` compares the username and password with the configured demo admin, using SHA-256 hashes compared in constant time. On success it issues an HttpOnly, SameSite=Strict cookie. Every `/api/admin/*` endpoint requires that cookie through an authorization policy and returns 401 without it.
14. Scheduling a screening checks for overlaps in that auditorium inside a write transaction: the room is busy from the start time until runtime plus a 20-minute cleaning break. The matinee flag is set from the theater-local start time.

## 2. Key design decisions

| Decision | Why | Trade-off |
| --- | --- | --- |
| Seat holds as their own table with a unique index | Lets the database refuse duplicate holds; expiry is just a column | Needs a cleanup job, though queries ignore expired rows anyway |
| Partial unique index on active tickets | One active sale per seat, while cancelled tickets stay as history | Relies on SQLite partial indexes (supported since 3.8) |
| Prices computed only on the server | The browser can't be trusted with money | One extra round trip for quotes |
| Integer cents | No floating-point errors, and SQL `SUM` works in SQLite | Formatting happens in the client |
| One process serves the API, SignalR, and the built React app | One command, one port, no CORS setup | The client must be rebuilt before `dotnet run` shows changes (or use the Vite dev server) |
| SignalR for pushes, REST for changes | The database stays the single source of truth; pushes are hints | Missed pushes need a resync, handled on reconnect and by polling while offline |
| Cookie auth for a single demo admin | Built into ASP.NET Core; HttpOnly cookies can't be read by scripts | Not a user system; a real one would use ASP.NET Core Identity or an identity provider |
| SQLite | Zero setup for reviewers, real SQL, transactions, indexes | One writer at a time; a multi-server deployment would move to PostgreSQL or SQL Server |
| Fake clock (`TimeProvider`) in tests | Hold expiry and cancellation cutoffs can be tested to the second | Code must read time from the injected clock, never `DateTime.Now` |
| Order lookup by order number + email (no accounts) | Matches a theater kiosk flow and keeps the demo simple | Anyone with both values can see the order, so the endpoint is rate-limited |

## 3. Interview questions and answers

**1. How do you stop two people from buying the same seat?**
Two layers. First, the hold and checkout code runs in write transactions, so requests for the same seat are processed one at a time and the second one sees the first. Second, unique indexes on `SeatHolds (ScreeningId, SeatId)` and on active `Tickets (ScreeningId, SeatId)` make the database reject a duplicate even if the code had a bug. Any rejection becomes a 409 Conflict. A test sends 12 requests at the same moment and checks that exactly one wins.

**2. What is a race condition, and where could one happen here?**
It's a bug where the result depends on the timing of two operations. The classic one here is "check whether the seat is free, then insert the hold": two requests can both pass the check before either inserts. Transactions remove that gap, and the unique index catches anything left.

**3. Why is the ticket index "partial"?**
A plain unique index on `(ScreeningId, SeatId)` would stop a seat from ever being sold again after a cancellation. The partial index only covers rows `WHERE IsCancelled = 0`, so there can be one active ticket per seat plus any number of cancelled ones kept for history and reporting.

**4. Why are prices calculated on the server?**
Anything the browser sends can be changed with developer tools or a script. The server loads seat types and menu prices from the database and runs the pricing rules itself; any price in the request is ignored. A test sends a ticket "priced" at one cent and checks the order still costs the real amount.

**5. What does SignalR do, and why not just poll?**
SignalR keeps a connection open (WebSockets when possible) so the server can push "seat 113 is now held" the moment it happens. Polling every few seconds would be slower and would send many requests that usually return nothing. The app still falls back to polling every 15 seconds while the live connection is down, and reloads the seat map after reconnecting because messages sent while offline aren't replayed.

**6. What happens when a hold expires?**
Each hold has an `ExpiresAtUtc`. Every query only counts holds that haven't expired, so the seat looks free immediately. A background service deletes expired holds every 30 seconds and broadcasts that those seats are available. Checkout rejects expired holds with 409.

**7. How does the cookie authentication protect the admin routes?**
After a successful login the server issues an encrypted, signed cookie marked HttpOnly (JavaScript can't read it) and SameSite=Strict (the browser won't send it from other sites, which blocks cross-site request forgery). The admin controllers have `[Authorize(Policy = "Admin")]`, so ASP.NET Core checks the cookie before any admin code runs. Requests without it get 401 rather than a redirect, which is what an API should return.

**8. Isn't the admin password in a config file a security problem?**
It's a local demo credential and is documented that way. It lives in `appsettings.Development.json`, which is only loaded in Development and is excluded from published builds. In hosted mode the password must come from an environment variable or secret settings, and if none is set, admin sign-in is turned off. The comparison uses fixed-time hashing and the endpoint is rate-limited. A real system would store hashed passwords with ASP.NET Core Identity.

**9. What are EF Core migrations, and why commit them?**
A migration is a C# file, written by the EF Core command-line tool, that describes a schema change (create a table, add an index). Committing them means every environment builds the same schema in the same order, and the history of the schema is reviewable. The app applies pending migrations at startup with `Database.MigrateAsync()`, and the integration tests run against databases created by those same migrations.

**10. How is checkout made safe to retry?**
The order table has a unique `CartToken`. If the same cart is submitted again (double click, network retry), the server finds the existing order and returns it with 200 instead of creating another. A test sends five copies at once and checks that only one order exists.

**11. How do you test time-based rules like a 10-minute hold?**
The app gets the time from an injected `TimeProvider`. Tests replace it with `FakeTimeProvider`, so they can move the clock forward 9 minutes 59 seconds (seat still held) and then 1 more second (seat free) without waiting.

**12. How do you keep screenings from overlapping?**
An auditorium is busy from a screening's start until runtime plus a cleaning buffer. Two screenings conflict if their busy intervals overlap, using half-open intervals so one can start exactly when the previous one is clear. The check runs in a write transaction so two admins can't create conflicting screenings at once. Changing a movie's runtime re-checks all of its upcoming screenings.

**13. What do API errors look like?**
They use the ProblemDetails format (RFC 9457): `status`, `title`, `detail`, plus a `code` such as `seat-unavailable` that the client can act on. Validation errors from `[ApiController]` include an `errors` object keyed by field name. Unexpected exceptions return a generic 500 without stack traces.

**14. How is the seat map accessible?**
Each seat is a real `<button>` with a label like "Row C seat 7, premium, available" and `aria-pressed` for selected seats. Only one seat is in the tab order. Arrow keys, Home, and End move focus, and Enter or Space selects. Unavailable seats use `aria-disabled` so screen-reader users can still hear their status. Status is shown with icons and stripes, not just color, and animations turn off when the operating system asks for reduced motion.

**15. What would you change to support many more users?**
Move from SQLite to PostgreSQL or SQL Server, since SQLite allows one writer at a time. Run several app servers behind a load balancer and add a SignalR backplane (for example Redis or Azure SignalR Service) so pushes reach clients on every server. Cache the showtime listing, which changes rarely. The booking logic wouldn't change, because the unique indexes and transactions already enforce correctness in the database.

## Test and coverage results

Last full run (Windows 11, .NET SDK 10.0.404, Node 26.13.0):

| Suite | Result |
| --- | --- |
| Backend xUnit (`dotnet test MovieTheater.slnx`) | 136 passed, 0 failed (46 unit, 90 integration) |
| Backend coverage, hand-written code | 95.2% lines (1858/1951), 79.9% branches (275/344), Release build |
| Frontend Vitest (`npm test`) | 48 passed, 0 failed, in 10 files |
| Frontend coverage (`npm run test:coverage`) | 78.59% lines (793/1009), 73.07% branches (646/884), 77.04% statements, 74.24% functions |
| ESLint, TypeScript, production build | no errors |

The least-covered frontend files are the movie detail page (no tests yet, 0% of lines), the About page (16.7%), and the admin screenings (61.0%) and movies (65.2%) pages. They are the next candidates for tests.
