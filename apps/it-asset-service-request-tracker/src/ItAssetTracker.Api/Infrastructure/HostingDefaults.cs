using System.Globalization;

namespace ItAssetTracker.Api.Infrastructure;

public static class HostingDefaults
{
    /// <summary>Port used for the local demo (also set in Properties/launchSettings.json).</summary>
    public const int LocalPort = 5201;

    /// <summary>
    /// Decides which URL Kestrel should listen on, or returns null to keep ASP.NET Core's own settings.
    /// 1. A PORT environment variable (set by many hosting platforms) wins: listen on all interfaces on that port.
    /// 2. If none of the standard settings are present (ASPNETCORE_URLS, --urls, ASPNETCORE_HTTP_PORTS,
    ///    ASPNETCORE_HTTPS_PORTS), listen on http://localhost:5201 so a plain "dotnet ItAssetTracker.Api.dll"
    ///    matches the documented local demo.
    /// 3. Otherwise leave them alone. The official .NET container images set ASPNETCORE_HTTP_PORTS=8080.
    /// </summary>
    public static string? ResolveUrls(string? portVariable, IConfiguration configuration)
    {
        if (!string.IsNullOrWhiteSpace(portVariable))
        {
            if (!int.TryParse(portVariable.Trim(), NumberStyles.None, CultureInfo.InvariantCulture, out var port) || port is < 1 or > 65535)
            {
                throw new InvalidOperationException($"The PORT environment variable must be a number from 1 to 65535 (got '{portVariable}').");
            }

            return $"http://+:{port}";
        }

        var hasStandardSetting = !string.IsNullOrWhiteSpace(configuration["urls"])
            || !string.IsNullOrWhiteSpace(configuration["http_ports"])
            || !string.IsNullOrWhiteSpace(configuration["https_ports"]);

        return hasStandardSetting ? null : $"http://localhost:{LocalPort}";
    }
}
