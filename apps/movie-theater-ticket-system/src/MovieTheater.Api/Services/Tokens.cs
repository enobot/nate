using System.Security.Cryptography;
using System.Text.RegularExpressions;

namespace MovieTheater.Api.Services;

/// <summary>Random identifiers for carts, orders, and simulated payments.</summary>
public static partial class Tokens
{
    // Crockford base32 without I, L, O, U, so order numbers are easy to read aloud.
    private const string OrderAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

    /// <summary>128-bit random cart token as 32 lowercase hex characters.</summary>
    public static string NewCartToken() => Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16));

    public static string NewOrderNumber() => "MT-" + RandomNumberGenerator.GetString(OrderAlphabet, 8);

    public static string NewPaymentReference() => "SIM-" + RandomNumberGenerator.GetString(OrderAlphabet, 12);

    public static bool IsValidCartToken(string? token) => token is not null && CartTokenRegex().IsMatch(token);

    public static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    public static string NormalizeOrderNumber(string orderNumber) => orderNumber.Trim().ToUpperInvariant();

    public const string CartTokenPattern = "^[a-f0-9]{32}$";

    public const string OrderNumberPattern = "^(?i)MT-[0-9A-HJKMNP-TV-Z]{8}$";

    [GeneratedRegex(CartTokenPattern)]
    private static partial Regex CartTokenRegex();
}
