<#
    Turns raw ping replies and TCP connection attempts into result objects.
    These functions do not touch the network, so they are easy to test with fixed input.
#>

function Get-NdtResultOverride {
    <#
        Collects optional -Timestamp / -SourceComputer values so builders can pass them on to
        New-NdtResult. Normal checks leave them empty (current time, this computer); the
        sample-report script uses them to produce fictional reports.
    #>
    [CmdletBinding()]
    [OutputType([hashtable])]
    param(
        [AllowNull()][AllowEmptyString()][string]$Timestamp,
        [AllowNull()][AllowEmptyString()][string]$SourceComputer
    )

    $override = @{}
    if (-not [string]::IsNullOrEmpty($Timestamp)) { $override.Timestamp = $Timestamp }
    if (-not [string]::IsNullOrEmpty($SourceComputer)) { $override.SourceComputer = $SourceComputer }
    return $override
}

function Get-NdtPingStatusAdvice {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [AllowNull()][AllowEmptyString()][string]$Status,
        [int]$TimeoutMs
    )

    switch ($Status) {
        'TimedOut' { return "No reply within $TimeoutMs ms. The device may be off or on another network, or a firewall may be blocking ICMP. Try a TCP port check to the same host." }
        'DestinationHostUnreachable' { return 'Destination host unreachable: the packet could not be delivered (device offline, wrong subnet, or no ARP reply on the local network).' }
        'DestinationNetworkUnreachable' { return 'Destination network unreachable: there is no route to that network. Check the default gateway and IP configuration.' }
        'TtlExpired' { return 'TTL expired in transit: the packet passed through too many routers, which can mean a routing loop.' }
        'BadDestination' { return 'The destination address is not valid for an echo request.' }
        default {
            if ([string]::IsNullOrEmpty($Status)) { return 'No reply.' }
            return "Reply status: $Status."
        }
    }
}

function ConvertTo-NdtPingResult {
    [CmdletBinding()]
    [OutputType('NetworkDiagnostics.Result')]
    param(
        [Parameter(Mandatory)][string]$Target,
        [AllowNull()][AllowEmptyString()][string]$ResolvedAddress,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Reply,
        [int]$TimeoutMs = 1000,
        [string]$Timestamp,
        [string]$SourceComputer
    )

    $override = Get-NdtResultOverride -Timestamp $Timestamp -SourceComputer $SourceComputer
    $sent = @($Reply).Count
    $success = @($Reply | Where-Object { $_.Status -eq 'Success' })
    $received = $success.Count

    $lossPercent = 100
    if ($sent -gt 0) { $lossPercent = [int][math]::Round((($sent - $received) / $sent) * 100) }

    $minMs = $null; $avgMs = $null; $maxMs = $null
    if ($received -gt 0) {
        $times = @($success | ForEach-Object { [double]$_.RoundtripMs })
        $stats = $times | Measure-Object -Minimum -Maximum -Average
        $minMs = [int]$stats.Minimum
        $maxMs = [int]$stats.Maximum
        $avgMs = [int][math]::Round($stats.Average)
    }

    $details = @()
    $index = 0
    foreach ($r in @($Reply)) {
        $index++
        if ($r.Status -eq 'Success') {
            $ttlText = ''
            if ($null -ne $r.Ttl) { $ttlText = " TTL=$($r.Ttl)" }
            $details += "Reply ${index}: Success from $($r.ReplyAddress) time=$($r.RoundtripMs) ms$ttlText"
        }
        else {
            $extra = ''
            if (-not [string]::IsNullOrEmpty($r.Message)) { $extra = " ($($r.Message))" }
            $details += "Reply ${index}: $($r.Status)$extra"
        }
    }

    $addressText = $ResolvedAddress
    if ([string]::IsNullOrEmpty($addressText)) { $addressText = $Target }
    $nameNote = ''
    if ($addressText -ne $Target) { $nameNote = " (resolved to $addressText)" }

    if ($sent -gt 0 -and $received -eq $sent) {
        $status = 'PASS'
        $summary = "$received/$sent replies$nameNote, 0% loss, min/avg/max $minMs/$avgMs/$maxMs ms"
    }
    elseif ($received -gt 0) {
        $status = 'WARN'
        $summary = "$received/$sent replies$nameNote, $lossPercent% loss, avg $avgMs ms. Intermittent loss can point to a bad cable, Wi-Fi interference or a congested link."
    }
    else {
        $status = 'FAIL'
        $failures = @($Reply | Where-Object { $_.Status -ne 'Success' } | ForEach-Object { [string]$_.Status })
        $mostCommon = ''
        if ($failures.Count -gt 0) {
            $mostCommon = ($failures | Group-Object | Sort-Object -Property Count -Descending | Select-Object -First 1).Name
        }
        $advice = Get-NdtPingStatusAdvice -Status $mostCommon -TimeoutMs $TimeoutMs
        $summary = "0/$sent replies$nameNote, 100% loss. $advice"
    }

    $data = [ordered]@{
        ResolvedAddress = $ResolvedAddress
        Sent            = $sent
        Received        = $received
        LossPercent     = $lossPercent
        MinMs           = $minMs
        AverageMs       = $avgMs
        MaxMs           = $maxMs
        TimeoutMs       = $TimeoutMs
        ReplyStatus     = [string[]]@($Reply | ForEach-Object { [string]$_.Status })
    }

    return New-NdtResult -TestType 'Ping' -Target $Target -Status $status -Summary $summary -Details $details -Data $data @override
}

function ConvertTo-NdtPortResult {
    [CmdletBinding()]
    [OutputType('NetworkDiagnostics.Result')]
    param(
        [Parameter(Mandatory)][string]$Target,
        [Parameter(Mandatory)][int]$Port,
        [AllowNull()][AllowEmptyString()][string]$RemoteAddress,
        [Parameter(Mandatory)][object]$Connection,
        [int]$TimeoutMs = 3000,
        [string]$Timestamp,
        [string]$SourceComputer
    )

    $override = Get-NdtResultOverride -Timestamp $Timestamp -SourceComputer $SourceComputer

    $where = $RemoteAddress
    if ([string]::IsNullOrEmpty($where)) { $where = $Target }
    if ($where -ne $Target) { $where = "$Target ($RemoteAddress)" }

    $state = [string]$Connection.State
    $elapsed = $Connection.ElapsedMs

    switch ($state) {
        'Open' {
            $status = 'PASS'
            $summary = "TCP port $Port is open on $where (connected in $elapsed ms)."
        }
        'Refused' {
            $status = 'FAIL'
            $summary = "TCP port $Port refused on ${where}: the host answered, but nothing is listening on that port or a firewall rejected the connection."
        }
        'TimedOut' {
            $status = 'FAIL'
            $summary = "TCP port $Port on $where did not answer within $TimeoutMs ms: a firewall may be dropping the traffic, or the host is offline."
        }
        'Unreachable' {
            $status = 'FAIL'
            $summary = "TCP port $Port on ${where}: host or network unreachable. Check routing and the default gateway."
        }
        'NameResolutionFailed' {
            $status = 'FAIL'
            $summary = "Could not resolve '$Target' to an IP address, so port $Port was not tested. $($Connection.Message)"
        }
        default {
            $status = 'FAIL'
            $summary = "TCP port $Port on ${where}: connection error. $($Connection.Message)"
        }
    }

    $details = @("State: $state", "Elapsed: $elapsed ms (timeout $TimeoutMs ms)")
    if (-not [string]::IsNullOrEmpty($Connection.Message)) { $details += "Message: $($Connection.Message)" }

    $data = [ordered]@{
        Port          = $Port
        RemoteAddress = $RemoteAddress
        State         = $state
        ElapsedMs     = $elapsed
        TimeoutMs     = $TimeoutMs
    }

    return New-NdtResult -TestType 'TcpPort' -Target $Target -Status $status -Summary $summary -Details $details -Data $data @override
}
