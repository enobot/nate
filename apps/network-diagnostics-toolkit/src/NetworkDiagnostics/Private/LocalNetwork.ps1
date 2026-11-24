<#
    Builds result objects from local IP configuration (Get-NetIPConfiguration) and adapter
    information (Get-NetAdapter). Both cmdlets only read settings.
#>

function Get-NdtNonEmptyString {
    <#
        Returns the non-empty string values from a list. Used because piping $null into
        ForEach-Object runs the script block once, which would create blank entries.
    #>
    [CmdletBinding()]
    [OutputType([string[]])]
    param(
        [AllowNull()][AllowEmptyCollection()][object[]]$Value
    )

    # Duplicates are dropped as well: Windows can list the same DNS server twice.
    $output = @()
    foreach ($item in @($Value)) {
        if ($null -eq $item) { continue }
        $text = ([string]$item).Trim()
        if ($text.Length -gt 0 -and $output -notcontains $text) { $output += $text }
    }
    return $output
}

function ConvertTo-NdtIPConfigResult {
    [CmdletBinding()]
    [OutputType('NetworkDiagnostics.Result')]
    param(
        [AllowNull()][AllowEmptyCollection()][object[]]$Configuration,
        [string]$Timestamp,
        [string]$SourceComputer
    )

    $override = Get-NdtResultOverride -Timestamp $Timestamp -SourceComputer $SourceComputer
    $entries = @()

    foreach ($config in @($Configuration)) {
        if ($null -eq $config) { continue }

        $ipv4 = @()
        foreach ($address in @($config.IPv4Address)) {
            if ($null -eq $address -or [string]::IsNullOrEmpty([string]$address.IPAddress)) { continue }
            $ipv4 += "$($address.IPAddress)/$($address.PrefixLength)"
        }
        $ipv6 = @()
        foreach ($address in @($config.IPv6Address)) {
            if ($null -eq $address -or [string]::IsNullOrEmpty([string]$address.IPAddress)) { continue }
            $ipv6 += "$($address.IPAddress)/$($address.PrefixLength)"
        }

        $gateway4 = @(Get-NdtNonEmptyString -Value @(foreach ($g in @($config.IPv4DefaultGateway)) { if ($null -ne $g) { $g.NextHop } }))
        $gateway6 = @(Get-NdtNonEmptyString -Value @(foreach ($g in @($config.IPv6DefaultGateway)) { if ($null -ne $g) { $g.NextHop } }))
        $dnsServers = @(Get-NdtNonEmptyString -Value @(foreach ($d in @($config.DNSServer)) { if ($null -ne $d) { $d.ServerAddresses } }))

        $dhcp = 'Unknown'
        if ($null -ne $config.NetIPv4Interface -and $null -ne $config.NetIPv4Interface.Dhcp) {
            $dhcp = [string]$config.NetIPv4Interface.Dhcp
        }

        $adapterStatus = 'Unknown'
        $mac = ''
        if ($null -ne $config.NetAdapter) {
            if ($null -ne $config.NetAdapter.Status) { $adapterStatus = [string]$config.NetAdapter.Status }
            if ($null -ne $config.NetAdapter.MacAddress) { $mac = [string]$config.NetAdapter.MacAddress }
        }

        $entries += [pscustomobject]@{
            Alias          = [string]$config.InterfaceAlias
            Description    = [string]$config.InterfaceDescription
            InterfaceIndex = $config.InterfaceIndex
            IPv4           = $ipv4
            IPv6           = $ipv6
            Gateway4       = $gateway4
            Gateway6       = $gateway6
            DnsServers     = $dnsServers
            Dhcp           = $dhcp
            AdapterStatus  = $adapterStatus
            Mac            = $mac
        }
    }

    $anyGateway = @($entries | Where-Object { $_.Gateway4.Count -gt 0 -or $_.Gateway6.Count -gt 0 }).Count -gt 0

    foreach ($entry in $entries) {
        $ipv4Text = 'none'
        if ($entry.IPv4.Count -gt 0) { $ipv4Text = $entry.IPv4 -join ', ' }
        $gatewayList = @($entry.Gateway4) + @($entry.Gateway6)
        $gatewayText = 'none'
        if ($gatewayList.Count -gt 0) { $gatewayText = $gatewayList -join ', ' }
        $dnsText = 'none'
        if ($entry.DnsServers.Count -gt 0) { $dnsText = $entry.DnsServers -join ', ' }

        $base = "IPv4 $ipv4Text; gateway $gatewayText; DNS $dnsText; DHCP $($entry.Dhcp)"
        $apipa = @($entry.IPv4 | Where-Object { $_ -like '169.254.*' })

        if (@('Disconnected', 'Disabled', 'Not Present') -contains $entry.AdapterStatus) {
            # Settings on an interface without a link are not in use, and an APIPA address
            # there is expected. Link problems are reported by Get-NdtAdapter.
            $status = 'INFO'
            $summary = "Adapter is $($entry.AdapterStatus.ToLowerInvariant()), so these settings are not in use. Check the link with Get-NdtAdapter. $base"
        }
        elseif ($apipa.Count -gt 0) {
            $status = 'WARN'
            $summary = "APIPA address $($apipa[0]): Windows assigned itself an address because no DHCP server answered. $base"
            if ($anyGateway -and $gatewayList.Count -eq 0) {
                $summary += '. Another interface has a working gateway; if this is a virtual or unused adapter, this can be ignored.'
            }
        }
        elseif ($entry.IPv4.Count -eq 0 -and $entry.IPv6.Count -eq 0) {
            $status = 'WARN'
            $summary = "No IPv4 or global IPv6 address is assigned. $base"
        }
        elseif ($entry.DnsServers.Count -eq 0) {
            $status = 'WARN'
            $summary = "No DNS servers are configured, so names will not resolve. $base"
        }
        elseif ($gatewayList.Count -eq 0) {
            if ($anyGateway) {
                $status = 'INFO'
                $summary = "No default gateway on this interface (normal for virtual or host-only adapters; another interface has one). $base"
            }
            else {
                $status = 'WARN'
                $summary = "No default gateway on any interface: only the local subnet can be reached. $base"
            }
        }
        else {
            $status = 'PASS'
            $summary = $base
        }

        $details = @(
            "Description : $($entry.Description)"
            "Status      : $($entry.AdapterStatus)   MAC: $($entry.Mac)"
            "IPv4        : $ipv4Text"
        )
        if ($entry.IPv6.Count -gt 0) { $details += "IPv6        : $($entry.IPv6 -join ', ')" }
        $details += "Gateway     : $gatewayText"
        $details += "DNS servers : $dnsText"
        $details += "DHCP (IPv4) : $($entry.Dhcp)"

        $data = [ordered]@{
            InterfaceAlias       = $entry.Alias
            InterfaceDescription = $entry.Description
            InterfaceIndex       = $entry.InterfaceIndex
            AdapterStatus        = $entry.AdapterStatus
            MacAddress           = $entry.Mac
            IPv4Address          = [string[]]$entry.IPv4
            IPv6Address          = [string[]]$entry.IPv6
            DefaultGateway       = [string[]]$gatewayList
            DnsServer            = [string[]]$entry.DnsServers
            DhcpEnabled          = $entry.Dhcp
        }

        New-NdtResult -TestType 'IPConfig' -Target $entry.Alias -Status $status -Summary $summary -Details $details -Data $data @override
    }
}

function ConvertTo-NdtAdapterResult {
    [CmdletBinding()]
    [OutputType('NetworkDiagnostics.Result')]
    param(
        [AllowNull()][AllowEmptyCollection()][object[]]$Adapter,
        [string]$Timestamp,
        [string]$SourceComputer
    )

    $override = Get-NdtResultOverride -Timestamp $Timestamp -SourceComputer $SourceComputer

    foreach ($item in @($Adapter)) {
        if ($null -eq $item) { continue }

        $name = [string]$item.Name
        $adapterStatus = [string]$item.Status
        $linkSpeed = [string]$item.LinkSpeed
        $mac = [string]$item.MacAddress
        $media = [string]$item.PhysicalMediaType
        $speedBps = $null
        if ($null -ne $item.Speed) { $speedBps = [uint64]$item.Speed }

        $macText = ''
        if ($mac.Length -gt 0) { $macText = ", MAC $mac" }

        switch ($adapterStatus) {
            'Up' {
                if ($media -eq '802.3' -and $null -ne $speedBps -and $speedBps -gt 0 -and $speedBps -le 100000000) {
                    $status = 'WARN'
                    $summary = "Up at $linkSpeed$macText. A wired link at 100 Mbps or less can mean a damaged cable or a port/NIC that fell back to a lower speed; if both ends support 1 Gbps, try another patch cable or jack."
                }
                else {
                    $status = 'PASS'
                    $summary = "Up at $linkSpeed$macText"
                }
            }
            'Disconnected' {
                $status = 'WARN'
                $summary = "Media disconnected: no link detected$macText. Check the cable and wall jack, or that Wi-Fi is connected."
            }
            'Disabled' {
                $status = 'INFO'
                $summary = "Adapter is disabled in Windows$macText. This toolkit does not enable or change adapters."
            }
            'Not Present' {
                $status = 'INFO'
                $summary = 'Adapter hardware is not present (a driver is installed but the device is missing or removed).'
            }
            default {
                $status = 'WARN'
                $summary = "Adapter status is '$adapterStatus'$macText."
            }
        }

        $details = @(
            "Description : $($item.InterfaceDescription)"
            "Status      : $adapterStatus"
            "Link speed  : $linkSpeed"
            "MAC address : $mac"
            "Media type  : $media"
            "Index       : $($item.ifIndex)   Virtual: $($item.Virtual)"
        )

        $data = [ordered]@{
            AdapterName          = $name
            InterfaceDescription = [string]$item.InterfaceDescription
            AdapterStatus        = $adapterStatus
            LinkSpeed            = $linkSpeed
            SpeedBps             = $speedBps
            MacAddress           = $mac
            PhysicalMediaType    = $media
            InterfaceIndex       = $item.ifIndex
            Virtual              = $item.Virtual
        }

        New-NdtResult -TestType 'Adapter' -Target $name -Status $status -Summary $summary -Details $details -Data $data @override
    }
}
