# Unit tests for the interactive menu. Keyboard input is replaced by a queue of scripted
# answers (Read-NdtInput is mocked); the menu logic, validation and session handling are
# the real code. Network checks are mocked so no traffic is sent.

BeforeAll {
    $modulePath = Join-Path -Path $PSScriptRoot -ChildPath '..\src\NetworkDiagnostics\NetworkDiagnostics.psd1'
    Import-Module -Name $modulePath -Force

    function Set-TestAnswer {
        param([string[]]$Answer)
        $script:Answers = New-Object System.Collections.Queue
        foreach ($a in $Answer) { $script:Answers.Enqueue($a) }
    }
}

Describe 'Start-NdtMenu' -Tag 'Unit' {
    BeforeEach {
        Mock -ModuleName NetworkDiagnostics Read-NdtInput {
            if ($script:Answers.Count -gt 0) { return [string]$script:Answers.Dequeue() }
            InModuleScope NetworkDiagnostics { $script:NdtInputClosed = $true }
            return $null
        }
        Mock -ModuleName NetworkDiagnostics Test-NdtPing {
            foreach ($t in $Target) {
                InModuleScope NetworkDiagnostics -Parameters @{ T = $t } {
                    param($T)
                    New-NdtResult -TestType 'Ping' -Target $T -Status 'PASS' -Summary 'mock reply'
                }
            }
        }
        Mock -ModuleName NetworkDiagnostics Test-NdtPort { }
        Mock -ModuleName NetworkDiagnostics Export-NdtReport { [pscustomobject]@{ FullName = 'C:\reports\mock.csv' } }
        Mock -ModuleName NetworkDiagnostics Set-Clipboard { }
    }

    It 'runs a ping from the menu with the typed values and returns the session results' {
        Set-TestAnswer @('1', '192.0.2.10, 192.0.2.11', '2', '', 'q', 'n')
        $results = @(Start-NdtMenu -PassThru -NoColor 6>$null)
        $results.Count | Should -Be 2
        Should -Invoke -ModuleName NetworkDiagnostics Test-NdtPing -Times 1 -Exactly -ParameterFilter {
            ($Target -join ',') -eq '192.0.2.10,192.0.2.11' -and $Count -eq 2 -and $TimeoutMs -eq 1000
        }
    }

    It 'shows an [ERROR] for a CIDR range and sends nothing' {
        Set-TestAnswer @('1', '192.0.2.0/24', 'q')
        $output = Start-NdtMenu -NoColor 6>&1 | ForEach-Object { [string]$_ }
        ($output -join "`n") | Should -BeLike '*`[ERROR`] *CIDR*'
        Should -Invoke -ModuleName NetworkDiagnostics Test-NdtPing -Times 0 -Exactly
    }

    It 'shows an [ERROR] for a port range and sends nothing' {
        Set-TestAnswer @('6', '192.0.2.10', '1-1024', 'q')
        $output = Start-NdtMenu -NoColor 6>&1 | ForEach-Object { [string]$_ }
        ($output -join "`n") | Should -BeLike '*`[ERROR`] Port ranges*'
        Should -Invoke -ModuleName NetworkDiagnostics Test-NdtPort -Times 0 -Exactly
    }

    It 'shows an [ERROR] for an out-of-range number' {
        Set-TestAnswer @('1', '192.0.2.10', '50', 'q')
        $output = Start-NdtMenu -NoColor 6>&1 | ForEach-Object { [string]$_ }
        ($output -join "`n") | Should -BeLike '*`[ERROR`] 50 is out of range. Enter a number from 1 to 10.*'
        Should -Invoke -ModuleName NetworkDiagnostics Test-NdtPing -Times 0 -Exactly
    }

    It 'rejects an unknown option and keeps running' {
        Set-TestAnswer @('7x', 'h', 'q')
        $output = Start-NdtMenu -NoColor 6>&1 | ForEach-Object { [string]$_ }
        $joined = $output -join "`n"
        # Double backticks: inside double quotes a single backtick is consumed by the string.
        $joined | Should -BeLike "*``[ERROR``] '7X' is not a menu option*"
        $joined | Should -BeLike '*SAFETY LIMITS*'
        $joined | Should -BeLike '*Goodbye.*'
    }

    It 'saves the session with option 9' {
        Set-TestAnswer @('1', '192.0.2.10', '1', '', '9', 'q')
        $null = Start-NdtMenu -NoColor -ReportDirectory 'C:\reports' 6>$null
        Should -Invoke -ModuleName NetworkDiagnostics Export-NdtReport -Times 1 -Exactly -ParameterFilter { @($InputObject).Count -eq 1 -and $OutputDirectory -eq 'C:\reports' }
    }

    It 'offers to save unsaved results on quit (default yes)' {
        Set-TestAnswer @('1', '192.0.2.10', '1', '', 'q', '')
        $null = Start-NdtMenu -NoColor 6>$null
        Should -Invoke -ModuleName NetworkDiagnostics Export-NdtReport -Times 1 -Exactly
    }

    It 'does not save on quit when the user answers no' {
        Set-TestAnswer @('1', '192.0.2.10', '1', '', 'q', 'n')
        $null = Start-NdtMenu -NoColor 6>$null
        Should -Invoke -ModuleName NetworkDiagnostics Export-NdtReport -Times 0 -Exactly
    }

    It 'shows ticket notes and copies them only when asked' {
        Set-TestAnswer @('1', '192.0.2.10', '1', '', '8', 'y', 'q', 'n')
        $output = Start-NdtMenu -NoColor 6>&1 | ForEach-Object { [string]$_ }
        ($output -join "`n") | Should -BeLike '*----- ticket notes (copy from here) -----*`[PASS`] Ping 192.0.2.10 - mock reply*'
        Should -Invoke -ModuleName NetworkDiagnostics Set-Clipboard -Times 1 -Exactly
    }

    It 'clears the session with C' {
        Set-TestAnswer @('1', '192.0.2.10', '1', '', 'c', 'y', 'q')
        $results = @(Start-NdtMenu -PassThru -NoColor 6>$null)
        $results.Count | Should -Be 0
    }

    It 'exits when input ends instead of looping' {
        Set-TestAnswer @('1')
        $output = Start-NdtMenu -NoColor 6>&1 | ForEach-Object { [string]$_ }
        ($output -join "`n") | Should -BeLike '*Input ended*'
        Should -Invoke -ModuleName NetworkDiagnostics Read-NdtInput -Times 2 -Exactly
    }

    It 'traceroute option refuses more than one target' {
        Mock -ModuleName NetworkDiagnostics Trace-NdtRoute { }
        Set-TestAnswer @('2', '192.0.2.1 192.0.2.2', 'q')
        $output = Start-NdtMenu -NoColor 6>&1 | ForEach-Object { [string]$_ }
        ($output -join "`n") | Should -BeLike '*`[ERROR`] Traceroute runs against one target at a time*'
        Should -Invoke -ModuleName NetworkDiagnostics Trace-NdtRoute -Times 0 -Exactly
    }

    It 'DNS option rejects an unsupported record type' {
        Mock -ModuleName NetworkDiagnostics Resolve-NdtDnsName { }
        Set-TestAnswer @('4', 'example.com', 'ANY', 'q')
        $output = Start-NdtMenu -NoColor 6>&1 | ForEach-Object { [string]$_ }
        ($output -join "`n") | Should -BeLike "*``[ERROR``] 'ANY' is not a supported record type*"
        Should -Invoke -ModuleName NetworkDiagnostics Resolve-NdtDnsName -Times 0 -Exactly
    }

    It 'traceroute option passes hops and timeout' {
        Mock -ModuleName NetworkDiagnostics Trace-NdtRoute { }
        Set-TestAnswer @('2', '203.0.113.50', '10', '', 'q')
        $null = Start-NdtMenu -NoColor 6>$null
        Should -Invoke -ModuleName NetworkDiagnostics Trace-NdtRoute -Times 1 -Exactly -ParameterFilter { $Target -eq '203.0.113.50' -and $MaxHops -eq 10 -and $TimeoutMs -eq 1000 }
    }

    It 'IP configuration and adapter options pass the yes/no answers' {
        Mock -ModuleName NetworkDiagnostics Get-NdtIPConfig { }
        Mock -ModuleName NetworkDiagnostics Get-NdtAdapter { }
        Set-TestAnswer @('3', 'y', '5', '', 'q')
        $null = Start-NdtMenu -NoColor 6>$null
        Should -Invoke -ModuleName NetworkDiagnostics Get-NdtIPConfig -Times 1 -Exactly -ParameterFilter { $All }
        Should -Invoke -ModuleName NetworkDiagnostics Get-NdtAdapter -Times 1 -Exactly -ParameterFilter { -not $IncludeVirtual }
    }

    It 'TCP port option passes hosts, ports and timeout' {
        Set-TestAnswer @('6', '192.0.2.20', '80, 443', '5000', 'q')
        $null = Start-NdtMenu -NoColor 6>$null
        Should -Invoke -ModuleName NetworkDiagnostics Test-NdtPort -Times 1 -Exactly -ParameterFilter { $Target -contains '192.0.2.20' -and ($Port -join ',') -eq '80,443' -and $TimeoutMs -eq 5000 }
    }

    It 'quick check option runs with and without ports' {
        Mock -ModuleName NetworkDiagnostics Invoke-NdtQuickCheck { }
        Set-TestAnswer @('7', 'intranet.example', '443', '7', 'printer01.example', '', 'q')
        $null = Start-NdtMenu -NoColor 6>$null
        Should -Invoke -ModuleName NetworkDiagnostics Invoke-NdtQuickCheck -Times 1 -Exactly -ParameterFilter { $Target -contains 'intranet.example' -and $Port -contains 443 }
        Should -Invoke -ModuleName NetworkDiagnostics Invoke-NdtQuickCheck -Times 1 -Exactly -ParameterFilter { $Target -contains 'printer01.example' -and -not $Port }
    }

    It 'rejects a non-numeric count' {
        Set-TestAnswer @('1', '192.0.2.10', 'four', 'q')
        $output = Start-NdtMenu -NoColor 6>&1 | ForEach-Object { [string]$_ }
        ($output -join "`n") | Should -BeLike "*``[ERROR``] 'four' is not a whole number*"
        Should -Invoke -ModuleName NetworkDiagnostics Test-NdtPing -Times 0 -Exactly
    }

    It 'DNS option passes the record type and server' {
        Mock -ModuleName NetworkDiagnostics Resolve-NdtDnsName { }
        Set-TestAnswer @('4', 'example.com', 'mx', '198.51.100.53', 'q')
        $null = Start-NdtMenu -NoColor 6>$null
        Should -Invoke -ModuleName NetworkDiagnostics Resolve-NdtDnsName -Times 1 -Exactly -ParameterFilter { $RecordType -eq 'MX' -and $Server -eq '198.51.100.53' -and $Name -contains 'example.com' }
    }
}
