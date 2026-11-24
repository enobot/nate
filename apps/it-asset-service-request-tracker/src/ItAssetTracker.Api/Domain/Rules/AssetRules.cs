namespace ItAssetTracker.Api.Domain.Rules;

/// <summary>Rules that keep an asset's status, location and assignee consistent.</summary>
public static class AssetRules
{
    /// <summary>Validates the combination of fields an asset is about to be saved with.</summary>
    /// <param name="previousStatus">Null when the asset is being created.</param>
    public static void EnsureValid(
        AssetStatus? previousStatus,
        AssetStatus status,
        int? locationId,
        int? assignedToPersonId,
        DateOnly? purchaseDate,
        DateOnly? warrantyEndDate,
        DateOnly today)
    {
        var errors = new Dictionary<string, string[]>();

        if (previousStatus == AssetStatus.Retired && status != AssetStatus.Retired)
        {
            // Retirement means the device was disposed of or recycled; bringing it back would
            // break the audit trail, so a replacement should be entered as a new asset instead.
            throw new ConflictException("Retired assets cannot be returned to service. Add the device as a new asset instead.");
        }

        if (assignedToPersonId is not null && status != AssetStatus.Deployed)
        {
            errors["assignedToId"] = ["Only deployed assets can be assigned to a person."];
        }

        if (status == AssetStatus.Deployed && locationId is null)
        {
            errors["locationId"] = ["A deployed asset needs a location."];
        }

        if (purchaseDate is not null && purchaseDate > today)
        {
            errors["purchaseDate"] = ["Purchase date cannot be in the future."];
        }

        if (purchaseDate is not null && warrantyEndDate is not null && warrantyEndDate < purchaseDate)
        {
            errors["warrantyEndDate"] = ["Warranty end date must be on or after the purchase date."];
        }

        if (errors.Count > 0)
        {
            throw new BusinessRuleException(errors);
        }
    }

    /// <summary>Asset tags and serial numbers are compared and stored upper-case with no surrounding spaces.</summary>
    public static string NormalizeIdentifier(string value) => value.Trim().ToUpperInvariant();
}
