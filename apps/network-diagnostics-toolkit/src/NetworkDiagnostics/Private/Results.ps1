<#
    Shared result object and text helpers.

    Every check returns objects with the same core properties so they can be mixed in one
    report, one CSV file and one block of ticket notes:

      Timestamp       ISO 8601 local time with UTC offset, e.g. 2026-11-22T09:14:02-08:00
      SourceComputer  the computer the check ran from
      TestType        Ping | Traceroute | DNS | TcpPort | IPConfig | Adapter
      Target          what was tested (host, DNS name, interface or adapter name)
      Status          PASS | FAIL | WARN | INFO
      Summary         one line in plain language
      Details         string[] of extra lines for the console and text report

    Check-specific properties (for example AverageMs on ping results) are added after these.
#>

function Get-NdtTimestamp {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [datetime]$Date = (Get-Date)
    )

    return $Date.ToString('yyyy-MM-ddTHH:mm:sszzz', [System.Globalization.CultureInfo]::InvariantCulture)
}

function Get-NdtComputerName {
    [CmdletBinding()]
    [OutputType([string])]
    param()

    return [System.Environment]::MachineName
}

function ConvertTo-NdtSafeText {
    <#
        Makes untrusted text (user input, DNS TXT records, tracert output, exception messages)
        safe to print: control characters such as ESC (terminal escape sequences), CR and LF
        are replaced, and very long values are shortened.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [AllowNull()][AllowEmptyString()][string]$Text,
        [ValidateRange(4, 100000)][int]$MaxLength = 500
    )

    if ($null -eq $Text) { return '' }
    $clean = [regex]::Replace($Text, '[\x00-\x1F\x7F]', ' ').Trim()
    if ($clean.Length -gt $MaxLength) {
        $clean = $clean.Substring(0, $MaxLength - 3) + '...'
    }
    return $clean
}

function ConvertTo-NdtCsvValue {
    <#
        Spreadsheet programs treat cells starting with = + - @ as formulas ("CSV injection").
        Report data can contain text from outside sources (DNS TXT records, user input), so
        such cells are prefixed with a single quote to force them to display as text.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [AllowNull()][AllowEmptyString()][string]$Value
    )

    if ([string]::IsNullOrEmpty($Value)) { return '' }
    $safe = ConvertTo-NdtSafeText -Text $Value -MaxLength 4000
    if ($safe -match '\A[=+\-@]') {
        return "'" + $safe
    }
    return $safe
}

function Get-NdtErrorMessage {
    <#
        Returns the innermost exception message from an ErrorRecord or exception, without the
        "Exception calling ... with N argument(s)" wrapper text or a stack trace.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)]
        [AllowNull()]
        [object]$ErrorObject
    )

    if ($null -eq $ErrorObject) { return 'Unknown error.' }

    $exception = $null
    if ($ErrorObject -is [System.Management.Automation.ErrorRecord]) {
        $exception = $ErrorObject.Exception
    }
    elseif ($ErrorObject -is [System.Exception]) {
        $exception = $ErrorObject
    }
    else {
        return (ConvertTo-NdtSafeText -Text ([string]$ErrorObject) -MaxLength 300)
    }

    while ($null -ne $exception.InnerException) {
        $exception = $exception.InnerException
    }
    return (ConvertTo-NdtSafeText -Text $exception.Message -MaxLength 300)
}

function New-NdtResult {
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseShouldProcessForStateChangingFunctions', '', Justification = 'Creates an in-memory object only; no system state changes.')]
    [CmdletBinding()]
    [OutputType('NetworkDiagnostics.Result')]
    param(
        [Parameter(Mandatory)]
        [ValidateSet('Ping', 'Traceroute', 'DNS', 'TcpPort', 'IPConfig', 'Adapter')]
        [string]$TestType,

        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string]$Target,

        [Parameter(Mandatory)]
        [ValidateSet('PASS', 'FAIL', 'WARN', 'INFO')]
        [string]$Status,

        [Parameter(Mandatory)]
        [string]$Summary,

        [AllowEmptyCollection()]
        [string[]]$Details = @(),

        [System.Collections.IDictionary]$Data,

        [string]$Timestamp = (Get-NdtTimestamp),

        [string]$SourceComputer = (Get-NdtComputerName)
    )

    $safeDetails = @()
    foreach ($line in @($Details)) {
        $safeDetails += (ConvertTo-NdtSafeText -Text $line -MaxLength 1000)
    }

    $properties = [ordered]@{
        Timestamp      = $Timestamp
        SourceComputer = $SourceComputer
        TestType       = $TestType
        Target         = (ConvertTo-NdtSafeText -Text $Target -MaxLength 260)
        Status         = $Status
        Summary        = (ConvertTo-NdtSafeText -Text $Summary -MaxLength 1000)
        Details        = [string[]]$safeDetails
    }

    if ($null -ne $Data) {
        foreach ($key in $Data.Keys) {
            if (-not $properties.Contains($key)) {
                $properties[$key] = $Data[$key]
            }
        }
    }

    $result = [pscustomobject]$properties
    $result.PSObject.TypeNames.Insert(0, 'NetworkDiagnostics.Result')
    $result.PSObject.TypeNames.Insert(0, "NetworkDiagnostics.Result.$TestType")
    return $result
}

function Test-NdtResultObject {
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [AllowNull()][object]$InputObject
    )

    if ($null -eq $InputObject) { return $false }
    $names = @($InputObject.PSObject.Properties | ForEach-Object { $_.Name })
    foreach ($required in 'Timestamp', 'TestType', 'Target', 'Status', 'Summary') {
        if ($names -notcontains $required) { return $false }
    }
    return $true
}

function Get-NdtStatusCount {
    [CmdletBinding()]
    [OutputType([System.Collections.Specialized.OrderedDictionary])]
    param(
        [AllowEmptyCollection()][object[]]$InputObject
    )

    $counts = [ordered]@{ PASS = 0; FAIL = 0; WARN = 0; INFO = 0 }
    foreach ($item in @($InputObject)) {
        if ($null -eq $item) { continue }
        $status = [string]$item.Status
        if ($counts.Contains($status)) { $counts[$status]++ }
    }
    return $counts
}

function Format-NdtResultLine {
    <#
        One-line form used on screen, in the text report and in ticket notes:
        [PASS] Ping 192.0.2.10 - 4/4 replies, 0% loss, min/avg/max 1/2/4 ms
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][object]$Result
    )

    return ('[{0}] {1} {2} - {3}' -f $Result.Status, $Result.TestType, $Result.Target, $Result.Summary)
}
