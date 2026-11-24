using System.ComponentModel.DataAnnotations;

namespace MovieTheater.Api.Options;

/// <summary>Ticket and concession pricing rules. All amounts are whole cents.</summary>
public sealed class PricingOptions
{
    public const string Section = "Pricing";

    [Range(0, 100_000)] public int AdultCents { get; set; } = 1450;
    [Range(0, 100_000)] public int ChildCents { get; set; } = 1050;
    [Range(0, 100_000)] public int SeniorCents { get; set; } = 1150;

    /// <summary>Amount taken off each ticket for matinee screenings.</summary>
    [Range(0, 100_000)] public int MatineeDiscountCents { get; set; } = 300;

    /// <summary>Screenings that start before this theater-local hour (24h clock) are matinees.</summary>
    [Range(0, 23)] public int MatineeCutoffHour { get; set; } = 16;

    /// <summary>Added to each ticket for a premium seat.</summary>
    [Range(0, 100_000)] public int PremiumSurchargeCents { get; set; } = 350;

    /// <summary>Sales tax as a fraction, e.g. 0.0775 for 7.75%.</summary>
    [Range(0.0, 0.25)] public decimal SalesTaxRate { get; set; } = 0.0775m;

    /// <summary>When false (the default), tax is charged on concessions only.</summary>
    public bool TaxTickets { get; set; }
}

public sealed class BookingOptions
{
    public const string Section = "Booking";

    /// <summary>How long seats stay held in a cart before they are released.</summary>
    [Range(1, 60)] public int HoldMinutes { get; set; } = 10;

    [Range(1, 20)] public int MaxSeatsPerOrder { get; set; } = 10;

    [Range(1, 20)] public int MaxConcessionQuantity { get; set; } = 10;

    /// <summary>Customers can cancel online until this many minutes before showtime.</summary>
    [Range(0, 1440)] public int CancellationCutoffMinutes { get; set; } = 30;

    /// <summary>Gap required between screenings in the same auditorium for cleaning and trailers.</summary>
    [Range(0, 120)] public int CleaningBufferMinutes { get; set; } = 20;

    /// <summary>How often the background job releases expired holds. 0 turns the job off (used by tests).</summary>
    [Range(0, 3600)] public int HoldCleanupIntervalSeconds { get; set; } = 30;
}

public sealed class TheaterOptions
{
    public const string Section = "Theater";

    /// <summary>
    /// Time zone used for matinee rules, daily schedules, and display times.
    /// Empty means the server's local time zone. "UTC" or any system time zone id also works.
    /// </summary>
    public string TimeZone { get; set; } = "";
}

/// <summary>
/// Credentials for the single demo admin account. These are LOCAL DEMO values set in
/// appsettings.Development.json, user-secrets, or environment variables. When the password
/// is empty, admin sign-in is turned off.
/// </summary>
public sealed class DemoAdminOptions
{
    public const string Section = "DemoAdmin";

    [Required] public string Username { get; set; } = "admin";
    public string Password { get; set; } = "";
}

public sealed class RateLimitOptions
{
    public const string Section = "RateLimits";

    [Range(1, 10_000)] public int LoginPermitsPerMinute { get; set; } = 5;
    [Range(1, 10_000)] public int OrderLookupPermitsPerMinute { get; set; } = 30;
}

public sealed class StorageOptions
{
    public const string Section = "Storage";

    /// <summary>Folder for the SQLite file and data protection keys. Relative paths are under the content root.</summary>
    public string DataDirectory { get; set; } = "App_Data";

    public string DatabaseFileName { get; set; } = "movie-theater.db";
}
