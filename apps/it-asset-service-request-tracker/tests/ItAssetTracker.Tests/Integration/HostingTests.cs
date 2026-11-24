using System.Net;
using ItAssetTracker.Api.Contracts;
using ItAssetTracker.Api.Data;
using ItAssetTracker.Api.Infrastructure;
using Microsoft.Extensions.Configuration;

namespace ItAssetTracker.Tests.Integration;

public class HostingDefaultsTests
{
    private static IConfiguration Config(params (string Key, string Value)[] values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values.ToDictionary(v => v.Key, v => (string?)v.Value)).Build();

    [Fact]
    public void Port_variable_listens_on_all_interfaces()
    {
        Assert.Equal("http://+:8080", HostingDefaults.ResolveUrls("8080", Config()));
        Assert.Equal("http://+:10000", HostingDefaults.ResolveUrls(" 10000 ", Config(("urls", "http://localhost:1234"))));
    }

    [Fact]
    public void Without_any_setting_the_local_demo_port_is_used()
    {
        Assert.Equal("http://localhost:5201", HostingDefaults.ResolveUrls(null, Config()));
        Assert.Equal("http://localhost:5201", HostingDefaults.ResolveUrls("", Config()));
    }

    [Theory]
    [InlineData("urls", "http://localhost:5201")]
    [InlineData("http_ports", "8080")]
    [InlineData("https_ports", "8443")]
    public void Standard_aspnetcore_settings_are_left_alone(string key, string value)
    {
        Assert.Null(HostingDefaults.ResolveUrls(null, Config((key, value))));
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("0")]
    [InlineData("70000")]
    [InlineData("-1")]
    public void Invalid_port_fails_fast(string port)
    {
        Assert.Throws<InvalidOperationException>(() => HostingDefaults.ResolveUrls(port, Config()));
    }
}

/// <summary>A host with no persistent disk starts with no database file at all.</summary>
public class ProductionStartupTests(ProductionFactory factory) : IClassFixture<ProductionFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Missing_database_is_created_migrated_and_seeded_on_startup()
    {
        Assert.True(File.Exists(factory.DatabasePath));
        var dashboard = await (await _client.GetAsync("/api/dashboard")).ReadAsync<DashboardDto>();
        Assert.Equal(DemoDataSeeder.AssetCount, dashboard.TotalAssets);
        Assert.Equal(HttpStatusCode.OK, (await _client.GetAsync("/api/health")).StatusCode);
    }

    [Fact]
    public async Task Production_hides_openapi_and_disables_demo_reset()
    {
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync("/openapi/v1.json")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.PostAsync("/api/demo/reset", null)).StatusCode);
    }
}

public class RateLimitTests(RateLimitedFactory factory) : IClassFixture<RateLimitedFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Writes_over_the_limit_get_429_but_reads_still_work()
    {
        for (var i = 0; i < 3; i++)
        {
            var allowed = await _client.PostJsonAsync("/api/vlans", new { vlanId = 300 + i, name = $"RATE-{i}" });
            Assert.Equal(HttpStatusCode.Created, allowed.StatusCode);
        }

        var limited = await _client.PostJsonAsync("/api/vlans", new { vlanId = 399, name = "RATE-X" });
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.True(limited.Headers.Contains("Retry-After"));
        Assert.Equal("application/problem+json", limited.Content.Headers.ContentType?.MediaType);

        Assert.Equal(HttpStatusCode.OK, (await _client.GetAsync("/api/vlans")).StatusCode);
    }
}
