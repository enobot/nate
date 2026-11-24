<#
    Helpers for DNS lookups made with Resolve-DnsName (DnsClient module).

    Things Resolve-DnsName does that the toolkit has to handle:
      - When a name exists but has no record of the requested type, it does not throw.
        It returns only the zone's SOA record in the "Authority" section.
      - NS and some other queries add "Additional" section records (glue A records).
      - Answers from the hosts file or the local resolver (for example "localhost")
        are returned in the "Question" section.
      - Failures are Win32 errors: 9003 = name does not exist (NXDOMAIN), 1460 = timeout,
        9002 = server failure, 9501 = no records, 10054 = connection reset (nothing
        listening on port 53 at the chosen server).
    All record data comes from outside this computer, so it is treated as untrusted text.
#>

function Get-NdtDnsAnswerRecord {
    [CmdletBinding()]
    [OutputType([object[]])]
    param(
        [AllowNull()][AllowEmptyCollection()][object[]]$Record
    )

    $answers = @()
    foreach ($r in @($Record)) {
        if ($null -eq $r) { continue }
        $section = ''
        if ($r.PSObject.Properties['Section']) { $section = [string]$r.Section }
        if ($section -eq 'Authority' -or $section -eq 'Additional') { continue }
        $answers += $r
    }
    return $answers
}

function Format-NdtDnsRecord {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][object]$Record
    )

    $type = [string]$Record.Type
    switch ($type) {
        'A' { $text = "A $($Record.IPAddress)" }
        'AAAA' { $text = "AAAA $($Record.IPAddress)" }
        'CNAME' { $text = "CNAME $($Record.Name) -> $($Record.NameHost)" }
        'PTR' { $text = "PTR $($Record.NameHost)" }
        'NS' { $text = "NS $($Record.NameHost)" }
        'MX' { $text = "MX preference $($Record.Preference) $($Record.NameExchange)" }
        'TXT' { $text = 'TXT "' + ((@($Record.Strings)) -join '') + '"' }
        'SOA' { $text = "SOA primary $($Record.PrimaryServer), admin $($Record.NameAdministrator), serial $($Record.SerialNumber)" }
        'SRV' { $text = "SRV priority $($Record.Priority) weight $($Record.Weight) port $($Record.Port) $($Record.NameTarget)" }
        default { $text = "$type $($Record.Name)" }
    }

    if ($Record.PSObject.Properties['TTL'] -and $null -ne $Record.TTL) {
        $text += " (TTL $($Record.TTL)s)"
    }
    return (ConvertTo-NdtSafeText -Text $text -MaxLength 300)
}

function Get-NdtDnsFailure {
    <#
        Maps a Resolve-DnsName error to a short category and an explanation.
    #>
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory)][object]$ErrorRecord
    )

    $code = $null
    $exception = $null
    if ($ErrorRecord -is [System.Management.Automation.ErrorRecord]) { $exception = $ErrorRecord.Exception }
    elseif ($ErrorRecord -is [System.Exception]) { $exception = $ErrorRecord }

    $probe = $exception
    while ($null -ne $probe) {
        if ($probe -is [System.ComponentModel.Win32Exception]) { $code = $probe.NativeErrorCode; break }
        $probe = $probe.InnerException
    }

    $errorId = ''
    if ($ErrorRecord -is [System.Management.Automation.ErrorRecord]) { $errorId = [string]$ErrorRecord.FullyQualifiedErrorId }

    if ($code -eq 9003 -or $errorId -like 'DNS_ERROR_RCODE_NAME_ERROR*') {
        return [pscustomobject]@{ Category = 'NXDOMAIN'; Code = 9003; Message = 'Name does not exist (NXDOMAIN). Check the spelling, or the record may not have been created.' }
    }
    if ($code -eq 1460 -or $errorId -like 'ERROR_TIMEOUT*') {
        return [pscustomobject]@{ Category = 'Timeout'; Code = 1460; Message = 'The DNS query timed out. The DNS server may be unreachable or not answering.' }
    }
    if ($code -eq 9002 -or $errorId -like 'DNS_ERROR_RCODE_SERVER_FAILURE*') {
        return [pscustomobject]@{ Category = 'ServerFailure'; Code = 9002; Message = 'The DNS server reported a failure (SERVFAIL) for this name.' }
    }
    if ($code -eq 9005 -or $errorId -like 'DNS_ERROR_RCODE_REFUSED*') {
        return [pscustomobject]@{ Category = 'Refused'; Code = 9005; Message = 'The DNS server refused the query.' }
    }
    if ($code -eq 9501 -or $code -eq 9701 -or $errorId -like 'DNS_INFO_NO_RECORDS*') {
        return [pscustomobject]@{ Category = 'NoRecords'; Code = $code; Message = 'The name exists but has no records of the requested type.' }
    }
    if ($code -eq 10054) {
        return [pscustomobject]@{ Category = 'ConnectionReset'; Code = 10054; Message = 'The chosen server reset the connection. It may not be running a DNS service on port 53.' }
    }

    return [pscustomobject]@{ Category = 'Error'; Code = $code; Message = (Get-NdtErrorMessage -ErrorObject $ErrorRecord) }
}

function ConvertTo-NdtDnsResult {
    [CmdletBinding()]
    [OutputType('NetworkDiagnostics.Result')]
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$RecordType,
        [AllowNull()][AllowEmptyString()][string]$Server,
        [AllowNull()][AllowEmptyCollection()][object[]]$Record,
        [AllowNull()][object]$Failure,
        [long]$QueryMs = 0,
        [string]$Timestamp,
        [string]$SourceComputer
    )

    $override = Get-NdtResultOverride -Timestamp $Timestamp -SourceComputer $SourceComputer
    $serverText = $Server
    if ([string]::IsNullOrEmpty($serverText)) { $serverText = 'system default (see IP configuration)' }

    $details = @("Query: $RecordType $Name", "Server: $serverText", "Query time: $QueryMs ms")
    $formatted = @()

    if ($null -ne $Failure) {
        $status = 'FAIL'
        $summary = "$RecordType lookup for $Name failed: $($Failure.Message)"
        $details += "Error: $($Failure.Category) $($Failure.Code)"
        $category = $Failure.Category
    }
    else {
        $answers = @(Get-NdtDnsAnswerRecord -Record $Record)
        foreach ($answer in $answers) { $formatted += (Format-NdtDnsRecord -Record $answer) }

        if ($answers.Count -gt 0) {
            $status = 'PASS'
            $preview = (@($formatted | Select-Object -First 3) -join '; ')
            if ($answers.Count -gt 3) { $preview += '; ...' }
            $summary = "$RecordType lookup for $Name returned $($answers.Count) record(s) in $QueryMs ms: $preview"
            $category = 'Answer'
        }
        else {
            $status = 'FAIL'
            $summary = "$RecordType lookup for $Name returned no $RecordType records. The name exists, but has no record of that type."
            $category = 'NoRecords'
        }
        foreach ($line in $formatted) { $details += "Record: $line" }
    }

    $data = [ordered]@{
        RecordType  = $RecordType
        Server      = $Server
        Records     = [string[]]$formatted
        RecordCount = $formatted.Count
        QueryMs     = $QueryMs
        Outcome     = $category
    }

    return New-NdtResult -TestType 'DNS' -Target $Name -Status $status -Summary $summary -Details $details -Data $data @override
}
