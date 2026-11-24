<#
    Console output. This is the only place in the module that calls Write-Host.

    Every status line starts with a text marker ([PASS], [FAIL], [WARN], [INFO], [ERROR]) so
    results are still clear in plain logs, transcripts, redirected output and screen readers.
    Colour is added on top of the marker when the host supports it and it is not disabled.
#>

$script:NdtStatusColor = @{
    PASS  = 'Green'
    FAIL  = 'Red'
    WARN  = 'Yellow'
    INFO  = 'Cyan'
    ERROR = 'Red'
}

function Test-NdtColorEnabled {
    [CmdletBinding()]
    [OutputType([bool])]
    param()

    if (-not $script:NdtSettings.UseColor) { return $false }
    # https://no-color.org convention: any non-empty NO_COLOR value turns colour off.
    if (-not [string]::IsNullOrEmpty($env:NO_COLOR)) { return $false }
    return $true
}

function Write-NdtHostLine {
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '', Justification = 'Interactive console output; colour requires Write-Host. Result objects are returned separately on the pipeline.')]
    [CmdletBinding()]
    param(
        [AllowEmptyString()][string]$Text = '',
        [ValidateSet('PASS', 'FAIL', 'WARN', 'INFO', 'ERROR', 'None')][string]$Status = 'None',
        [switch]$NoNewline
    )

    if ($Status -ne 'None' -and (Test-NdtColorEnabled)) {
        Write-Host -Object $Text -ForegroundColor $script:NdtStatusColor[$Status] -NoNewline:$NoNewline
    }
    else {
        Write-Host -Object $Text -NoNewline:$NoNewline
    }
}
