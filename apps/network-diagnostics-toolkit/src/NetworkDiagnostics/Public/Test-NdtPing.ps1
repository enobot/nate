function Test-NdtPing {
    <#
    .SYNOPSIS
        Sends ICMP echo requests (ping) to one or more hosts and reports PASS, WARN or FAIL.

    .DESCRIPTION
        Test-NdtPing checks basic reachability the same way ping.exe does, but returns
        structured results that can be saved to CSV and text reports.

        Only replies with a status of Success are counted as received. (ping.exe counts a
        "Destination host unreachable" message from a router as a reply, which can hide a
        real failure.)

        Status meanings:
          PASS  every echo request got a reply
          WARN  some replies were lost (packet loss)
          FAIL  no replies, or the name could not be resolved

        A FAIL does not always mean the device is down: many firewalls block ICMP. Use
        Test-NdtPort to check a TCP service on the same host.

        Safety: at most 10 targets per run, 1-10 echo requests per target, one request at a
        time with a short pause between them. CIDR ranges, address ranges, wildcards,
        broadcast and multicast addresses are rejected.

    .PARAMETER Target
        One or more IP addresses or host names, for example 192.0.2.10 or printer01.example.
        Accepts pipeline input. Duplicates are removed.

    .PARAMETER Count
        Number of echo requests per target, from 1 to 10. Default 4.

    .PARAMETER TimeoutMs
        How long to wait for each reply, in milliseconds, from 100 to 5000. Default 1000.

    .EXAMPLE
        Test-NdtPing -Target 192.0.2.10

        Sends four echo requests to 192.0.2.10 and returns one result object.

    .EXAMPLE
        Test-NdtPing -Target 192.0.2.1, intranet.example -Count 2 | Show-NdtResult

        Pings the gateway and a server twice each and prints [PASS]/[FAIL] lines.

    .EXAMPLE
        'printer01.example', 'printer02.example' | Test-NdtPing -TimeoutMs 2000 | Export-NdtReport

        Pings two printers with a longer timeout and saves CSV and text reports.

    .OUTPUTS
        NetworkDiagnostics.Result (TestType Ping). Extra properties: ResolvedAddress, Sent,
        Received, LossPercent, MinMs, AverageMs, MaxMs, TimeoutMs, ReplyStatus.

    .NOTES
        Uses System.Net.NetworkInformation.Ping so behaviour and output are the same in
        Windows PowerShell 5.1 and PowerShell 7. Read-only.

    .LINK
        Test-NdtPort

    .LINK
        Trace-NdtRoute
    #>
    [CmdletBinding()]
    [OutputType('NetworkDiagnostics.Result')]
    param(
        [Parameter(Mandatory, Position = 0, ValueFromPipeline)]
        [Alias('ComputerName', 'Address')]
        [string[]]$Target,

        [ValidateRange(1, 10)]
        [int]$Count = 4,

        [ValidateRange(100, 5000)]
        [int]$TimeoutMs = 1000
    )

    begin {
        $collected = New-Object 'System.Collections.Generic.List[string]'
    }

    process {
        foreach ($item in $Target) { $collected.Add($item) }
    }

    end {
        # Validate the complete list first so the per-run limit also applies to pipeline input.
        try {
            $targets = @(Get-NdtValidatedTargetList -Target $collected.ToArray())
        }
        catch {
            $PSCmdlet.ThrowTerminatingError($_)
        }

        foreach ($name in $targets) {
            Write-Verbose "Pinging $name ($Count echo requests, timeout $TimeoutMs ms)."

            try {
                $address = Resolve-NdtAddress -Target $name
            }
            catch {
                $message = Get-NdtErrorMessage -ErrorObject $_
                New-NdtResult -TestType 'Ping' -Target $name -Status 'FAIL' `
                    -Summary "Could not resolve '$name' to an IP address: $message Check the spelling or test DNS with Resolve-NdtDnsName." `
                    -Details @("Name resolution error: $message") `
                    -Data ([ordered]@{ ResolvedAddress = $null; Sent = 0; Received = 0; LossPercent = 100; MinMs = $null; AverageMs = $null; MaxMs = $null; TimeoutMs = $TimeoutMs; ReplyStatus = [string[]]@('NameResolutionFailed') })
                continue
            }

            $replies = New-Object 'System.Collections.Generic.List[object]'
            for ($i = 1; $i -le $Count; $i++) {
                try {
                    $replies.Add((Invoke-NdtPing -Address $address -TimeoutMs $TimeoutMs))
                }
                catch {
                    $replies.Add([pscustomobject]@{
                            Status       = 'Error'
                            RoundtripMs  = $null
                            ReplyAddress = $null
                            Ttl          = $null
                            Message      = (Get-NdtErrorMessage -ErrorObject $_)
                        })
                }

                if ($i -lt $Count) {
                    Start-Sleep -Milliseconds $script:NdtSettings.PingIntervalMs
                }
            }

            ConvertTo-NdtPingResult -Target $name -ResolvedAddress $address.ToString() -Reply $replies.ToArray() -TimeoutMs $TimeoutMs
        }
    }
}
