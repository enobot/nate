using ItAssetTracker.Api.Domain;
using ItAssetTracker.Api.Domain.Rules;

namespace ItAssetTracker.Tests.Unit;

public class AssetRulesTests
{
    private static readonly DateOnly Today = new(2026, 6, 15);

    [Fact]
    public void Deployed_asset_with_location_and_person_is_valid()
    {
        AssetRules.EnsureValid(null, AssetStatus.Deployed, locationId: 1, assignedToPersonId: 2,
            new DateOnly(2025, 1, 10), new DateOnly(2028, 1, 10), Today);
    }

    [Fact]
    public void Deployed_asset_needs_a_location()
    {
        var ex = Assert.Throws<BusinessRuleException>(() =>
            AssetRules.EnsureValid(null, AssetStatus.Deployed, locationId: null, assignedToPersonId: null, null, null, Today));
        Assert.True(ex.Errors.ContainsKey("locationId"));
    }

    [Theory]
    [InlineData(AssetStatus.InStock)]
    [InlineData(AssetStatus.InRepair)]
    [InlineData(AssetStatus.Retired)]
    public void Only_deployed_assets_can_be_assigned_to_a_person(AssetStatus status)
    {
        var ex = Assert.Throws<BusinessRuleException>(() =>
            AssetRules.EnsureValid(null, status, locationId: 1, assignedToPersonId: 5, null, null, Today));
        Assert.True(ex.Errors.ContainsKey("assignedToId"));
    }

    [Fact]
    public void Warranty_cannot_end_before_purchase()
    {
        var ex = Assert.Throws<BusinessRuleException>(() =>
            AssetRules.EnsureValid(null, AssetStatus.InStock, 1, null, new DateOnly(2026, 3, 1), new DateOnly(2026, 2, 28), Today));
        Assert.True(ex.Errors.ContainsKey("warrantyEndDate"));
    }

    [Fact]
    public void Purchase_date_cannot_be_in_the_future()
    {
        var ex = Assert.Throws<BusinessRuleException>(() =>
            AssetRules.EnsureValid(null, AssetStatus.InStock, 1, null, Today.AddDays(1), null, Today));
        Assert.True(ex.Errors.ContainsKey("purchaseDate"));
    }

    [Fact]
    public void Purchase_today_and_same_day_warranty_are_allowed()
    {
        AssetRules.EnsureValid(null, AssetStatus.InStock, 1, null, Today, Today, Today);
    }

    [Fact]
    public void Multiple_problems_are_reported_together()
    {
        var ex = Assert.Throws<BusinessRuleException>(() =>
            AssetRules.EnsureValid(null, AssetStatus.InStock, null, 3, Today.AddDays(2), Today, Today));
        Assert.Equal(3, ex.Errors.Count);
    }

    [Theory]
    [InlineData(AssetStatus.InStock)]
    [InlineData(AssetStatus.Deployed)]
    [InlineData(AssetStatus.InRepair)]
    public void Retired_assets_cannot_return_to_service(AssetStatus target)
    {
        Assert.Throws<ConflictException>(() =>
            AssetRules.EnsureValid(AssetStatus.Retired, target, 1, null, null, null, Today));
    }

    [Fact]
    public void Retired_asset_can_still_be_edited_while_retired()
    {
        AssetRules.EnsureValid(AssetStatus.Retired, AssetStatus.Retired, null, null, null, null, Today);
    }

    [Theory]
    [InlineData(" acc-100 ", "ACC-100")]
    [InlineData("sn1234x", "SN1234X")]
    public void Identifiers_are_trimmed_and_upper_cased(string input, string expected)
    {
        Assert.Equal(expected, AssetRules.NormalizeIdentifier(input));
    }
}
