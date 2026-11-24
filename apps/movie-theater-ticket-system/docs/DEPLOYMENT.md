# Deployment notes

**Status: deployed on Render** at https://movie-theater-ticket-system.onrender.com, using the repository root's `render.yaml` Blueprint. The other hosting options below were not tried. Docker isn't installed on the development machine, so Render's build was the first build of the image.

## What was verified locally

These checks were run on Windows 11 with .NET SDK 10.0.404 and Node 26.13.0:

- `dotnet run --project src/MovieTheater.Api` builds the client on first run, applies migrations, seeds sample data, and serves the whole app at http://localhost:5301.
- Restarting keeps all data (SQLite file in `src/MovieTheater.Api/App_Data`).
- `-- --reset-database` deletes and recreates the database.
- A Release publish (`dotnet publish -c Release`) run with `ASPNETCORE_ENVIRONMENT=Production` and `PORT=5302`:
  - listened on `http://[::]:5302`;
  - created, migrated, and seeded a new database on an empty disk;
  - served the React app and the API;
  - returned 503 for admin sign-in because no password was configured (`appsettings.Development.json` is not included in published output);
  - accepted admin sign-in when `DemoAdmin__Password` was set as an environment variable.
- With no `PORT`, `ASPNETCORE_URLS`, or `ASPNETCORE_HTTP_PORTS` set, the published app listened on `http://localhost:5301`.
- SignalR pushes were received over WebSockets from the running server, both directly and through the Vite dev proxy.

## Configuration reference

All settings can be given as environment variables, with `__` (two underscores) in place of `:`.

| Setting | Environment variable | Default | Notes |
| --- | --- | --- | --- |
| Listening port | `PORT` | none | Set by most hosts. Overrides the others. |
| | `ASPNETCORE_HTTP_PORTS` | 8080 in the Docker image | Used when `PORT` is not set. |
| Environment | `ASPNETCORE_ENVIRONMENT` | `Production` | `Development` loads the local demo admin password. |
| Admin username | `DemoAdmin__Username` | `admin` | |
| Admin password | `DemoAdmin__Password` | empty, so sign-in is off | Use the host's secret settings. Never commit it. |
| Data folder | `Storage__DataDirectory` | `App_Data` | Point at a persistent volume to keep data across restarts. |
| Connection string | `ConnectionStrings__Theater` | SQLite file in the data folder | |
| Theater time zone | `Theater__TimeZone` | server's local zone | For example `America/Los_Angeles` (Linux) or `Pacific Standard Time` (Windows). Containers usually run in UTC, so set this when hosting. |
| Proxy headers | `ASPNETCORE_FORWARDEDHEADERS_ENABLED` | off | Set to `true` only when the app is behind the host's HTTPS proxy. |
| Pricing, holds, cutoffs | `Pricing__*`, `Booking__*` | see `appsettings.json` | |

## Data on hosts without a persistent disk

The app creates and seeds its SQLite database at startup whenever the file is missing. On hosts that give containers a temporary disk, this means:

- every restart, redeploy, or scale-to-zero wake-up starts from fresh sample data;
- orders placed by visitors disappear at that point;
- the sample week of showtimes always starts on the day the container started, so the demo never runs out of showtimes.

For a demo this is acceptable, and it should be mentioned wherever the live link is shared. To keep data, attach a persistent volume and set `Storage__DataDirectory` to its mount path, and run only one instance (SQLite is a single file and should not be shared between servers).

## Testing the Docker image

On a machine with Docker installed, from this folder:

```bash
docker build -t movie-theater-ticket-system .
docker run --rm -p 8080:8080 \
  -e DemoAdmin__Password=choose-a-password \
  -e Theater__TimeZone=America/Los_Angeles \
  movie-theater-ticket-system
```

Then open http://localhost:8080 and, on Windows, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/smoke-test.ps1 -BaseUrl http://localhost:8080 -AdminPassword choose-a-password
```

To check that the port setting works the way hosts use it:

```bash
docker run --rm -p 9000:9000 -e PORT=9000 movie-theater-ticket-system
```

Things to check while doing this for the first time:

- The build finishes (`npm ci` on Linux installs the Linux versions of the Vite and Tailwind native packages, which are listed in `client/package-lock.json`).
- The container logs show "Applying migration" and "Created sample data" on the first start.
- `GET /healthz` returns `Healthy`.
- If `Theater__TimeZone` is set, the app starts without a `TimeZoneNotFoundException` (the image needs time zone data for names like `America/Los_Angeles`).
- The seat map updates live between two browser windows.

## Hosting options (not done, unverified)

GitHub Pages can't run this app: it only serves static files, and this app needs a running ASP.NET Core server, a database, and long-lived SignalR connections.

Options that can run the Docker image or a .NET app. Check current pricing, free-tier limits, sleep/idle behavior, WebSocket support, and persistent disk options on each provider's own site before choosing:

- Render, Railway, or Fly.io (build from the Dockerfile; check whether the host sets `PORT` or asks you for the internal port, which is 8080 in this image).
- Google Cloud Run (sets `PORT`; WebSockets are supported but requests have time limits to check).
- Azure Container Apps or Azure App Service for Linux.
- A small virtual machine running Docker behind a reverse proxy such as Caddy or Nginx.

Typical steps on a Dockerfile-based host:

1. Point the service at the repository and set the root (build context) to this folder, for example `apps/movie-theater-ticket-system`.
2. Set `DemoAdmin__Password` as a secret, and `Theater__TimeZone`.
3. If the host terminates HTTPS in front of the app, set `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true`.
4. Use `/healthz` as the health check path.
5. After the first deploy, run the smoke test against the public URL.

## Render

The owner chose Render's free plan. It's deployed at https://movie-theater-ticket-system.onrender.com: `/healthz` returns `Healthy`, the home page picks the right day with `Theater__TimeZone=America/Los_Angeles`, and live seat updates work. Render's free plan puts the service to sleep after 15 minutes idle, the first visit after that takes about 50 seconds, and the demo data resets on every restart.

Service settings:

- **Runtime:** Docker, using the `Dockerfile` in this folder.
- **Build context:** this folder. The repository root's `render.yaml` Blueprint points Render at `apps/movie-theater-ticket-system/Dockerfile` with this folder as the Docker context.
- **Health check path:** `/healthz`. It needs no sign-in, does no database work, and returns `200` with the text `Healthy`.
- **Port:** Render provides a `PORT` variable (check this on the first deploy), and the app listens on it automatically. If Render asks for a port anyway, use the value it shows (the image's own default is 8080).

Environment variables:

| Variable | Needed? | What it does | Safe example value |
| --- | --- | --- | --- |
| `DemoAdmin__Password` | Yes, for the admin area | Turns on admin sign-in. Without it the admin login answers 503 and the rest of the app works normally. Store it as a secret, never in the repo. | `replace-with-a-long-random-passphrase` |
| `DemoAdmin__Username` | No | Admin username. Defaults to `admin`. | `admin` |
| `Theater__TimeZone` | Strongly recommended | The theater's time zone. It decides what "today" is, which showtimes count as matinees, the 7-day schedule, and the default day on the home page. Without it the app uses the server's own time zone, which on hosted containers is usually UTC. | `America/Los_Angeles` |
| `ASPNETCORE_FORWARDEDHEADERS_ENABLED` | Recommended on Render | Trusts the `X-Forwarded-Proto` and `X-Forwarded-For` headers from Render's HTTPS proxy, so the admin cookie is marked Secure and rate limits see each visitor's real IP. Only set it when the app is behind a proxy like Render's. | `true` |
| `ASPNETCORE_ENVIRONMENT` | Already set by the Dockerfile | Keeps the app in Production mode. Don't set it to `Development` on a host. | `Production` |
| `PORT` | Set by Render | Port to listen on. Don't set it yourself unless Render tells you to. | (provided by Render) |
| `Storage__DataDirectory` | Only with a persistent disk | Folder for the SQLite file and the cookie keys. Point it at the disk's mount path if you add one. | `/var/data/movie-theater` |
| `Booking__*`, `Pricing__*` | No | Override demo rules such as hold length or tax rate. Defaults are in `appsettings.json`. | `Booking__HoldMinutes=10`, `Pricing__SalesTaxRate=0.0775` |

What to expect on a free instance without a persistent disk:

- Every restart, redeploy, or wake-up after idling starts with fresh sample data, and any orders made by visitors are gone.
- The cookie signing keys are recreated too, so an admin who was signed in has to sign in again.
- The sample week always starts on the day the instance started, so the demo never runs out of showtimes.

After the first deploy, run the smoke test against the public address:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/smoke-test.ps1 -BaseUrl https://your-service.onrender.com -AdminPassword <the password you set>
```

## Using this folder inside a larger repository

The app does not assume it is at the repository root. Everything it needs (`global.json`, `nuget.config`, `MovieTheater.slnx`, the Dockerfile) is in this folder, and all paths are relative to it.

- Run commands from this folder (`cd apps/movie-theater-ticket-system`).
- GitHub only reads workflow files from the root `.github/workflows` folder, so this app's CI is `<repo root>/.github/workflows/movie-theater-ci.yml`. It uses `APP_DIR: apps/movie-theater-ticket-system` and path filters for this folder.
- A `.gitignore` in this folder covers build output, `node_modules`, the SQLite database, and the built `wwwroot`.

## Linking the project from the portfolio site

- Link to the folder on GitHub, for example `https://github.com/enobot/nate/tree/main/apps/movie-theater-ticket-system`, so the README is the first thing a reviewer sees.
- The portfolio's project page links to the live demo, this folder's source code, and the walkthrough.
- Add screenshots from `docs/screenshots/` and, if recorded, the demo video.
- Describe it as an expanded portfolio rebuild of the academic C# desktop project, not the original coursework.
