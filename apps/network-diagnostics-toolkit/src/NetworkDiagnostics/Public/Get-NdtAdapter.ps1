function Get-NdtAdapter {
    <#
    .SYNOPSIS
        Lists network adapters with status, link speed and MAC address.

    .DESCRIPTION
        Get-NdtAdapter reads adapter information with Get-NetAdapter and adds a plain-language
        status:

          PASS  adapter is up
          WARN  adapter is up on a wired link at 100 Mbps or less (possible cable or port
                problem when both ends support 1 Gbps)
          WARN  media disconnected (no cable link, or Wi-Fi not connected)
          INFO  adapter is disabled in Windows, or the hardware is not present

        The MAC address is what you look up in a switch's MAC address table to find the
        switch port a computer is plugged into.

        By default only physical adapters are shown. Use -IncludeVirtual to add VPN, Hyper-V,
        Bluetooth and other virtual adapters. Nothing is enabled, disabled or changed.

    .PARAMETER Name
        Only show adapters with these names. Wildcards supported by Get-NetAdapter, such as
        "Ethernet*", can be used.

    .PARAMETER IncludeVirtual
        Include virtual adapters (VPN, Hyper-V, Bluetooth PAN and similar).

    .EXAMPLE
        Get-NdtAdapter | Show-NdtResult

        Shows the physical adapters with their status, link speed and MAC address.

    .EXAMPLE
        Get-NdtAdapter -Name 'Ethernet*' | Select-Object Target, AdapterStatus, LinkSpeed, MacAddress

        Shows wired adapters as a short table.

    .EXAMPLE
        Get-NdtAdapter -IncludeVirtual

        Includes VPN and other virtual adapters.

    .OUTPUTS
        NetworkDiagnostics.Result (TestType Adapter), one per adapter. Extra properties:
        AdapterName, InterfaceDescription, AdapterStatus, LinkSpeed, SpeedBps, MacAddress,
        PhysicalMediaType, InterfaceIndex, Virtual.

    .NOTES
        Read-only. Uses Get-NetAdapter from the NetAdapter module.

    .LINK
        Get-NdtIPConfig
    #>
    [CmdletBinding()]
    [OutputType('NetworkDiagnostics.Result')]
    param(
        [ValidateNotNullOrEmpty()]
        [string[]]$Name,

        [switch]$IncludeVirtual
    )

    $query = @{ ErrorAction = 'Stop' }
    if (-not $IncludeVirtual) { $query.Physical = $true }
    if ($PSBoundParameters.ContainsKey('Name')) { $query.Name = $Name }

    try {
        $adapters = @(Get-NetAdapter @query | Sort-Object -Property Name)
    }
    catch {
        $message = Get-NdtErrorMessage -ErrorObject $_
        if ($PSBoundParameters.ContainsKey('Name')) {
            $shown = ConvertTo-NdtSafeText -Text ($Name -join ', ') -MaxLength 80
            $message = "No adapter named '$shown' was found. Run Get-NdtAdapter without -Name to see the names. ($message)"
        }
        $record = New-Object -TypeName System.Management.Automation.ErrorRecord -ArgumentList ([System.InvalidOperationException]::new($message)), 'NdtAdapterReadFailed', ([System.Management.Automation.ErrorCategory]::ReadError), $null
        $PSCmdlet.ThrowTerminatingError($record)
    }

    if ($adapters.Count -eq 0) {
        Write-Warning 'No network adapters were found. Use -IncludeVirtual to include virtual adapters.'
        return
    }

    ConvertTo-NdtAdapterResult -Adapter $adapters
}
