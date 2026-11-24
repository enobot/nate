function Get-NdtIPConfig {
    <#
    .SYNOPSIS
        Shows this computer's IP configuration and flags common problems.

    .DESCRIPTION
        Get-NdtIPConfig reads the same information as "ipconfig /all" using
        Get-NetIPConfiguration: IPv4 and IPv6 addresses with prefix length, default gateway,
        DNS servers, DHCP state, adapter status and MAC address.

        It flags problems a technician should notice first:
          WARN  APIPA address (169.254.x.x) on a connected interface: no DHCP server answered
          WARN  no IP address assigned
          WARN  no DNS servers configured
          WARN  no default gateway on any interface
          INFO  no default gateway on this interface while another interface has one
                (normal for virtual adapters)
          INFO  the interface's adapter is disconnected or disabled, so its settings are not
                in use (check the cable or Wi-Fi with Get-NdtAdapter)
          PASS  address, gateway and DNS servers are present

        Nothing is changed. This command does not renew DHCP leases or edit settings.

    .PARAMETER InterfaceAlias
        Only show the interface with this name, for example "Ethernet" or "Wi-Fi".

    .PARAMETER All
        Show every interface, including ones whose adapter is not present (for example a
        removed USB adapter). Without -All, Get-NetIPConfiguration skips those interfaces;
        connected and disconnected interfaces are shown either way. Ignored with
        -InterfaceAlias.

    .EXAMPLE
        Get-NdtIPConfig | Show-NdtResult

        Shows the IP configuration of each interface.

    .EXAMPLE
        Get-NdtIPConfig -InterfaceAlias Ethernet

        Shows only the wired Ethernet interface.

    .EXAMPLE
        Get-NdtIPConfig -All | Select-Object Target, Status, IPv4Address, DnsServer

        Lists every interface with its addresses and DNS servers.

    .OUTPUTS
        NetworkDiagnostics.Result (TestType IPConfig), one per interface. Extra properties:
        InterfaceAlias, InterfaceDescription, InterfaceIndex, AdapterStatus, MacAddress,
        IPv4Address, IPv6Address, DefaultGateway, DnsServer, DhcpEnabled.

    .NOTES
        Read-only. Uses Get-NetIPConfiguration -Detailed from the NetTCPIP module.

    .LINK
        Get-NdtAdapter
    #>
    [CmdletBinding()]
    [OutputType('NetworkDiagnostics.Result')]
    param(
        [ValidateNotNullOrEmpty()]
        [string]$InterfaceAlias,

        [switch]$All
    )

    $query = @{
        Detailed    = $true
        ErrorAction = 'Stop'
    }
    # -All and -InterfaceAlias are in different parameter sets of Get-NetIPConfiguration.
    if ($PSBoundParameters.ContainsKey('InterfaceAlias')) {
        $query.InterfaceAlias = $InterfaceAlias
    }
    elseif ($All) {
        $query.All = $true
    }

    try {
        $configuration = @(Get-NetIPConfiguration @query)
    }
    catch {
        $message = Get-NdtErrorMessage -ErrorObject $_
        if ($PSBoundParameters.ContainsKey('InterfaceAlias')) {
            $shown = ConvertTo-NdtSafeText -Text $InterfaceAlias -MaxLength 80
            $message = "No interface named '$shown' was found, or it could not be read. Run Get-NdtIPConfig without -InterfaceAlias to see the names. ($message)"
        }
        $record = New-Object -TypeName System.Management.Automation.ErrorRecord -ArgumentList ([System.InvalidOperationException]::new($message)), 'NdtIPConfigReadFailed', ([System.Management.Automation.ErrorCategory]::ReadError), $InterfaceAlias
        $PSCmdlet.ThrowTerminatingError($record)
    }

    if ($configuration.Count -eq 0) {
        Write-Warning 'No network interfaces were found. Use -All to include interfaces whose adapter is not present.'
        return
    }

    ConvertTo-NdtIPConfigResult -Configuration $configuration
}
