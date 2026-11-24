# Unit tests for console output, ticket notes and report files.
# Result objects are built with the module's own builders and fictional data.

BeforeAll {
    $modulePath = Join-Path -Path $PSScriptRoot -ChildPath '..\src\NetworkDiagnostics\NetworkDiagnostics.psd1'
    Import-Module -Name $modulePath -Force

    $TestResults = InModuleScope NetworkDiagnostics {
        $ok = @(1..2 | ForEach-Object { [pscustomobject]@{ Status = 'Success'; RoundtripMs = 3; ReplyAddress = '192.0.2.10'; Ttl = 64; Message = '' } })
        $lost = @(1..2 | ForEach-Object { [pscustomobject]@{ Status = 'TimedOut'; RoundtripMs = 0; ReplyAddress = $null; Ttl = $null; Message = '' } })
        ConvertTo-NdtPingResult -Target '192.0.2.10' -ResolvedAddress '192.0.2.10' -Reply $ok -Timestamp '2026-11-20T09:00:00-08:00' -SourceComputer 'HELPDESK-PC01'
        ConvertTo-NdtPingResult -Target '192.0.2.99' -ResolvedAddress '192.0.2.99' -Reply $lost -Timestamp '2026-11-20T09:00:05-08:00' -SourceComputer 'HELPDESK-PC01'
        ConvertTo-NdtDnsResult -Name 'intranet.example' -RecordType 'A' -Failure ([pscustomobject]@{ Category = 'NXDOMAIN'; Code = 9003; Message = 'Name does not exist (NXDOMAIN).' }) -QueryMs 15 -Timestamp '2026-11-20T09:00:06-08:00' -SourceComputer 'HELPDESK-PC01'
        ConvertTo-NdtDnsResult -Name 'example.com' -RecordType 'TXT' -Record @([pscustomobject]@{ Name = 'example.com'; Type = 'TXT'; Section = 'Answer'; TTL = 60; Strings = @('=HYPERLINK("http://203.0.113.66")') }) -QueryMs 12 -Timestamp '2026-11-20T09:00:07-08:00' -SourceComputer 'HELPDESK-PC01'
    }
}

Describe 'Show-NdtResult' -Tag 'Unit' {
    It 'prints a [STATUS] marker line and indented details' {
        $output = $TestResults[0] | Show-NdtResult -NoColor 6>&1 | ForEach-Object { [string]$_ }
        $output[0] | Should -Be '[PASS] Ping 192.0.2.10 - 2/2 replies, 0% loss, min/avg/max 3/3/3 ms'
        $output[1] | Should -Be '       Reply 1: Success from 192.0.2.10 time=3 ms TTL=64'
        $output.Count | Should -Be 3
    }

    It 'prints only status lines with -NoDetails' {
        $output = @($TestResults | Show-NdtResult -NoDetails -NoColor 6>&1 | ForEach-Object { [string]$_ })
        $output.Count | Should -Be 4
        $output[1] | Should -BeLike '`[FAIL`] Ping 192.0.2.99*'
        $output[2] | Should -BeLike '`[FAIL`] DNS intranet.example*'
    }

    It 'returns nothing by default and the input with -PassThru' {
        @($TestResults[0] | Show-NdtResult 6>$null).Count | Should -Be 0
        $passed = @($TestResults[0] | Show-NdtResult -PassThru 6>$null)
        $passed.Count | Should -Be 1
        $passed[0].Target | Should -Be '192.0.2.10'
    }

    It 'writes an error for objects that are not results' {
        $errors = @()
        [pscustomobject]@{ Name = 'x' } | Show-NdtResult -ErrorVariable errors -ErrorAction SilentlyContinue 6>$null
        $errors.Count | Should -Be 1
        $errors[0].FullyQualifiedErrorId | Should -BeLike 'NdtNotAResult*'
    }

    It 'restores the colour setting after -NoColor' {
        $null = $TestResults[0] | Show-NdtResult -NoColor 6>$null
        InModuleScope NetworkDiagnostics { $script:NdtSettings.UseColor | Should -BeTrue }
    }
}

Describe 'New-NdtTicketNote' -Tag 'Unit' {
    BeforeAll {
        $note = $TestResults | New-NdtTicketNote -Title 'INC0000000 - user cannot reach intranet'
        $noteLines = $note -split "`r`n"
    }

    It 'starts with the title and the run window' {
        $noteLines[0] | Should -Be 'INC0000000 - user cannot reach intranet'
        $noteLines[1] | Should -Be 'Run: 2026-11-20T09:00:00-08:00 to 2026-11-20T09:00:07-08:00 from HELPDESK-PC01'
        $noteLines[2] | Should -BeLike 'Tool: Network Diagnostics Toolkit 1.0.0 (read-only checks*'
    }

    It 'has one marker line per check' {
        @($noteLines | Where-Object { $_ -match '^\[(PASS|FAIL|WARN|INFO)\] ' }).Count | Should -Be 4
        $noteLines | Should -Contain '[FAIL] DNS intranet.example - A lookup for intranet.example failed: Name does not exist (NXDOMAIN).'
    }

    It 'ends with the totals' {
        $noteLines[-1] | Should -Be 'Totals: 4 check(s) - 2 PASS, 2 FAIL, 0 WARN, 0 INFO'
    }

    It 'contains only printable ASCII' {
        $note | Should -Not -Match '[^\x09\x0A\x0D\x20-\x7E]'
    }

    It 'handles an empty result list' {
        (@() | New-NdtTicketNote) | Should -BeLike 'Network diagnostics*No checks have been run.'
    }
}

Describe 'Export-NdtReport' -Tag 'Unit' {
    It 'writes a CSV and a text report with the expected content' {
        $dir = Join-Path -Path $TestDrive -ChildPath 'reports-a'
        $files = @($TestResults | Export-NdtReport -OutputDirectory $dir -BaseName 'case1' -Title 'INC0000000 intranet')
        $files.Count | Should -Be 2
        ($files | ForEach-Object { $_.Name }) | Should -Be @('case1.csv', 'case1.txt')

        $rows = @(Import-Csv -LiteralPath (Join-Path $dir 'case1.csv'))
        $rows.Count | Should -Be 4
        ($rows[0].PSObject.Properties | ForEach-Object { $_.Name }) | Should -Be @('Timestamp', 'SourceComputer', 'TestType', 'Target', 'Status', 'Summary', 'Details')
        $rows[0].Timestamp | Should -Be '2026-11-20T09:00:00-08:00'
        $rows[0].Status | Should -Be 'PASS'
        $rows[0].Details | Should -BeLike 'Reply 1: Success*| Reply 2: Success*'
        $rows[2].Status | Should -Be 'FAIL'

        $text = [System.IO.File]::ReadAllText((Join-Path $dir 'case1.txt'))
        $text | Should -BeLike 'NETWORK DIAGNOSTICS REPORT*'
        $text | Should -BeLike '*Title     : INC0000000 intranet*'
        $text | Should -BeLike '*TICKET NOTES (copy and paste)*INC0000000 intranet*Run: 2026-11-20T09:00:00-08:00*'
        $text | Should -BeLike '*Checks    : 4 (2 PASS, 2 FAIL, 0 WARN, 0 INFO)*'
        $text | Should -BeLike '*`[FAIL`] Ping 192.0.2.99*'
        $text | Should -BeLike '*TICKET NOTES (copy and paste)*Totals: 4 check(s)*'
    }

    It 'writes UTF-8 with a byte order mark' {
        $dir = Join-Path -Path $TestDrive -ChildPath 'reports-bom'
        $file = $TestResults[0] | Export-NdtReport -OutputDirectory $dir -BaseName 'bom' -Format Csv
        $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
        $bytes[0] | Should -Be 0xEF
        $bytes[1] | Should -Be 0xBB
        $bytes[2] | Should -Be 0xBF
    }

    It 'neutralises spreadsheet formulas from untrusted data (CSV injection)' {
        $dir = Join-Path -Path $TestDrive -ChildPath 'reports-csvi'
        $file = $TestResults[3] | Export-NdtReport -OutputDirectory $dir -BaseName 'csvi' -Format Csv
        $row = Import-Csv -LiteralPath $file.FullName
        $row.Details | Should -BeLike 'Query: TXT*'
        $raw = [System.IO.File]::ReadAllText($file.FullName)
        $raw | Should -Not -Match '","=HYPERLINK'

        InModuleScope NetworkDiagnostics {
            ConvertTo-NdtCsvValue -Value '=1+1' | Should -Be "'=1+1"
            ConvertTo-NdtCsvValue -Value '+cmd' | Should -Be "'+cmd"
            ConvertTo-NdtCsvValue -Value '-2' | Should -Be "'-2"
            ConvertTo-NdtCsvValue -Value '@SUM(A1)' | Should -Be "'@SUM(A1)"
            ConvertTo-NdtCsvValue -Value '192.0.2.1' | Should -Be '192.0.2.1'
        }
    }

    It 'never overwrites an existing report' {
        $dir = Join-Path -Path $TestDrive -ChildPath 'reports-b'
        $first = @($TestResults[0] | Export-NdtReport -OutputDirectory $dir -BaseName 'same')
        $second = @($TestResults[1] | Export-NdtReport -OutputDirectory $dir -BaseName 'same')
        ($first | ForEach-Object { $_.Name }) | Should -Be @('same.csv', 'same.txt')
        ($second | ForEach-Object { $_.Name }) | Should -Be @('same-1.csv', 'same-1.txt')
        (Import-Csv -LiteralPath (Join-Path $dir 'same.csv')).Target | Should -Be '192.0.2.10'
        (Import-Csv -LiteralPath (Join-Path $dir 'same-1.csv')).Target | Should -Be '192.0.2.99'
    }

    It 'uses a timestamped default file name' {
        $dir = Join-Path -Path $TestDrive -ChildPath 'reports-c'
        $file = $TestResults[0] | Export-NdtReport -OutputDirectory $dir -Format Text
        $file.Name | Should -Match '^ndt-report-\d{8}-\d{6}\.txt$'
    }

    It 'rejects a base name that could leave the output folder' {
        { $TestResults[0] | Export-NdtReport -OutputDirectory $TestDrive -BaseName '..\evil' } | Should -Throw
        { $TestResults[0] | Export-NdtReport -OutputDirectory $TestDrive -BaseName 'C:\x' } | Should -Throw
    }

    It 'writes nothing with -WhatIf' {
        $dir = Join-Path -Path $TestDrive -ChildPath 'reports-whatif'
        $TestResults[0] | Export-NdtReport -OutputDirectory $dir -BaseName 'wi' -WhatIf
        Test-Path -LiteralPath $dir | Should -BeFalse
    }

    It 'fails clearly when there is nothing to save' {
        { @() | Export-NdtReport -OutputDirectory $TestDrive } | Should -Throw -ExpectedMessage '*no results to save*'
    }

    It 'refuses a non-file-system location' {
        Push-Location -Path 'HKCU:\'
        try {
            { $TestResults[0] | Export-NdtReport -OutputDirectory 'reports' } | Should -Throw -ExpectedMessage '*not a file system folder*'
        }
        finally {
            Pop-Location
        }
    }
}

Describe 'Text safety helpers' -Tag 'Unit' {
    It 'replaces control characters and shortens long text' {
        InModuleScope NetworkDiagnostics {
            $escape = [char]27
            ConvertTo-NdtSafeText -Text "a${escape}[31mb`r`nc" | Should -Be 'a [31mb  c'
            (ConvertTo-NdtSafeText -Text ('x' * 50) -MaxLength 10) | Should -Be 'xxxxxxx...'
            ConvertTo-NdtSafeText -Text $null | Should -Be ''
        }
    }

    It 'returns the innermost exception message' {
        InModuleScope NetworkDiagnostics {
            $inner = [System.Net.Sockets.SocketException]::new(11001)
            $outer = [System.Management.Automation.MethodInvocationException]::new('Exception calling "Send" with "4" argument(s)', $inner)
            Get-NdtErrorMessage -ErrorObject $outer | Should -Be $inner.Message
        }
    }
}
