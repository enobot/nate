function New-NdtTicketNote {
    <#
    .SYNOPSIS
        Builds a short plain-text summary of results to paste into a help desk ticket.

    .DESCRIPTION
        New-NdtTicketNote turns result objects into a compact block of plain ASCII text:
        when the checks ran, which computer they ran from, one line per check with its
        [PASS]/[FAIL]/[WARN]/[INFO] marker, and a totals line.

        The text has no colour codes or special characters, so it can be pasted into a
        ServiceNow work note, an email or a chat message as-is.

    .PARAMETER InputObject
        Result objects from any Ndt check command.

    .PARAMETER Title
        First line of the note. Default "Network diagnostics".

    .EXAMPLE
        Invoke-NdtQuickCheck -Target intranet.example -Port 443 | New-NdtTicketNote

        Runs the quick check and prints ticket notes.

    .EXAMPLE
        $notes = Test-NdtPing -Target 192.0.2.1, 192.0.2.10 | New-NdtTicketNote -Title 'Jack 2-114 connectivity'
        $notes | Set-Clipboard

        Builds notes with a custom title and copies them to the clipboard.

    .OUTPUTS
        System.String (one multi-line string).

    .LINK
        Export-NdtReport
    #>
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseShouldProcessForStateChangingFunctions', '', Justification = 'Returns a string only; no system state changes.')]
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [AllowNull()]
        [object[]]$InputObject,

        [ValidateNotNullOrEmpty()]
        [string]$Title = 'Network diagnostics'
    )

    begin {
        $results = New-Object 'System.Collections.Generic.List[object]'
    }

    process {
        foreach ($item in @($InputObject)) {
            if (Test-NdtResultObject -InputObject $item) { $results.Add($item) }
        }
    }

    end {
        $newLine = "`r`n"
        $lines = New-Object 'System.Collections.Generic.List[string]'
        $lines.Add((ConvertTo-NdtSafeText -Text $Title -MaxLength 120))

        if ($results.Count -eq 0) {
            $lines.Add('No checks have been run.')
            return ($lines -join $newLine)
        }

        $first = [string]$results[0].Timestamp
        $last = [string]$results[$results.Count - 1].Timestamp
        $computers = @($results | ForEach-Object { [string]$_.SourceComputer } | Where-Object { $_ } | Select-Object -Unique)
        $from = 'unknown computer'
        if ($computers.Count -gt 0) { $from = $computers -join ', ' }

        if ($first -eq $last) {
            $lines.Add("Run: $first from $from")
        }
        else {
            $lines.Add("Run: $first to $last from $from")
        }
        $lines.Add("Tool: Network Diagnostics Toolkit $script:NdtModuleVersion (read-only checks; only the targets listed were contacted)")
        $lines.Add('')

        foreach ($result in $results) {
            $lines.Add((Format-NdtResultLine -Result $result))
        }

        $counts = Get-NdtStatusCount -InputObject $results.ToArray()
        $lines.Add('')
        $lines.Add("Totals: $($results.Count) check(s) - $($counts.PASS) PASS, $($counts.FAIL) FAIL, $($counts.WARN) WARN, $($counts.INFO) INFO")

        # Keep the note plain ASCII so it pastes cleanly into any ticketing system.
        $text = $lines -join $newLine
        return [regex]::Replace($text, '[^\x09\x0A\x0D\x20-\x7E]', '?')
    }
}
