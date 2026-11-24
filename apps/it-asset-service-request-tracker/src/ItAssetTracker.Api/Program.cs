using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using ItAssetTracker.Api.Data;
using ItAssetTracker.Api.Infrastructure;
using ItAssetTracker.Api.Services;
using Microsoft.AspNetCore.Mvc.ModelBinding.Metadata;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Hosting platforms usually tell the app which port to use through a PORT variable.
var listenUrls = HostingDefaults.ResolveUrls(Environment.GetEnvironmentVariable("PORT"), builder.Configuration);
if (listenUrls is not null)
{
    builder.WebHost.UseUrls(listenUrls);
}

// Request bodies in this app are small JSON documents; reject anything over 1 MB.
builder.WebHost.ConfigureKestrel(kestrel => kestrel.Limits.MaxRequestBodySize = 1_000_000);

builder.Services.AddControllers(options =>
    {
        // Validation errors use the JSON property names ("assetTag", not "AssetTag") so the
        // React forms can match each error to its input.
        options.ModelMetadataDetailsProviders.Add(new SystemTextJsonValidationMetadataProvider());
    })
    .AddJsonOptions(options =>
    {
        // Enums travel as names ("Deployed"), and numeric values are rejected so a client
        // cannot send an undefined value such as status 99.
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(allowIntegerValues: false));

        // Malformed JSON gets a generic message instead of the serializer's text, which names
        // internal .NET types.
        options.AllowInputFormatterExceptionMessages = false;
    });

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ProblemExceptionHandler>();
builder.Services.AddOpenApi();
builder.Services.AddSingleton(TimeProvider.System);

// The connection string is read when the first DbContext is created (not here), so tests can
// replace it through configuration.
builder.Services.AddSingleton<DatabasePathResolver>();
builder.Services.AddDbContext<AppDbContext>((sp, options) =>
    options.UseSqlite(sp.GetRequiredService<DatabasePathResolver>().ConnectionString));

builder.Services.AddScoped<AssetService>();
builder.Services.AddScoped<DirectoryService>();
builder.Services.AddScoped<NetworkService>();
builder.Services.AddScoped<ServiceRequestService>();
builder.Services.AddScoped<ReportService>();

builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("database");

// The hosted demo has no sign-in, so limit how many changes one client can make per minute.
// Reads are never limited. RateLimiting:WritesPerMinute = 0 turns the limit off (Development does this).
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
    {
        var method = context.Request.Method;
        var isRead = HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method);
        var limit = context.RequestServices.GetRequiredService<IConfiguration>().GetValue("RateLimiting:WritesPerMinute", 0);
        if (isRead || limit <= 0)
        {
            return RateLimitPartition.GetNoLimiter("unlimited");
        }

        var client = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(client, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = limit,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        });
    });
    options.OnRejected = (rejected, _) =>
    {
        if (rejected.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            rejected.HttpContext.Response.Headers.RetryAfter = ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString();
        }

        return ValueTask.CompletedTask;
    };
});

// Only the Vite dev server origin is allowed (configured in appsettings.Development.json).
// The production build is served by this app on the same origin and needs no CORS at all.
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options => options.AddPolicy("DevClient", policy =>
    policy.WithOrigins(allowedOrigins).AllowAnyHeader().WithMethods("GET", "POST", "PUT", "DELETE")));

// Compress JSON and the JavaScript/CSS bundle (about 366 KB of JS before compression).
builder.Services.AddResponseCompression(options =>
{
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
    options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(["text/javascript", "image/svg+xml", "application/problem+json"]);
});

var app = builder.Build();

if (args.Contains("--reset-demo"))
{
    // dotnet run --project src/ItAssetTracker.Api -- --reset-demo
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
    var clock = scope.ServiceProvider.GetRequiredService<TimeProvider>();
    await DatabaseInitializer.ResetDemoDataAsync(db, clock.GetUtcNow().UtcDateTime);
    app.Logger.LogInformation("Demo data reset: {Counts}", await DatabaseInitializer.CountsAsync(db));
    return;
}

await DatabaseInitializer.InitializeAsync(app.Services, app.Configuration, app.Logger);

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseRateLimiter();

app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers.XContentTypeOptions = "nosniff";
    headers.XFrameOptions = "DENY";
    headers["Referrer-Policy"] = "no-referrer";
    headers.ContentSecurityPolicy =
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; " +
        "font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
    await next();
});

var staticFileOptions = new StaticFileOptions
{
    OnPrepareResponse = context =>
    {
        // Vite puts a content hash in every file name under /static, so those files never change
        // and can be cached for a year. index.html (also served for client routes such as
        // /assets/42) must always be revalidated so a new deployment is picked up.
        var isIndex = string.Equals(context.File.Name, "index.html", StringComparison.OrdinalIgnoreCase);
        context.Context.Response.Headers.CacheControl = !isIndex && context.Context.Request.Path.StartsWithSegments("/static")
            ? "public, max-age=31536000, immutable"
            : "no-cache";
    }
};

app.UseResponseCompression();
app.UseDefaultFiles();
app.UseStaticFiles(staticFileOptions);
app.UseCors("DevClient");

if (app.Environment.IsDevelopment())
{
    // OpenAPI document at /openapi/v1.json
    app.MapOpenApi();
}

app.MapControllers();
app.MapHealthChecks("/api/health");

// Unknown /api/* paths return a JSON 404 instead of falling through to the React app.
app.Map("/api/{**rest}", () => Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Not found",
    detail: "No API endpoint matches this path."));

var indexFile = Path.Combine(app.Environment.WebRootPath ?? Path.Combine(app.Environment.ContentRootPath, "wwwroot"), "index.html");
if (File.Exists(indexFile))
{
    // Client-side routes such as /assets/42 are served index.html so a browser refresh works.
    app.MapFallbackToFile("index.html", staticFileOptions);
}
else
{
    app.MapFallback(() => Results.Text(
        "The React client has not been built yet. Run 'npm ci' and 'npm run build' in the client folder, then restart. " +
        "The API is available under /api.",
        "text/plain", statusCode: StatusCodes.Status503ServiceUnavailable));
}

app.Run();

/// <summary>Exposed so WebApplicationFactory in the test project can start the app.</summary>
public partial class Program;
