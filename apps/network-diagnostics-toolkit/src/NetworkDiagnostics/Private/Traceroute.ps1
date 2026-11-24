<#
    Parses tracert.exe output into hop objects and builds the traceroute result.

    Typical tracert -d output (English Windows):

      Tracing route to 203.0.113.50 over a maximum of 20 hops

        1    <1 ms    <1 ms    <1 ms  192.0.2.1
        2     *        *        *     Request timed out.
        3     9 ms     8 ms     9 ms  203.0.113.50

      Trace complete.

    The parser relies on the parts that do not change with the Windows display language:
    the hop number, the three probe columns ("<1 ms", "12 ms" or "*") and the IP address.
    The header and footer sentences are translated on non-English Windows, so they are not
    used for decisions, except that a bracketed address in the header ("[203.0.113.50]") is
    read when the target was a host name.
#>

$script:NdtProbePattern = '(\*|<?\d+\s*ms)'

function ConvertFrom-NdtTracertOutput {
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param(
        [AllowNull()][AllowEmptyCollection()][string[]]$Line,
        [Parameter(Mandatory)][string]$Target
    )

    $hopPattern = '\A\s*(?<hop>\d{1,3})\s+(?<p1>' + $script:NdtProbePattern + ')\s+(?<p2>' + $script:NdtProbePattern + ')\s+(?<p3>' + $script:NdtProbePattern + ')\s+(?<rest>.*?)\s*\z'
    $reportPattern = '\A\s*(?<hop>\d{1,3})\s+(?<ip>[0-9A-Fa-f:.%]+)\s+(?<rest>.+?)\s*\z'

    $hops = New-Object 'System.Collections.Generic.List[object]'
    $destination = $null
    $otherLines = New-Object 'System.Collections.Generic.List[string]'

    foreach ($raw in @($Line)) {
        if ($null -eq $raw) { continue }
        $text = [string]$raw
        if ($text.Trim().Length -eq 0) { continue }

        if ($hops.Count -eq 0 -and $null -eq $destination -and $text -match '\[(?<ip>[0-9A-Fa-f:.%]+)\]') {
            $headerIp = $null
            if ([System.Net.IPAddress]::TryParse($Matches['ip'], [ref]$headerIp)) {
                $destination = $headerIp.ToString()
            }
        }

        if ($text -match $hopPattern) {
            $hopNumber = [int]$Matches['hop']
            $probes = @($Matches['p1'], $Matches['p2'], $Matches['p3']) | ForEach-Object { ($_ -replace '\s+', ' ').Trim() }
            $rest = $Matches['rest'].Trim()

            $address = $null
            $note = ''
            $firstToken = ($rest -split '\s+')[0]
            $parsedIp = $null
            if ($firstToken -and [System.Net.IPAddress]::TryParse($firstToken.TrimEnd(':'), [ref]$parsedIp)) {
                $address = $parsedIp.ToString()
                $note = $rest.Substring($firstToken.Length).Trim()
            }
            else {
                $note = $rest
            }

            $timedOut = @($probes | Where-Object { $_ -eq '*' }).Count
            $hops.Add([pscustomobject]@{
                    Hop           = $hopNumber
                    Probe1        = $probes[0]
                    Probe2        = $probes[1]
                    Probe3        = $probes[2]
                    Address       = $address
                    TimedOutCount = $timedOut
                    Note          = (ConvertTo-NdtSafeText -Text $note -MaxLength 200)
                })
            continue
        }

        if ($text -match $reportPattern) {
            # Lines such as "  2  192.0.2.1  reports: Destination host unreachable."
            $reportIp = $null
            if ([System.Net.IPAddress]::TryParse($Matches['ip'], [ref]$reportIp)) {
                $hops.Add([pscustomobject]@{
                        Hop           = [int]$Matches['hop']
                        Probe1        = ''
                        Probe2        = ''
                        Probe3        = ''
                        Address       = $reportIp.ToString()
                        TimedOutCount = 0
                        Note          = (ConvertTo-NdtSafeText -Text $Matches['rest'] -MaxLength 200)
                    })
                continue
            }
        }

        $otherLines.Add((ConvertTo-NdtSafeText -Text $text -MaxLength 300))
    }

    if ($null -eq $destination) {
        $targetIp = $null
        if ([System.Net.IPAddress]::TryParse($Target, [ref]$targetIp)) {
            $destination = $targetIp.ToString()
        }
    }

    $reached = $false
    if ($null -ne $destination) {
        foreach ($hop in $hops) {
            if ($hop.Address -eq $destination -and [string]::IsNullOrEmpty($hop.Note)) {
                $reached = $true
                break
            }
        }
    }

    return [pscustomobject]@{
        DestinationAddress = $destination
        Hops               = $hops.ToArray()
        Reached            = $reached
        OtherLines         = $otherLines.ToArray()
    }
}

function ConvertTo-NdtTraceResult {
    [CmdletBinding()]
    [OutputType('NetworkDiagnostics.Result')]
    param(
        [Parameter(Mandatory)][string]$Target,
        [Parameter(Mandatory)][object]$Parsed,
        [int]$MaxHops = 20,
        [int]$TimeoutMs = 1000,
        [string]$Timestamp,
        [string]$SourceComputer
    )

    $override = Get-NdtResultOverride -Timestamp $Timestamp -SourceComputer $SourceComputer
    $hops = @($Parsed.Hops)
    $silentHops = @($hops | Where-Object { $_.TimedOutCount -eq 3 })

    $details = @()
    if ($hops.Count -gt 0) {
        $details += ('{0,-4} {1,-8} {2,-8} {3,-8} {4}' -f 'Hop', 'Probe 1', 'Probe 2', 'Probe 3', 'Address / note')
        foreach ($hop in $hops) {
            $addressText = $hop.Address
            if ([string]::IsNullOrEmpty($addressText)) { $addressText = '(no reply)' }
            if (-not [string]::IsNullOrEmpty($hop.Note) -and -not [string]::IsNullOrEmpty($hop.Address)) {
                $addressText = "$addressText $($hop.Note)"
            }
            $details += ('{0,-4} {1,-8} {2,-8} {3,-8} {4}' -f $hop.Hop, $hop.Probe1, $hop.Probe2, $hop.Probe3, $addressText)
        }
    }

    $destinationText = $Parsed.DestinationAddress
    if ([string]::IsNullOrEmpty($destinationText)) { $destinationText = $Target }

    if ($hops.Count -eq 0) {
        $status = 'FAIL'
        $message = 'tracert returned no hops.'
        $firstOther = @($Parsed.OtherLines | Where-Object { $_.Length -gt 0 }) | Select-Object -First 1
        if ($firstOther) { $message = "tracert returned no hops: $firstOther" }
        $summary = $message
        $details += @($Parsed.OtherLines)
    }
    elseif ($Parsed.Reached) {
        $status = 'PASS'
        $lastHop = ($hops | Where-Object { $_.Address -eq $Parsed.DestinationAddress } | Select-Object -First 1).Hop
        $summary = "Reached $destinationText in $lastHop hop(s)."
        if ($silentHops.Count -gt 0) {
            $summary += " $($silentHops.Count) hop(s) did not reply; routers often ignore traceroute probes, so this alone is not a fault."
        }
    }
    else {
        $status = 'FAIL'
        $reporting = @($hops | Where-Object { -not [string]::IsNullOrEmpty($_.Address) -and -not [string]::IsNullOrEmpty($_.Note) }) | Select-Object -Last 1
        $responding = @($hops | Where-Object { -not [string]::IsNullOrEmpty($_.Address) }) | Select-Object -Last 1
        if ($reporting) {
            $summary = "Did not reach $destinationText. Hop $($reporting.Hop) ($($reporting.Address)) reported: $($reporting.Note)"
        }
        elseif ($responding) {
            $summary = "Did not reach $destinationText within $MaxHops hops. Last hop that answered: hop $($responding.Hop) ($($responding.Address)). The problem is likely at or after that point."
        }
        else {
            $summary = "Did not reach $destinationText and no hop answered. Check the local connection and default gateway first."
        }
    }

    $data = [ordered]@{
        DestinationAddress = $Parsed.DestinationAddress
        Reached            = [bool]$Parsed.Reached
        HopCount           = $hops.Count
        SilentHopCount     = $silentHops.Count
        MaxHops            = $MaxHops
        TimeoutMs          = $TimeoutMs
        Hops               = $hops
    }

    return New-NdtResult -TestType 'Traceroute' -Target $Target -Status $status -Summary $summary -Details $details -Data $data @override
}
