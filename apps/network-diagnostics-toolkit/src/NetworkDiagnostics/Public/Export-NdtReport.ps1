function Export-NdtReport {
    <#
    .SYNOPSIS
        Saves results to a timestamped CSV file and a text report.

    .DESCRIPTION
        Export-NdtReport writes:
          <BaseName>.csv  one row per check with the columns
                          Timestamp, SourceComputer, TestType, Target, Status, Summary, Details
          <BaseName>.txt  a readable report with every detail line and a ticket-notes block

        The default base name is ndt-report-<yyyyMMdd-HHmmss>, and the default folder is
        .\reports under the current location. The folder is created if needed.

        Existing files are never overwritten. If the name is already used, -1, -2 ... is
        added. Timestamps inside the files are ISO 8601 with the UTC offset.

        The reports contain only check results: targets, addresses, timings and messages.
        No passwords, credentials or tokens are collected by the toolkit, so none are saved.
        Reports can still contain internal IP addresses, host names and MAC addresses, so
        store and share them like any other internal ticket data.

        Cells that start with = + - or @ are prefixed with a single quote so spreadsheet
        programs do not run them as formulas.

    .PARAMETER InputObject
        Result objects from any Ndt check command.

    .PARAMETER OutputDirectory
        Folder for the report files. Default: a "reports" folder in the current location.

    .PARAMETER BaseName
        File name without extension. Letters, numbers, hyphens and underscores only
        (1-64 characters), so the name cannot point outside the output folder.

    .PARAMETER Format
        Csv, Text or both (default both).

    .PARAMETER Title
        Title for the text report and its ticket-notes block, for example a ticket number.
        Default "Network diagnostics".

    .EXAMPLE
        Invoke-NdtQuickCheck -Target intranet.example -Port 443 | Export-NdtReport

        Runs a quick check and saves .\reports\ndt-report-<timestamp>.csv and .txt.

    .EXAMPLE
        Test-NdtPing -Target 192.0.2.1 | Export-NdtReport -OutputDirectory C:\Tickets\INC0012345 -BaseName gateway-ping -Title 'INC0012345 gateway check'

        Saves the result into a ticket folder with a chosen name and title.

    .EXAMPLE
        Get-NdtIPConfig | Export-NdtReport -Format Csv -WhatIf

        Shows which file would be written without writing it.

    .OUTPUTS
        System.IO.FileInfo for each file written.

    .LINK
        New-NdtTicketNote
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([System.IO.FileInfo])]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [AllowNull()]
        [object[]]$InputObject,

        [ValidateNotNullOrEmpty()]
        [string]$OutputDirectory = 'reports',

        [ValidatePattern('\A[A-Za-z0-9_-]{1,64}\z')]
        [string]$BaseName,

        [ValidateSet('Csv', 'Text')]
        [string[]]$Format = @('Csv', 'Text'),

        [ValidateNotNullOrEmpty()]
        [string]$Title = 'Network diagnostics'
    )

    begin {
        $results = New-Object 'System.Collections.Generic.List[object]'
    }

    process {
        foreach ($item in @($InputObject)) {
            if ($null -eq $item) { continue }
            if (Test-NdtResultObject -InputObject $item) {
                $results.Add($item)
            }
            else {
                Write-Warning 'Skipped an object that is not a Network Diagnostics result.'
            }
        }
    }

    end {
        if ($results.Count -eq 0) {
            $record = New-Object -TypeName System.Management.Automation.ErrorRecord -ArgumentList ([System.ArgumentException]::new('There are no results to save. Run a check first.')), 'NdtNoResults', ([System.Management.Automation.ErrorCategory]::InvalidData), $null
            $PSCmdlet.ThrowTerminatingError($record)
        }

        try {
            $provider = $null
            $drive = $null
            $directory = $PSCmdlet.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory, [ref]$provider, [ref]$drive)
            if ($null -eq $provider -or $provider.Name -ne 'FileSystem') {
                # For example when the current location is HKLM:\ - never create registry keys.
                throw [System.IO.IOException]::new("'$OutputDirectory' is not a file system folder. Use a folder path such as C:\Tickets or .\reports from a file system location.")
            }
            if (Test-Path -LiteralPath $directory -PathType Leaf) {
                throw [System.IO.IOException]::new("'$directory' is a file, not a folder.")
            }

            if (-not $PSBoundParameters.ContainsKey('BaseName')) {
                $BaseName = 'ndt-report-' + (Get-Date).ToString('yyyyMMdd-HHmmss', [System.Globalization.CultureInfo]::InvariantCulture)
            }

            $formats = @($Format | Select-Object -Unique)
            $extensions = @()
            if ($formats -contains 'Csv') { $extensions += '.csv' }
            if ($formats -contains 'Text') { $extensions += '.txt' }

            if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
                if ($PSCmdlet.ShouldProcess($directory, 'Create report folder')) {
                    $null = New-Item -ItemType Directory -Path $directory -Force -ErrorAction Stop
                }
                else {
                    foreach ($ext in $extensions) {
                        $null = $PSCmdlet.ShouldProcess((Join-Path -Path $directory -ChildPath ($BaseName + $ext)), 'Create report file')
                    }
                    return
                }
            }

            $basePath = Get-NdtAvailableReportBase -Directory $directory -BaseName $BaseName -Extension $extensions
            $snapshot = $results.ToArray()

            foreach ($ext in $extensions) {
                $path = $basePath + $ext
                if (-not $PSCmdlet.ShouldProcess($path, 'Create report file')) { continue }

                if ($ext -eq '.csv') {
                    $content = ConvertTo-NdtCsvText -Result $snapshot
                }
                else {
                    $content = ConvertTo-NdtTextReport -Result $snapshot -Title $Title
                }

                Write-NdtNewFile -Path $path -Content $content
                Get-Item -LiteralPath $path
            }
        }
        catch {
            $message = Get-NdtErrorMessage -ErrorObject $_
            $record = New-Object -TypeName System.Management.Automation.ErrorRecord -ArgumentList ([System.IO.IOException]::new("Could not save the report: $message")), 'NdtReportWriteFailed', ([System.Management.Automation.ErrorCategory]::WriteError), $OutputDirectory
            $PSCmdlet.ThrowTerminatingError($record)
        }
    }
}
