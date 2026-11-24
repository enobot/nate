function Start-NdtMenu {
    <#
    .SYNOPSIS
        Starts the interactive Network Diagnostics Toolkit menu.

    .DESCRIPTION
        Start-NdtMenu shows a numbered menu for the toolkit's checks: ping, traceroute,
        IP configuration, DNS lookup, network adapters, TCP port check and a combined quick
        check. Results from each check are printed as [PASS]/[FAIL]/[WARN]/[INFO] lines and
        kept for the session, so they can be turned into ticket notes or saved as a CSV file
        and a text report.

        Bad input (for example a CIDR range, a port range or an invalid address) is reported
        as an [ERROR] line and the menu continues; no network traffic is sent for it.

        The menu exits on Q, or when standard input ends (for example when answers are
        piped in from a file).

    .PARAMETER ReportDirectory
        Folder for saved reports. Default: a "reports" folder in the current location.
        Start-NetworkToolkit.ps1 passes the toolkit's own reports folder.

    .PARAMETER NoColor
        Turn off colour. The [PASS]/[FAIL] text markers are always shown.

    .PARAMETER PassThru
        When the menu exits, return all result objects from the session.

    .EXAMPLE
        Start-NdtMenu

        Starts the menu and saves reports to .\reports.

    .EXAMPLE
        $session = Start-NdtMenu -ReportDirectory C:\Tickets\INC0012345 -PassThru

        Starts the menu with a ticket folder for reports and keeps the results afterwards.

    .OUTPUTS
        None by default. NetworkDiagnostics.Result objects when -PassThru is used.

    .LINK
        Show-NdtResult
    #>
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseShouldProcessForStateChangingFunctions', '', Justification = 'Interactive menu; the only file writes happen through Export-NdtReport after the user chooses Save.')]
    [CmdletBinding()]
    [OutputType('NetworkDiagnostics.Result')]
    param(
        [ValidateNotNullOrEmpty()]
        [string]$ReportDirectory = 'reports',

        [switch]$NoColor,

        [switch]$PassThru
    )

    $session = New-Object 'System.Collections.Generic.List[object]'
    $unsaved = 0
    $previousColor = $script:NdtSettings.UseColor
    if ($NoColor) { $script:NdtSettings.UseColor = $false }
    $script:NdtInputClosed = $false

    $reportPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ReportDirectory)

    try {
        $running = $true
        while ($running) {
            Show-NdtMenuScreen -ResultCount $session.Count -UnsavedCount $unsaved -ReportDirectory $reportPath
            $choice = Read-NdtInput -Prompt 'Select an option'
            if ($null -eq $choice) {
                Write-NdtHostLine -Text ''
                Write-NdtHostLine -Text '[INFO] Input ended. Closing the menu.' -Status 'INFO'
                break
            }

            $choice = $choice.Trim().ToUpperInvariant()
            $newResults = @()

            try {
                switch ($choice) {
                    '1' { $newResults = @(Invoke-NdtMenuPing) }
                    '2' { $newResults = @(Invoke-NdtMenuTraceroute) }
                    '3' { $newResults = @(Invoke-NdtMenuIPConfig) }
                    '4' { $newResults = @(Invoke-NdtMenuDnsLookup) }
                    '5' { $newResults = @(Invoke-NdtMenuAdapter) }
                    '6' { $newResults = @(Invoke-NdtMenuPort) }
                    '7' { $newResults = @(Invoke-NdtMenuQuickCheck) }
                    '8' {
                        if ($session.Count -eq 0) {
                            Write-NdtHostLine -Text '[INFO] No results yet. Run a check first.' -Status 'INFO'
                        }
                        else {
                            $note = New-NdtTicketNote -InputObject $session.ToArray()
                            Write-NdtHostLine -Text ''
                            Write-NdtHostLine -Text '----- ticket notes (copy from here) -----'
                            Write-NdtHostLine -Text $note
                            Write-NdtHostLine -Text '----- end of ticket notes -----'
                            $copy = Read-NdtYesNo -Prompt 'Copy ticket notes to the clipboard?' -Default $false
                            if ($copy) {
                                if (Get-Command -Name 'Set-Clipboard' -ErrorAction SilentlyContinue) {
                                    Set-Clipboard -Value $note
                                    Write-NdtHostLine -Text '[INFO] Ticket notes copied to the clipboard.' -Status 'INFO'
                                }
                                else {
                                    Write-NdtHostLine -Text '[WARN] Set-Clipboard is not available here. Copy the text above manually.' -Status 'WARN'
                                }
                            }
                        }
                    }
                    '9' {
                        if ($session.Count -eq 0) {
                            Write-NdtHostLine -Text '[INFO] No results to save yet. Run a check first.' -Status 'INFO'
                        }
                        else {
                            $files = @(Export-NdtReport -InputObject $session.ToArray() -OutputDirectory $reportPath)
                            foreach ($file in $files) {
                                Write-NdtHostLine -Text "[INFO] Saved $($file.FullName)" -Status 'INFO'
                            }
                            $unsaved = 0
                        }
                    }
                    'C' {
                        $clear = $true
                        if ($unsaved -gt 0) {
                            $clear = Read-NdtYesNo -Prompt "Discard $unsaved unsaved result(s)?" -Default $false
                        }
                        if ($clear) {
                            $session.Clear()
                            $unsaved = 0
                            Write-NdtHostLine -Text '[INFO] Session results cleared.' -Status 'INFO'
                        }
                    }
                    'H' { Show-NdtMenuHelp }
                    'Q' {
                        if ($unsaved -gt 0) {
                            $save = Read-NdtYesNo -Prompt "Save $unsaved unsaved result(s) before quitting?" -Default $true
                            if ($save) {
                                $files = @(Export-NdtReport -InputObject $session.ToArray() -OutputDirectory $reportPath)
                                foreach ($file in $files) {
                                    Write-NdtHostLine -Text "[INFO] Saved $($file.FullName)" -Status 'INFO'
                                }
                                $unsaved = 0
                            }
                            elseif ($null -eq $save) {
                                Write-NdtHostLine -Text '[INFO] Input ended; results were not saved.' -Status 'INFO'
                            }
                        }
                        $running = $false
                    }
                    '' { }
                    default {
                        $shown = ConvertTo-NdtSafeText -Text $choice -MaxLength 20
                        Write-NdtHostLine -Text "[ERROR] '$shown' is not a menu option. Enter 1-9, C, H or Q." -Status 'ERROR'
                    }
                }
            }
            catch {
                Write-NdtHostLine -Text "[ERROR] $(Get-NdtErrorMessage -ErrorObject $_)" -Status 'ERROR'
            }

            if ($newResults.Count -gt 0) {
                Write-NdtHostLine -Text ''
                $newResults | Show-NdtResult
                $session.AddRange([object[]]$newResults)
                $unsaved += $newResults.Count
            }

            if ($script:NdtInputClosed -and $running) {
                Write-NdtHostLine -Text ''
                Write-NdtHostLine -Text '[INFO] Input ended. Closing the menu.' -Status 'INFO'
                $running = $false
            }
        }

        Write-NdtHostLine -Text 'Goodbye.'
    }
    finally {
        $script:NdtSettings.UseColor = $previousColor
    }

    if ($PassThru) { $session.ToArray() }
}
