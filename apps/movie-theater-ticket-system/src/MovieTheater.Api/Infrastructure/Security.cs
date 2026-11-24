using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using MovieTheater.Api.Options;

namespace MovieTheater.Api.Infrastructure;

public static class RateLimitPolicies
{
    public const string Login = "login";
    public const string OrderLookup = "order-lookup";
}

public static class AuthPolicies
{
    public const string Admin = "Admin";
    public const string AdminRole = "Admin";
}

/// <summary>
/// Checks the single demo admin account from configuration. This is a local demo credential,
/// not a user system: a real deployment would use ASP.NET Core Identity or an external identity
/// provider with hashed passwords.
/// </summary>
public sealed class DemoAdminAuthenticator(IOptionsMonitor<DemoAdminOptions> options)
{
    public bool IsConfigured => !string.IsNullOrEmpty(options.CurrentValue.Password);

    public string Username => options.CurrentValue.Username;

    public bool Validate(string username, string password)
    {
        var current = options.CurrentValue;
        if (string.IsNullOrEmpty(current.Password))
        {
            return false;
        }

        // Compare fixed-length hashes in constant time so response timing does not leak
        // how much of the input matched.
        var userOk = CryptographicOperations.FixedTimeEquals(Hash(username), Hash(current.Username));
        var passwordOk = CryptographicOperations.FixedTimeEquals(Hash(password), Hash(current.Password));
        return userOk & passwordOk;
    }

    private static byte[] Hash(string value) => SHA256.HashData(Encoding.UTF8.GetBytes(value));
}

/// <summary>Basic response headers that cost nothing and close off common browser attacks.</summary>
public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    public Task InvokeAsync(HttpContext context)
    {
        var headers = context.Response.Headers;
        headers["X-Content-Type-Options"] = "nosniff";
        headers["X-Frame-Options"] = "DENY";
        headers["Referrer-Policy"] = "no-referrer";
        headers["Cross-Origin-Opener-Policy"] = "same-origin";
        return next(context);
    }
}
