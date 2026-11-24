<#
    Report formatting and safe file writing used by Export-NdtReport.

    Files are written as UTF-8 with a byte order mark (BOM) on both Windows PowerShell 5.1
    and PowerShell 7. The two versions use different defaults for Export-Csv/Out-File
    encodings, and Excel needs the BOM to read UTF-8 CSV files correctly.

    Existing files are never overwritten: files are opened with FileMode.CreateNew.
#>

$script:NdtCsvColumns = @('Timestamp', 'SourceComputer', 'TestType', 'Target', 'Status', 'Summary', 'Details')

function ConvertTo-NdtCsvText {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Result
    )

    $rows = foreach ($r in $Result) {
        [pscustomobject][ordered]@{
            Timestamp      = ConvertTo-NdtCsvValue -Value ([string]$r.Timestamp)
            SourceComputer = ConvertTo-NdtCsvValue -Value ([string]$r.SourceComputer)
            TestType       = ConvertTo-NdtCsvValue -Value ([string]$r.TestType)
            Target         = ConvertTo-NdtCsvValue -Value ([string]$r.Target)
            Status         = ConvertTo-NdtCsvValue -Value ([string]$r.Status)
            Summary        = ConvertTo-NdtCsvValue -Value ([string]$r.Summary)
            Details        = ConvertTo-NdtCsvValue -Value ((@($r.Details) | Where-Object { $_ }) -join ' | ')
        }
    }

    if (@($rows).Count -eq 0) {
        return ('"' + ($script:NdtCsvColumns -join '","') + '"')
    }

    $csvLines = @($rows | ConvertTo-Csv -NoTypeInformation)
    return ($csvLines -join "`r`n")
}

function ConvertTo-NdtTextReport {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Result,
        [string]$GeneratedAt = (Get-NdtTimestamp),
        [string]$Title = 'Network diagnostics'
    )

    $lines = New-Object 'System.Collections.Generic.List[string]'
    $counts = Get-NdtStatusCount -InputObject $Result
    $computers = @($Result | ForEach-Object { [string]$_.SourceComputer } | Where-Object { $_ } | Select-Object -Unique)
    $computerText = 'unknown'
    if ($computers.Count -gt 0) { $computerText = $computers -join ', ' }

    $lines.Add('NETWORK DIAGNOSTICS REPORT')
    $lines.Add('==========================')
    $lines.Add("Title     : $(ConvertTo-NdtSafeText -Text $Title -MaxLength 120)")
    $lines.Add("Generated : $GeneratedAt")
    $lines.Add("Computer  : $computerText")
    $lines.Add("Toolkit   : Network Diagnostics Toolkit $script:NdtModuleVersion")
    $lines.Add('Scope     : Read-only checks. Only the targets listed below were contacted.')
    $lines.Add("Checks    : $(@($Result).Count) ($($counts.PASS) PASS, $($counts.FAIL) FAIL, $($counts.WARN) WARN, $($counts.INFO) INFO)")
    $lines.Add('')
    $lines.Add('RESULTS')
    $lines.Add('-------')

    foreach ($r in $Result) {
        $lines.Add('')
        $lines.Add((Format-NdtResultLine -Result $r))
        $lines.Add("       Time: $($r.Timestamp)")
        foreach ($detail in @($r.Details)) {
            if ($null -ne $detail -and ([string]$detail).Length -gt 0) {
                $lines.Add('       ' + $detail)
            }
        }
    }

    $lines.Add('')
    $lines.Add('TICKET NOTES (copy and paste)')
    $lines.Add('-----------------------------')
    $lines.Add((New-NdtTicketNote -InputObject $Result -Title $Title))
    $lines.Add('')

    return ($lines -join "`r`n")
}

function Write-NdtNewFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][AllowEmptyString()][string]$Content
    )

    $encoding = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $true
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try {
        $writer = New-Object -TypeName System.IO.StreamWriter -ArgumentList $stream, $encoding
        try {
            $writer.Write($Content)
        }
        finally {
            $writer.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Get-NdtAvailableReportBase {
    <#
        Returns a full path without extension, such as C:\...\reports\ndt-report-20261122-091603,
        for which none of the requested report files exist yet. Adds -1, -2 ... if needed.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$Directory,
        [Parameter(Mandatory)][string]$BaseName,
        [Parameter(Mandatory)][string[]]$Extension
    )

    for ($n = 0; $n -lt 100; $n++) {
        $candidateName = $BaseName
        if ($n -gt 0) { $candidateName = "$BaseName-$n" }
        $candidate = Join-Path -Path $Directory -ChildPath $candidateName

        $taken = $false
        foreach ($ext in $Extension) {
            if (Test-Path -LiteralPath ($candidate + $ext)) { $taken = $true }
        }
        if (-not $taken) { return $candidate }
    }

    throw [System.IO.IOException]::new("Could not find a free file name for '$BaseName' in $Directory after 100 attempts.")
}
