#Requires -Version 5.1
<#
.SYNOPSIS
    Regenerates the fictional sample reports in the samples folder.

.DESCRIPTION
    Builds result objects from made-up input with the module's own result builders (the
    same functions the real checks use to turn ping replies, tracert output, DNS answers,
    IP configuration and adapter data into results), then saves them with Export-NdtReport
    and New-NdtTicketNote.

    No network traffic is sent. Every address, name and MAC address is reserved for
    documentation:
      IPv4  192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24   (RFC 5737)
      MAC   00-00-5E-00-53-00 to 00-00-5E-00-53-FF          (RFC 7042)
      Names *.example                                       (RFC 2606)

    Scenario: a user on EXAMPLE-HELPDESK-01 cannot open intranet.example. The server
    answers by IP address, but the configured DNS server does not answer at all.

.EXAMPLE
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\New-SampleReport.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$samplesDir = Join-Path -Path $repoRoot -ChildPath 'samples'
$module = Import-Module -Name (Join-Path -Path $repoRoot -ChildPath 'src\NetworkDiagnostics\NetworkDiagnostics.psd1') -Force -PassThru

# Replace only the files this script produces.
foreach ($name in 'sample-report.csv', 'sample-report.txt', 'sample-ticket-note.txt') {
    $path = Join-Path -Path $samplesDir -ChildPath $name
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
}

$results = & $module {
    $pc = 'EXAMPLE-HELPDESK-01'
    $t = 0

    # Fictional check times: 2026-11-20 09:14:02 (UTC-08:00) plus the given number of seconds.
    function Get-SampleTime {
        param([int]$Seconds)
        $sampleStart = [datetimeoffset]::new(2026, 11, 20, 9, 14, 2, [timespan]::FromHours(-8))
        $sampleStart.AddSeconds($Seconds).ToString('yyyy-MM-ddTHH:mm:sszzz', [System.Globalization.CultureInfo]::InvariantCulture)
    }

    function Get-SampleReply {
        param([string]$Status, [int]$Ms, [string]$From)
        [pscustomobject]@{ Status = $Status; RoundtripMs = $Ms; ReplyAddress = $From; Ttl = 63; Message = '' }
    }

    # 1. IP configuration of the user's PC
    $ipConfig = [pscustomobject]@{
        InterfaceAlias       = 'Ethernet'
        InterfaceDescription = 'Example Gigabit Network Connection'
        InterfaceIndex       = 12
        IPv4Address          = @([pscustomobject]@{ IPAddress = '192.0.2.25'; PrefixLength = 24 })
        IPv6Address          = @()
        IPv4DefaultGateway   = @([pscustomobject]@{ NextHop = '192.0.2.1' })
        IPv6DefaultGateway   = @()
        DNSServer            = @([pscustomobject]@{ AddressFamily = 2; ServerAddresses = @('198.51.100.53') })
        NetIPv4Interface     = [pscustomobject]@{ Dhcp = 'Enabled' }
        NetAdapter           = [pscustomobject]@{ Status = 'Up'; MacAddress = '00-00-5E-00-53-25' }
    }
    ConvertTo-NdtIPConfigResult -Configuration @($ipConfig) -Timestamp (Get-SampleTime $t) -SourceComputer $pc

    # 2-3. Network adapters
    $t += 3
    $adapters = @(
        [pscustomobject]@{ Name = 'Ethernet'; InterfaceDescription = 'Example Gigabit Network Connection'; Status = 'Up'; LinkSpeed = '1 Gbps'; Speed = 1000000000; MacAddress = '00-00-5E-00-53-25'; PhysicalMediaType = '802.3'; ifIndex = 12; Virtual = $false }
        [pscustomobject]@{ Name = 'Wi-Fi'; InterfaceDescription = 'Example Wireless Adapter'; Status = 'Disconnected'; LinkSpeed = '0 bps'; Speed = $null; MacAddress = '00-00-5E-00-53-26'; PhysicalMediaType = 'Native 802.11'; ifIndex = 15; Virtual = $false }
    )
    ConvertTo-NdtAdapterResult -Adapter $adapters -Timestamp (Get-SampleTime $t) -SourceComputer $pc

    # 4. Ping the default gateway
    $t += 2
    $gatewayReplies = @(1, 2, 1, 1 | ForEach-Object { Get-SampleReply -Status 'Success' -Ms $_ -From '192.0.2.1' })
    ConvertTo-NdtPingResult -Target '192.0.2.1' -ResolvedAddress '192.0.2.1' -Reply $gatewayReplies -Timestamp (Get-SampleTime $t) -SourceComputer $pc

    # 5. DNS lookup for the intranet name times out
    $t += 4
    $dnsFailure = [pscustomobject]@{ Category = 'Timeout'; Code = 1460; Message = 'The DNS query timed out. The DNS server may be unreachable or not answering.' }
    ConvertTo-NdtDnsResult -Name 'intranet.example' -RecordType 'A' -Failure $dnsFailure -QueryMs 4012 -Timestamp (Get-SampleTime $t) -SourceComputer $pc

    # 6-7. The intranet server itself answers by IP address
    $t += 5
    $serverReplies = @(9, 8, 9, 10 | ForEach-Object { Get-SampleReply -Status 'Success' -Ms $_ -From '203.0.113.50' })
    ConvertTo-NdtPingResult -Target '203.0.113.50' -ResolvedAddress '203.0.113.50' -Reply $serverReplies -Timestamp (Get-SampleTime $t) -SourceComputer $pc
    $t += 4
    ConvertTo-NdtPortResult -Target '203.0.113.50' -Port 443 -RemoteAddress '203.0.113.50' -Connection ([pscustomobject]@{ State = 'Open'; ElapsedMs = 11; Message = 'TCP handshake completed.' }) -TimeoutMs 3000 -Timestamp (Get-SampleTime $t) -SourceComputer $pc

    # 8-9. The DNS server does not answer ping or TCP 53
    $t += 2
    $dnsServerReplies = @(1..4 | ForEach-Object { Get-SampleReply -Status 'TimedOut' -Ms 0 -From $null })
    ConvertTo-NdtPingResult -Target '198.51.100.53' -ResolvedAddress '198.51.100.53' -Reply $dnsServerReplies -TimeoutMs 1000 -Timestamp (Get-SampleTime $t) -SourceComputer $pc
    $t += 6
    ConvertTo-NdtPortResult -Target '198.51.100.53' -Port 53 -RemoteAddress '198.51.100.53' -Connection ([pscustomobject]@{ State = 'TimedOut'; ElapsedMs = 3001; Message = 'No response within 3000 ms.' }) -TimeoutMs 3000 -Timestamp (Get-SampleTime $t) -SourceComputer $pc

    # 10. Traceroute to the DNS server stops after the campus router (tracert -d layout)
    $t += 4
    $tracertText = @(
        ''
        'Tracing route to 198.51.100.53 over a maximum of 8 hops'
        ''
        '  1    <1 ms    <1 ms    <1 ms  192.0.2.1 '
        '  2     2 ms     2 ms     3 ms  198.51.100.1 '
        '  3     *        *        *     Request timed out.'
        '  4     *        *        *     Request timed out.'
        '  5     *        *        *     Request timed out.'
        '  6     *        *        *     Request timed out.'
        '  7     *        *        *     Request timed out.'
        '  8     *        *        *     Request timed out.'
        ''
        'Trace complete.'
    )
    $parsed = ConvertFrom-NdtTracertOutput -Line $tracertText -Target '198.51.100.53'
    ConvertTo-NdtTraceResult -Target '198.51.100.53' -Parsed $parsed -MaxHops 8 -TimeoutMs 1000 -Timestamp (Get-SampleTime $t) -SourceComputer $pc
}

$title = 'SAMPLE - fictional data - INC0000000 user cannot open intranet.example'
$files = @($results | Export-NdtReport -OutputDirectory $samplesDir -BaseName 'sample-report' -Title $title)
$note = $results | New-NdtTicketNote -Title $title
$notePath = Join-Path -Path $samplesDir -ChildPath 'sample-ticket-note.txt'
[System.IO.File]::WriteAllText($notePath, $note + "`r`n", (New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false))

$files | ForEach-Object { "Wrote $($_.FullName)" }
"Wrote $notePath"
