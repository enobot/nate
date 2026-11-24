function Invoke-NdtQuickCheck {
    <#
    .SYNOPSIS
        Runs the usual first checks for a "can't reach X" ticket: DNS, ping and optional TCP ports.

    .DESCRIPTION
        For each target, Invoke-NdtQuickCheck runs, in order:
          1. DNS A lookup (host names only) with Resolve-NdtDnsName
          2. Ping with Test-NdtPing
          3. TCP port checks with Test-NdtPort, if -Port is given

        Reading the results together usually narrows the problem down:
          DNS FAIL, ping by IP PASS      -> name resolution problem
          ping FAIL, TCP port PASS       -> ICMP is blocked; the service is up
          ping PASS, TCP port Refused    -> host is up; the service is not listening
          everything FAIL                -> check the local connection (Get-NdtIPConfig)

        Pipe the output to New-NdtTicketNote for text you can paste into a ticket.

        Safety: at most 10 targets and 20 TCP checks (hosts x ports) per run.

    .PARAMETER Target
        One or more IP addresses or host names.

    .PARAMETER Port
        Optional TCP ports to check on every target, for example 443 or 80, 443.

    .PARAMETER Count
        Echo requests per target, from 1 to 10. Default 2 to keep the quick check quick.

    .EXAMPLE
        Invoke-NdtQuickCheck -Target intranet.example -Port 443 | Show-NdtResult

        Checks DNS, ping and HTTPS for the intranet server.

    .EXAMPLE
        $results = Invoke-NdtQuickCheck -Target 192.0.2.10, printer01.example -Port 9100
        $results | New-NdtTicketNote

        Checks two devices and prints ticket notes.

    .OUTPUTS
        NetworkDiagnostics.Result objects (DNS, Ping and TcpPort).

    .NOTES
        Read-only. Only the targets you list are contacted.

    .LINK
        New-NdtTicketNote
    #>
    [CmdletBinding()]
    [OutputType('NetworkDiagnostics.Result')]
    param(
        [Parameter(Mandatory, Position = 0)]
        [Alias('ComputerName')]
        [string[]]$Target,

        [ValidateRange(1, 65535)]
        [int[]]$Port,

        [ValidateRange(1, 10)]
        [int]$Count = 2
    )

    $ports = @()
    try {
        $targets = @(Get-NdtValidatedTargetList -Target $Target)
        if ($PSBoundParameters.ContainsKey('Port')) {
            $ports = @(Get-NdtValidatedPortList -Port $Port)
            $null = Get-NdtValidatedTcpCheckCount -TargetCount $targets.Count -PortCount $ports.Count
        }
    }
    catch {
        $PSCmdlet.ThrowTerminatingError($_)
    }

    foreach ($name in $targets) {
        $isAddress = (Test-NdtIPv4Address -Value $name) -or (Test-NdtIPv6Address -Value $name)
        if (-not $isAddress) {
            Resolve-NdtDnsName -Name $name -RecordType 'A'
        }

        Test-NdtPing -Target $name -Count $Count

        if ($ports.Count -gt 0) {
            Test-NdtPort -Target $name -Port $ports
        }
    }
}
