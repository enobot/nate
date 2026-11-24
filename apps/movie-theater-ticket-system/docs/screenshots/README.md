# Screenshots

Already captured (from a walkthrough of the local demo):

- `seat-map.jpg`
- `seat-held-countdown.jpg`
- `cart.jpg`
- `checkout-simulated.jpg`
- `order-confirmed.jpg`
- `order-lookup.jpg`
- `admin-sales-dashboard.jpg`

The full list below is the suggested set. Screens not covered by the files above still need to be captured. Capture them from the running local demo (`dotnet run --project src/MovieTheater.Api`, then http://localhost:5301) and save them in this folder with the file names below. Use a desktop window around 1440×900 unless noted, and only fictional sample data.

Start from fresh data first: `dotnet run --project src/MovieTheater.Api -- --reset-database`.

| File name | Screen | What should be visible |
| --- | --- | --- |
| `01-now-showing.png` | Home page (`/`) | Hero, the 7-day date strip, genre filter, and movie rows with showtime buttons (pick a date with several showtimes) |
| `02-movie-detail.png` | A movie page (`/movies/{id}`) | Poster art, synopsis, and the week's showtimes grouped by day |
| `03-seat-map.png` | Seat selection (`/screenings/{id}`) | Seat map with a few of your own selected seats, some sold seats, the legend, the "Live" indicator, and the hold countdown |
| `04-live-update.png` | Two browser windows side by side on the same showtime | A seat held in one window showing as held (striped) in the other |
| `05-cart.png` | Cart (`/cart`) | Ticket type choices, concessions with quantities, and the server-calculated summary with tax |
| `06-checkout.png` | Checkout (`/checkout`) | The "Simulated checkout — no real payment is processed" notice, the contact form, and the "Complete simulated payment" button |
| `07-checkout-validation.png` | Checkout with empty fields submitted | Inline error messages under the name and email fields |
| `08-confirmation.png` | Order confirmation | Ticket-stub order card with order number and totals |
| `09-order-history.png` | My Orders (`/orders`) | Lookup results for `MT-SEED0001` / `jordan.rivera@example.com`, including a cancelled order |
| `10-cancel-dialog.png` | My Orders, after clicking "Cancel order" | The confirmation dialog |
| `11-admin-login.png` | Admin sign-in (`/admin`) | The sign-in form (don't show a typed password) |
| `12-admin-dashboard.png` | Admin dashboard | Sales cards, sales by movie, concession sales, and upcoming occupancy bars |
| `13-admin-movies.png` | Admin movies, with the add form open | The form with the live poster preview |
| `14-admin-screening-conflict.png` | Admin screenings | The overlap error after trying to schedule a screening on top of another one |
| `15-admin-reservations.png` | Admin reservations | Search results with one order expanded |
| `16-mobile-seat-map.png` | Seat selection at phone width (about 390×844) | The seat map and selection panel on a small screen |
| `17-about.png` | About page | The "expanded portfolio rebuild" statement and credits |

After adding them, reference a few in the main README, for example:

```markdown
![Seat map](docs/screenshots/03-seat-map.png)
```
