function Resolve-NdtDnsName {
    <#
    .SYNOPSIS
        Looks up DNS records for one or more names and reports PASS or FAIL with the answers.

    .DESCRIPTION
        Resolve-NdtDnsName uses Resolve-DnsName (DnsClient module) to query a record type for
        each name. It separates the different ways a lookup can fail, because they point to
        different problems:

          NXDOMAIN     the name does not exist (typo, or the record was never created)
          NoRecords    the name exists but has no record of that type (for example no AAAA)
          Timeout      the DNS server did not answer (server down or unreachable)
          ServerFailure / Refused / ConnectionReset   a problem at the DNS server

        If an IP address is given, a reverse (PTR) lookup is done automatically.

        Use -Server to ask a specific DNS server, for example to compare the campus DNS
        server with another one. Use -DnsOnly to skip the hosts file, LLMNR and NetBIOS and
        query DNS servers only.

        Safety: at most 10 names per run. Record data comes from outside sources and is
        cleaned of control characters before it is shown or saved.

    .PARAMETER Name
        One or more DNS names (for example intranet.example or _ldap._tcp.example.com) or IP
        addresses for reverse lookups.

    .PARAMETER RecordType
        Record type to query: A, AAAA, CNAME, MX, NS, PTR, SOA, SRV or TXT. Default A.
        Ignored for IP addresses, which always use PTR.

    .PARAMETER Server
        Optional DNS server (IP address or host name) to send the query to. When omitted,
        the DNS servers from this computer's IP configuration are used.

    .PARAMETER DnsOnly
        Query DNS servers only; do not use the hosts file, LLMNR or NetBIOS.

    .EXAMPLE
        Resolve-NdtDnsName -Name intranet.example

        Looks up the A (IPv4) record for intranet.example.

    .EXAMPLE
        Resolve-NdtDnsName -Name example.com -RecordType MX | Show-NdtResult

        Shows the mail servers for example.com.

    .EXAMPLE
        Resolve-NdtDnsName -Name intranet.example -Server 198.51.100.53 -DnsOnly

        Asks one specific DNS server, skipping the hosts file and local name resolution.

    .EXAMPLE
        Resolve-NdtDnsName -Name 192.0.2.10

        Performs a reverse (PTR) lookup for an IP address.

    .OUTPUTS
        NetworkDiagnostics.Result (TestType DNS). Extra properties: RecordType, Server,
        Records, RecordCount, QueryMs, Outcome.

    .NOTES
        Ping and TCP checks resolve names with the Windows resolver (hosts file + DNS),
        while this command queries DNS through Resolve-DnsName. If a name works in a browser
        but fails here with -DnsOnly, check the hosts file. Read-only.

    .LINK
        Test-NdtPing
    #>
    [CmdletBinding()]
    [OutputType('NetworkDiagnostics.Result')]
    param(
        [Parameter(Mandatory, Position = 0, ValueFromPipeline)]
        [Alias('Target')]
        [string[]]$Name,

        [ValidateSet('A', 'AAAA', 'CNAME', 'MX', 'NS', 'PTR', 'SOA', 'SRV', 'TXT')]
        [string]$RecordType = 'A',

        [string]$Server,

        [switch]$DnsOnly
    )

    begin {
        $collected = New-Object 'System.Collections.Generic.List[string]'
    }

    process {
        foreach ($item in $Name) { $collected.Add($item) }
    }

    end {
        $serverName = $null
        try {
            $names = @(Get-NdtValidatedTargetList -Target $collected.ToArray() -Kind 'DnsName')
            if ($PSBoundParameters.ContainsKey('Server')) {
                $serverName = Get-NdtValidatedTarget -Target $Server
            }
        }
        catch {
            $PSCmdlet.ThrowTerminatingError($_)
        }

        foreach ($queryName in $names) {
            $type = $RecordType
            if ((Test-NdtIPv4Address -Value $queryName) -or (Test-NdtIPv6Address -Value $queryName)) {
                $type = 'PTR'
            }

            $query = @{
                Name        = $queryName
                Type        = $type
                ErrorAction = 'Stop'
            }
            if ($serverName) { $query.Server = $serverName }
            if ($DnsOnly) { $query.DnsOnly = $true }

            Write-Verbose "Resolving $type $queryName."
            $timer = [System.Diagnostics.Stopwatch]::StartNew()
            $records = $null
            $failure = $null
            try {
                $records = @(Resolve-DnsName @query)
            }
            catch {
                $failure = Get-NdtDnsFailure -ErrorRecord $_
            }
            $timer.Stop()

            ConvertTo-NdtDnsResult -Name $queryName -RecordType $type -Server $serverName -Record $records -Failure $failure -QueryMs $timer.ElapsedMilliseconds
        }
    }
}
