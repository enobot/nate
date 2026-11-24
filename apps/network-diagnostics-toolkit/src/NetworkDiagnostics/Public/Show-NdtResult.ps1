function Show-NdtResult {
    <#
    .SYNOPSIS
        Prints results as [PASS]/[FAIL]/[WARN]/[INFO] lines, with colour where supported.

    .DESCRIPTION
        Show-NdtResult writes one status line per result, followed by indented detail lines
        (replies, hops, DNS records, addresses). The text marker is always printed, so the
        output is still clear in plain logs, transcripts and when colour is off.

        Colour is turned off with -NoColor or by setting the NO_COLOR environment variable.

        Show-NdtResult writes to the console only. Use -PassThru to also pass the results on
        down the pipeline, for example to Export-NdtReport.

    .PARAMETER InputObject
        Result objects from any Ndt check command.

    .PARAMETER NoDetails
        Print only the one-line status for each result.

    .PARAMETER NoColor
        Do not use colour. The [PASS]/[FAIL] markers are still printed.

    .PARAMETER PassThru
        Return the input objects after printing them.

    .EXAMPLE
        Test-NdtPing -Target 192.0.2.10 | Show-NdtResult

        Prints the ping result and each reply.

    .EXAMPLE
        Get-NdtAdapter | Show-NdtResult -NoDetails

        Prints one line per adapter.

    .EXAMPLE
        Test-NdtPort -Target 192.0.2.20 -Port 443 | Show-NdtResult -PassThru | Export-NdtReport

        Prints the result and saves it to CSV and text reports.

    .OUTPUTS
        None by default. NetworkDiagnostics.Result when -PassThru is used.

    .LINK
        Export-NdtReport
    #>
    [CmdletBinding()]
    [OutputType('NetworkDiagnostics.Result')]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [AllowNull()]
        [object[]]$InputObject,

        [switch]$NoDetails,

        [switch]$NoColor,

        [switch]$PassThru
    )

    begin {
        $previousColor = $script:NdtSettings.UseColor
        if ($NoColor) { $script:NdtSettings.UseColor = $false }
    }

    process {
        foreach ($result in @($InputObject)) {
            if ($null -eq $result) { continue }
            if (-not (Test-NdtResultObject -InputObject $result)) {
                Write-Error -Message 'Input is not a Network Diagnostics result. Pipe output from Test-NdtPing, Test-NdtPort, Trace-NdtRoute, Resolve-NdtDnsName, Get-NdtIPConfig, Get-NdtAdapter or Invoke-NdtQuickCheck.' -Category InvalidArgument -ErrorId 'NdtNotAResult'
                continue
            }

            $status = [string]$result.Status
            if (@('PASS', 'FAIL', 'WARN', 'INFO') -notcontains $status) { $status = 'None' }

            Write-NdtHostLine -Text (Format-NdtResultLine -Result $result) -Status $status
            if (-not $NoDetails) {
                foreach ($line in @($result.Details)) {
                    if ($null -ne $line -and ([string]$line).Length -gt 0) {
                        Write-NdtHostLine -Text ('       ' + $line)
                    }
                }
            }

            if ($PassThru) { $result }
        }
    }

    end {
        $script:NdtSettings.UseColor = $previousColor
    }
}
