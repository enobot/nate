using System.Net;
using ItAssetTracker.Api.Contracts;
using ItAssetTracker.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace ItAssetTracker.Tests.Integration;

public class AssetsApiTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    private static object NewAsset(string tag, string serial, string status = "InStock", int? locationId = null, int? assignedToId = null) => new
    {
        assetTag = tag,
        type = "Laptop",
        manufacturer = "Lenovo",
        model = "ThinkPad T14",
        serialNumber = serial,
        status,
        locationId,
        assignedToId,
        purchaseDate = "2026-01-10",
        warrantyEndDate = "2029-01-10",
        notes = "Integration test asset"
    };

    private async Task<int> LocationIdAsync(string room)
    {
        await using var db = factory.CreateDbContext();
        return (await db.Locations.SingleAsync(l => l.Room == room)).Id;
    }

    private async Task<int> PersonIdAsync(string email)
    {
        await using var db = factory.CreateDbContext();
        return (await db.People.SingleAsync(p => p.Email == email)).Id;
    }

    [Fact]
    public async Task Create_read_update_delete_round_trip()
    {
        var storage = await LocationIdAsync("B012");
        var created = await _client.PostJsonAsync("/api/assets", NewAsset("acc-crud-1", "sncrud001", locationId: storage));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.NotNull(created.Headers.Location);
        var asset = await created.ReadAsync<AssetDetailDto>();
        Assert.Equal("ACC-CRUD-1", asset.AssetTag); // normalized to upper case
        Assert.Equal("SNCRUD001", asset.SerialNumber);
        Assert.Equal(1, asset.Version);

        var fetched = await (await _client.GetAsync($"/api/assets/{asset.Id}")).ReadAsync<AssetDetailDto>();
        Assert.Equal("ThinkPad T14", fetched.Model);
        Assert.Equal("ADM B012", fetched.LocationName);
        Assert.Equal(DateTimeKind.Utc, fetched.CreatedAt.Kind);

        var room = await LocationIdAsync("214");
        var pat = await PersonIdAsync("pat.requester@test.example");
        var update = new
        {
            assetTag = "ACC-CRUD-1",
            type = "Laptop",
            manufacturer = "Lenovo",
            model = "ThinkPad T14 Gen 5",
            serialNumber = "SNCRUD001",
            status = "Deployed",
            locationId = room,
            assignedToId = pat,
            purchaseDate = "2026-01-10",
            warrantyEndDate = "2029-01-10",
            version = asset.Version,
            changeNote = "Issued to new hire"
        };
        var updatedResponse = await _client.PutJsonAsync($"/api/assets/{asset.Id}", update);
        Assert.Equal(HttpStatusCode.OK, updatedResponse.StatusCode);
        var updated = await updatedResponse.ReadAsync<AssetDetailDto>();
        Assert.Equal(AssetStatus.Deployed, updated.Status);
        Assert.Equal("Pat Requester", updated.AssignedToName);
        Assert.Equal(2, updated.Version);

        var history = await (await _client.GetAsync($"/api/assets/{asset.Id}/history")).ReadAsync<List<AssetHistoryDto>>();
        Assert.Equal(2, history.Count);
        Assert.Equal(("InStock", "Deployed", "Pat Requester", "ENG 214", "Issued to new hire"),
            (history[0].FromStatus, history[0].ToStatus, history[0].ToAssignee, history[0].ToLocation, history[0].Note));

        var deleted = await _client.DeleteAsync($"/api/assets/{asset.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/assets/{asset.Id}")).StatusCode);

        await using var db = factory.CreateDbContext();
        Assert.False(await db.AssetHistory.AnyAsync(h => h.AssetId == asset.Id)); // history is removed with the asset
    }

    [Fact]
    public async Task Missing_required_fields_return_400_problem_details()
    {
        var response = await _client.PostJsonAsync("/api/assets", new { assetTag = "", manufacturer = "Dell" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.ReadAsync<Problem>();
        Assert.Equal(400, problem.Status);
        Assert.NotNull(problem.Errors);
        Assert.Contains("assetTag", problem.Errors.Keys);
        Assert.Contains("model", problem.Errors.Keys);
        Assert.Contains("serialNumber", problem.Errors.Keys);
        Assert.Contains("status", problem.Errors.Keys);
    }

    [Fact]
    public async Task Invalid_enum_values_are_rejected()
    {
        var body = new { assetTag = "ACC-ENUM-1", type = "Toaster", manufacturer = "Dell", model = "X", serialNumber = "SNENUM1", status = "InStock" };
        Assert.Equal(HttpStatusCode.BadRequest, (await _client.PostJsonAsync("/api/assets", body)).StatusCode);

        var numeric = new { assetTag = "ACC-ENUM-2", type = 99, manufacturer = "Dell", model = "X", serialNumber = "SNENUM2", status = "InStock" };
        Assert.Equal(HttpStatusCode.BadRequest, (await _client.PostJsonAsync("/api/assets", numeric)).StatusCode);
    }

    [Fact]
    public async Task Tag_with_illegal_characters_or_too_long_is_rejected()
    {
        var bad = await _client.PostJsonAsync("/api/assets", NewAsset("ACC 1;DROP", "SNBAD001"));
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);

        var tooLong = await _client.PostJsonAsync("/api/assets", NewAsset(new string('A', 21), "SNBAD002"));
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
    }

    [Fact]
    public async Task Duplicate_asset_tag_returns_409()
    {
        var response = await _client.PostJsonAsync("/api/assets", NewAsset("acc-0001", "SNUNIQUE01"));
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var problem = await response.ReadAsync<Problem>();
        Assert.Equal(409, problem.Status);
        Assert.Contains("ACC-0001", problem.Detail);
    }

    [Fact]
    public async Task Duplicate_serial_number_returns_409_even_with_different_case()
    {
        var response = await _client.PostJsonAsync("/api/assets", NewAsset("ACC-DUPSN-1", "snacc0001"));
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Unique_index_blocks_duplicates_that_bypass_the_service_check()
    {
        // Simulates two requests racing past the "already exists?" check: the database index is the last line of defence.
        await using var db = factory.CreateDbContext();
        db.Assets.Add(new Asset { AssetTag = "ACC-0002", AssetType = AssetType.Other, Manufacturer = "X", Model = "Y", SerialNumber = "SNRACE01", Status = AssetStatus.InStock });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Business_rules_return_400_with_field_errors()
    {
        var pat = await PersonIdAsync("pat.requester@test.example");
        var response = await _client.PostJsonAsync("/api/assets", NewAsset("ACC-RULE-1", "SNRULE001", status: "InStock", assignedToId: pat));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.ReadAsync<Problem>();
        Assert.True(problem.Errors!.ContainsKey("assignedToId"));

        var deployedNowhere = await _client.PostJsonAsync("/api/assets", NewAsset("ACC-RULE-2", "SNRULE002", status: "Deployed"));
        var problem2 = await deployedNowhere.ReadAsync<Problem>();
        Assert.True(problem2.Errors!.ContainsKey("locationId"));
    }

    [Fact]
    public async Task Unknown_location_is_a_400_not_a_500()
    {
        var response = await _client.PostJsonAsync("/api/assets", NewAsset("ACC-REF-1", "SNREF0001", locationId: 99999));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Stale_version_returns_409_and_does_not_overwrite()
    {
        var created = await (await _client.PostJsonAsync("/api/assets", NewAsset("ACC-VER-1", "SNVER0001"))).ReadAsync<AssetDetailDto>();
        var edit = (string model, int version) => new
        {
            assetTag = "ACC-VER-1", type = "Laptop", manufacturer = "Lenovo", model, serialNumber = "SNVER0001",
            status = "InStock", version
        };

        Assert.Equal(HttpStatusCode.OK, (await _client.PutJsonAsync($"/api/assets/{created.Id}", edit("First edit", 1))).StatusCode);
        var stale = await _client.PutJsonAsync($"/api/assets/{created.Id}", edit("Second edit from old form", 1));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);

        var current = await (await _client.GetAsync($"/api/assets/{created.Id}")).ReadAsync<AssetDetailDto>();
        Assert.Equal("First edit", current.Model);
    }

    [Fact]
    public async Task Retired_asset_cannot_be_redeployed()
    {
        await using var db = factory.CreateDbContext();
        var retired = await db.Assets.SingleAsync(a => a.AssetTag == "ACC-0005");
        var response = await _client.PutJsonAsync($"/api/assets/{retired.Id}", new
        {
            assetTag = retired.AssetTag, type = "Laptop", manufacturer = retired.Manufacturer, model = retired.Model,
            serialNumber = retired.SerialNumber, status = "InStock", version = retired.Version
        });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Asset_linked_to_a_ticket_cannot_be_deleted()
    {
        var created = await (await _client.PostJsonAsync("/api/assets", NewAsset("ACC-LINK-1", "SNLINK001"))).ReadAsync<AssetDetailDto>();
        var pat = await PersonIdAsync("pat.requester@test.example");
        var ticket = await _client.PostJsonAsync("/api/service-requests", new
        {
            title = "Laptop ACC-LINK-1 battery swelling",
            description = "Battery is bulging, please replace.",
            category = "Hardware",
            priority = "P2",
            requesterId = pat,
            relatedAssetId = created.Id
        });
        Assert.Equal(HttpStatusCode.Created, ticket.StatusCode);

        Assert.Equal(HttpStatusCode.Conflict, (await _client.DeleteAsync($"/api/assets/{created.Id}")).StatusCode);
    }

    [Fact]
    public async Task List_supports_search_filters_sorting_and_paging()
    {
        var search = await (await _client.GetAsync("/api/assets?search=acc-000&status=InStock&sort=-assetTag")).ReadAsync<PagedResult<AssetListItemDto>>();
        Assert.Equal(["ACC-0006", "ACC-0003"], search.Items.Select(i => i.AssetTag).ToArray());

        var byPerson = await (await _client.GetAsync("/api/assets?search=pat%20req")).ReadAsync<PagedResult<AssetListItemDto>>();
        Assert.Contains(byPerson.Items, i => i.AssetTag == "ACC-0001");

        var building = await (await _client.GetAsync("/api/assets?building=eng&type=Desktop")).ReadAsync<PagedResult<AssetListItemDto>>();
        Assert.Equal("ACC-0002", Assert.Single(building.Items).AssetTag);

        var page = await (await _client.GetAsync("/api/assets?search=ACC-000&page=2&pageSize=2&sort=assetTag")).ReadAsync<PagedResult<AssetListItemDto>>();
        Assert.Equal(6, page.TotalCount);
        Assert.Equal(["ACC-0003", "ACC-0004"], page.Items.Select(i => i.AssetTag).ToArray());

        var warranty = await (await _client.GetAsync("/api/assets?warrantyWithinDays=30")).ReadAsync<PagedResult<AssetListItemDto>>();
        Assert.Equal(["ACC-0001", "ACC-0004"], warranty.Items.Select(i => i.AssetTag).ToArray());
    }

    [Fact]
    public async Task Like_wildcards_in_search_are_treated_as_text()
    {
        var result = await (await _client.GetAsync("/api/assets?search=%25")).ReadAsync<PagedResult<AssetListItemDto>>();
        Assert.Equal(0, result.TotalCount);
    }

    [Fact]
    public async Task Unknown_sort_field_is_a_400()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await _client.GetAsync("/api/assets?sort=password")).StatusCode);
    }

    [Fact]
    public async Task Page_size_is_capped()
    {
        var result = await (await _client.GetAsync("/api/assets?pageSize=5000")).ReadAsync<PagedResult<AssetListItemDto>>();
        Assert.Equal(Paging.MaxPageSize, result.PageSize);
    }
}
