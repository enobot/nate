function Trace-NdtRoute {
    <#
    .SYNOPSIS
        Runs a traceroute to one host and reports each hop and whether the destination was reached.

    .DESCRIPTION
        Trace-NdtRoute runs the built-in Windows tracert.exe with -d (no reverse DNS lookups
        for hops), then turns its output into hop objects:
        hop number, three round-trip times ("<1 ms", "12 ms" or "*" for no reply) and the
        router address.

        Status meanings:
          PASS  the destination answered (some routers in the middle may not reply; that is
                normal because many routers ignore or rate-limit traceroute probes)
          FAIL  the destination was not reached within MaxHops, a router reported the
                destination unreachable, or tracert could not resolve the name

        The last hop that answered is where to start looking: the problem is usually at or
        just after that router.

        Safety: one target per run, 1-30 hops, 100-5000 ms per probe. tracert sends three
        probes per hop, so the worst case runtime is about MaxHops x 3 x TimeoutMs.

    .PARAMETER Target
        One IP address or host name.

    .PARAMETER MaxHops
        Maximum number of hops (routers) to try, from 1 to 30. Default 20.

    .PARAMETER TimeoutMs
        How long tracert waits for each probe reply, in milliseconds, from 100 to 5000.
        Default 1000.

    .EXAMPLE
        Trace-NdtRoute -Target 203.0.113.50

        Traces the path to 203.0.113.50 with up to 20 hops.

    .EXAMPLE
        Trace-NdtRoute -Target intranet.example -MaxHops 10 -TimeoutMs 500 | Show-NdtResult

        Traces a shorter path with a faster timeout and prints the hop table.

    .EXAMPLE
        (Trace-NdtRoute -Target 203.0.113.50).Hops | Format-Table

        Shows the parsed hop objects as a table.

    .OUTPUTS
        NetworkDiagnostics.Result (TestType Traceroute). Extra properties: DestinationAddress,
        Reached, HopCount, SilentHopCount, MaxHops, TimeoutMs, Hops.

    .NOTES
        tracert.exe was chosen over Test-NetConnection -TraceRoute because tracert reports
        per-hop round-trip times and timeouts, finishes quickly when the target is close, and
        is the same tool technicians already know. Test-NetConnection -TraceRoute returns only
        a list of hop addresses and runs a ping test first. The parser uses only numbers,
        "ms", "*" and IP addresses, which do not change with the Windows display language.
        Read-only.

    .LINK
        Test-NdtPing
    #>
    [CmdletBinding()]
    [OutputType('NetworkDiagnostics.Result')]
    param(
        [Parameter(Mandatory, Position = 0)]
        [Alias('ComputerName')]
        [string]$Target,

        [ValidateRange(1, 30)]
        [int]$MaxHops = 20,

        [ValidateRange(100, 5000)]
        [int]$TimeoutMs = 1000
    )

    try {
        $name = Get-NdtValidatedTarget -Target $Target
    }
    catch {
        $PSCmdlet.ThrowTerminatingError($_)
    }

    $worstCaseSeconds = [math]::Ceiling(($MaxHops * 3 * $TimeoutMs) / 1000)
    Write-Verbose "Tracing route to $name (max $MaxHops hops, $TimeoutMs ms per probe, worst case about $worstCaseSeconds s)."

    try {
        $run = Invoke-NdtTracert -Target $name -MaxHops $MaxHops -TimeoutMs $TimeoutMs
    }
    catch {
        $message = Get-NdtErrorMessage -ErrorObject $_
        return New-NdtResult -TestType 'Traceroute' -Target $name -Status 'FAIL' `
            -Summary "Could not run tracert: $message" `
            -Details @("Error: $message") `
            -Data ([ordered]@{ DestinationAddress = $null; Reached = $false; HopCount = 0; SilentHopCount = 0; MaxHops = $MaxHops; TimeoutMs = $TimeoutMs; Hops = @() })
    }

    $parsed = ConvertFrom-NdtTracertOutput -Line $run.Lines -Target $name
    return ConvertTo-NdtTraceResult -Target $name -Parsed $parsed -MaxHops $MaxHops -TimeoutMs $TimeoutMs
}
