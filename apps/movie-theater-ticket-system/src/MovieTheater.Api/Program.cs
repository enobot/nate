using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MovieTheater.Api.Data;
using MovieTheater.Api.Domain;
using MovieTheater.Api.Errors;
using MovieTheater.Api.Hubs;
using MovieTheater.Api.Infrastructure;
using MovieTheater.Api.Options;
using MovieTheater.Api.Services;

// `dotnet run -- --reset-database` deletes the SQLite file and recreates the sample data.
const string ResetFlag = "--reset-database";
var resetDatabase = args.Contains(ResetFlag);
var builder = WebApplication.CreateBuilder(args.Where(a => a != ResetFlag).ToArray());

// ---- Listening port ----
// Hosting platforms pass the port in a PORT environment variable. Locally, `dotnet run` uses the
// launch profile (http://localhost:5301). Any other explicit setting (ASPNETCORE_URLS, --urls,
// ASPNETCORE_HTTP_PORTS) is respected; with none of them, the app also defaults to port 5301.
var hostPort = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(hostPort))
{
    if (!int.TryParse(hostPort, out var port) || port is < 1 or > 65535)
    {
        throw new InvalidOperationException($"PORT must be a number from 1 to 65535, but it was '{hostPort}'.");
    }

    builder.WebHost.UseUrls($"http://+:{port}");
}
else if (string.IsNullOrEmpty(builder.Configuration["urls"])
    && string.IsNullOrEmpty(builder.Configuration["http_ports"])
    && string.IsNullOrEmpty(builder.Configuration["https_ports"]))
{
    builder.WebHost.UseUrls("http://localhost:5301");
}

// ---- Configuration (validated at startup so a bad setting fails fast) ----
AddValidatedOptions<PricingOptions>(PricingOptions.Section);
AddValidatedOptions<BookingOptions>(BookingOptions.Section);
AddValidatedOptions<TheaterOptions>(TheaterOptions.Section);
AddValidatedOptions<DemoAdminOptions>(DemoAdminOptions.Section);
AddValidatedOptions<RateLimitOptions>(RateLimitOptions.Section);
AddValidatedOptions<StorageOptions>(StorageOptions.Section);

// ---- Core services ----
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<TheaterClock>();
builder.Services.AddSingleton(sp => new PriceCalculator(sp.GetRequiredService<IOptions<PricingOptions>>().Value));
builder.Services.AddSingleton<DataPaths>();
builder.Services.AddDbContext<TheaterDbContext>((sp, options) =>
    options.UseSqlite(sp.GetRequiredService<DataPaths>().ConnectionString));

builder.Services.AddScoped<CatalogService>();
builder.Services.AddScoped<CartService>();
builder.Services.AddScoped<OrderService>();
builder.Services.AddScoped<AdminCatalogService>();
builder.Services.AddScoped<AdminOrderService>();
builder.Services.AddSingleton<ISeatNotifier, SignalRSeatNotifier>();
builder.Services.AddSingleton<DemoAdminAuthenticator>();
builder.Services.AddHostedService<ExpiredHoldCleanupService>();

// ---- Web API, errors, real-time ----
builder.Services
    .AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddProblemDetails(o =>
    o.CustomizeProblemDetails = ctx => ctx.ProblemDetails.Extensions["traceId"] = ctx.HttpContext.TraceIdentifier);
builder.Services.AddExceptionHandler<AppExceptionHandler>();
builder.Services
    .AddSignalR()
    .AddJsonProtocol(o => o.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();

// ---- Admin authentication (cookie) ----
builder.Services.AddDataProtection().SetApplicationName("MovieTheaterTicketSystem");
builder.Services.AddSingleton<IConfigureOptions<KeyManagementOptions>, LocalKeyStorageSetup>();
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.Name = "mtts_admin";
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Strict;
        o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        o.ExpireTimeSpan = TimeSpan.FromHours(2);
        o.SlidingExpiration = true;

        // This is an API: answer 401/403 instead of redirecting to a login page.
        o.Events.OnRedirectToLogin = ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        o.Events.OnRedirectToAccessDenied = ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorizationBuilder()
    .AddPolicy(AuthPolicies.Admin, p => p.RequireAuthenticatedUser().RequireRole(AuthPolicies.AdminRole));

// ---- Rate limits for sign-in and order lookup (slows down guessing) ----
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = (context, _) =>
    {
        var problems = context.HttpContext.RequestServices.GetRequiredService<IProblemDetailsService>();
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        return problems.WriteAsync(new ProblemDetailsContext
        {
            HttpContext = context.HttpContext,
            ProblemDetails = new ProblemDetails
            {
                Status = StatusCodes.Status429TooManyRequests,
                Title = "Too many requests",
                Detail = "Too many attempts. Wait a minute and try again.",
            },
        });
    };
    o.AddPolicy(RateLimitPolicies.Login, http => PerClientLimit(http, limits => limits.LoginPermitsPerMinute));
    o.AddPolicy(RateLimitPolicies.OrderLookup, http => PerClientLimit(http, limits => limits.OrderLookupPermitsPerMinute));
});

var app = builder.Build();

await DatabaseInitializer.InitializeAsync(app.Services, resetDatabase);

// ---- HTTP pipeline ----
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseMiddleware<SecurityHeadersMiddleware>();

var clientIndex = Path.Combine(app.Environment.WebRootPath ?? Path.Combine(app.Environment.ContentRootPath, "wwwroot"), "index.html");
var clientBuilt = File.Exists(clientIndex);
if (clientBuilt)
{
    app.UseDefaultFiles();
    app.UseStaticFiles(new StaticFileOptions
    {
        OnPrepareResponse = ctx =>
        {
            // Vite puts a content hash in every file name under /assets, so those can be cached forever.
            // index.html must always be revalidated so new builds are picked up.
            ctx.Context.Response.Headers.CacheControl = ctx.Context.Request.Path.StartsWithSegments("/assets")
                ? "public, max-age=31536000, immutable"
                : "no-cache";
        },
    });
}

app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<SeatHub>(SeatHub.Path);
app.MapOpenApi();
// Liveness probe for hosts (for example a Render health check): no auth, no database work, plain "Healthy".
app.MapHealthChecks("/healthz").AllowAnonymous();

// Unknown API routes get a JSON 404, never the SPA page.
app.MapFallback("/api/{**path}", () => Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Not found"));

if (clientBuilt)
{
    // Client-side routes such as /screenings/12 or /admin load the React app.
    app.MapFallbackToFile("index.html", new StaticFileOptions
    {
        OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "no-cache",
    });
}
else
{
    app.MapFallback(() => Results.Text(
        "The API is running, but the React client has not been built yet. "
        + "Run `npm ci` and `npm run build` in the client folder, then restart (see README).",
        "text/plain",
        statusCode: StatusCodes.Status503ServiceUnavailable));
}

await app.RunAsync();

void AddValidatedOptions<T>(string section)
    where T : class =>
    builder.Services.AddOptions<T>().Bind(builder.Configuration.GetSection(section)).ValidateDataAnnotations().ValidateOnStart();

static RateLimitPartition<string> PerClientLimit(HttpContext http, Func<RateLimitOptions, int> permits)
{
    var limits = http.RequestServices.GetRequiredService<IOptions<RateLimitOptions>>().Value;
    var client = http.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    return RateLimitPartition.GetFixedWindowLimiter(client, _ => new FixedWindowRateLimiterOptions
    {
        PermitLimit = permits(limits),
        Window = TimeSpan.FromMinutes(1),
        QueueLimit = 0,
    });
}

/// <summary>Entry point class, visible to the integration tests through WebApplicationFactory.</summary>
public partial class Program;
