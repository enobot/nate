namespace ItAssetTracker.Api.Infrastructure;

public static class QueryHelpers
{
    public const char LikeEscape = '\\';

    /// <summary>
    /// Builds a "contains" pattern for SQL LIKE, escaping the wildcard characters % and _ so a search
    /// for "10_1" matches that literal text. The value is still sent as a parameter, never concatenated into SQL.
    /// </summary>
    public static string ContainsPattern(string term)
    {
        var escaped = term
            .Replace("\\", "\\\\")
            .Replace("%", "\\%")
            .Replace("_", "\\_");
        return $"%{escaped}%";
    }

    /// <summary>Splits "-name" into ("name", descending: true).</summary>
    public static (string Field, bool Descending) ParseSort(string? sort, string defaultField, bool defaultDescending = false)
    {
        if (string.IsNullOrWhiteSpace(sort))
        {
            return (defaultField, defaultDescending);
        }

        var trimmed = sort.Trim();
        return trimmed.StartsWith('-') ? (trimmed[1..], true) : (trimmed, false);
    }
}
