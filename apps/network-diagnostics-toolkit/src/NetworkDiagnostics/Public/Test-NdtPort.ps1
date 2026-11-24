function Test-NdtPort {
    <#
    .SYNOPSIS
        Checks whether specific TCP ports accept connections on one or more hosts.

    .DESCRIPTION
        Test-NdtPort makes one normal TCP connection attempt to each host and port you list,
        then closes it straight away. No data is sent. It answers questions like "is the web
        server listening on 443?" or "is RDP (3389) blocked between here and the server?".

        Results:
          PASS  Open      - the TCP handshake completed
          FAIL  Refused   - the host answered but nothing is listening (or a firewall rejected it)
          FAIL  TimedOut  - no answer in time: often a firewall silently dropping traffic,
                            or the host is offline
          FAIL  Unreachable / Error / name resolution failure

        A TCP check is useful when ping fails: a server can block ICMP and still accept
        connections on its service port.

        Safety: at most 10 hosts and 20 distinct ports per run, and at most 20 checks in
        total (hosts x ports). Port ranges are not accepted. This is not a port scanner.

    .PARAMETER Target
        One or more IP addresses or host names. Host names are resolved with the Windows
        resolver; when a name has IPv4 and IPv6 addresses, the IPv4 address is tested.

    .PARAMETER Port
        One or more TCP port numbers (1-65535), for example 443 or 80, 443, 3389.

    .PARAMETER TimeoutMs
        How long to wait for each connection, in milliseconds, from 500 to 10000.
        Default 3000. Windows takes about 2 seconds to report a refused connection, so very
        short timeouts can report a closed port as TimedOut.

    .EXAMPLE
        Test-NdtPort -Target 192.0.2.20 -Port 443

        Checks whether 192.0.2.20 accepts connections on HTTPS (443).

    .EXAMPLE
        Test-NdtPort -Target fileserver.example -Port 445, 3389 | Show-NdtResult

        Checks SMB and RDP on a file server and prints the results.

    .EXAMPLE
        Test-NdtPort -Target 192.0.2.20, 192.0.2.21 -Port 22 -TimeoutMs 5000

        Checks SSH on two hosts, waiting up to 5 seconds for each.

    .OUTPUTS
        NetworkDiagnostics.Result (TestType TcpPort), one per host and port. Extra
        properties: Port, RemoteAddress, State, ElapsedMs, TimeoutMs.

    .NOTES
        Uses System.Net.Sockets.TcpClient with an explicit timeout instead of
        Test-NetConnection -Port, which has no timeout setting and is slow on closed or
        filtered ports. Read-only.

    .LINK
        Test-NdtPing
    #>
    [CmdletBinding()]
    [OutputType('NetworkDiagnostics.Result')]
    param(
        [Parameter(Mandatory, Position = 0, ValueFromPipeline)]
        [Alias('ComputerName')]
        [string[]]$Target,

        [Parameter(Mandatory, Position = 1)]
        [ValidateRange(1, 65535)]
        [int[]]$Port,

        [ValidateRange(500, 10000)]
        [int]$TimeoutMs = 3000
    )

    begin {
        $collected = New-Object 'System.Collections.Generic.List[string]'
    }

    process {
        foreach ($item in $Target) { $collected.Add($item) }
    }

    end {
        try {
            $targets = @(Get-NdtValidatedTargetList -Target $collected.ToArray())
            $ports = @(Get-NdtValidatedPortList -Port $Port)
            $null = Get-NdtValidatedTcpCheckCount -TargetCount $targets.Count -PortCount $ports.Count
        }
        catch {
            $PSCmdlet.ThrowTerminatingError($_)
        }

        foreach ($name in $targets) {
            $address = $null
            $resolveError = $null
            try {
                $address = Resolve-NdtAddress -Target $name
            }
            catch {
                $resolveError = Get-NdtErrorMessage -ErrorObject $_
            }

            foreach ($p in $ports) {
                if ($null -eq $address) {
                    $connection = [pscustomobject]@{ State = 'NameResolutionFailed'; ElapsedMs = 0; Message = $resolveError }
                    ConvertTo-NdtPortResult -Target $name -Port $p -RemoteAddress $null -Connection $connection -TimeoutMs $TimeoutMs
                    continue
                }

                Write-Verbose "Connecting to $address port $p (timeout $TimeoutMs ms)."
                try {
                    $connection = Invoke-NdtTcpConnect -Address $address -Port $p -TimeoutMs $TimeoutMs
                }
                catch {
                    $connection = [pscustomobject]@{ State = 'Error'; ElapsedMs = 0; Message = (Get-NdtErrorMessage -ErrorObject $_) }
                }
                ConvertTo-NdtPortResult -Target $name -Port $p -RemoteAddress $address.ToString() -Connection $connection -TimeoutMs $TimeoutMs
            }
        }
    }
}
