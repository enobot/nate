# Integration tests: these run the real checks with no mocks, against this computer only
# (127.0.0.1 / localhost) and against a TCP listener the test opens itself. They need a
# Windows machine with the NetTCPIP, NetAdapter and DnsClient modules (any Windows 10/11 or
# Windows Server, including GitHub's windows-latest runners).

BeforeAll {
    $repoRoot = (Resolve-Path -Path (Join-Path -Path $PSScriptRoot -ChildPath '..')).Path
    $modulePath = Join-Path -Path $repoRoot -ChildPath 'src\NetworkDiagnostics\NetworkDiagnostics.psd1'
    Import-Module -Name $modulePath -Force

    # A real listening port on loopback, opened and closed by this test file.
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $openPort = $listener.LocalEndpoint.Port

    # A port that was just released, so nothing is listening on it.
    $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $probe.Start()
    $closedPort = $probe.LocalEndpoint.Port
    $probe.Stop()
}

AfterAll {
    if ($listener) { $listener.Stop() }
}

Describe 'Real checks against this computer' -Tag 'Integration' {
    It 'pings 127.0.0.1 successfully' {
        $r = Test-NdtPing -Target 127.0.0.1 -Count 2
        $r.Status | Should -Be 'PASS'
        $r.Received | Should -Be 2
        $r.ResolvedAddress | Should -Be '127.0.0.1'
    }

    It 'resolves and pings localhost, preferring IPv4' {
        $r = Test-NdtPing -Target localhost -Count 1
        $r.Status | Should -Be 'PASS'
        $r.ResolvedAddress | Should -Be '127.0.0.1'
    }

    It 'reports a name that cannot exist (.invalid, RFC 6761) as FAIL without throwing' {
        $r = Test-NdtPing -Target 'ndt-no-such-host.invalid' -Count 1
        $r.Status | Should -Be 'FAIL'
        $r.Summary | Should -BeLike "Could not resolve 'ndt-no-such-host.invalid'*"
    }

    It 'finds the port opened by the test listener (Open)' {
        $r = Test-NdtPort -Target 127.0.0.1 -Port $openPort
        $r.Status | Should -Be 'PASS'
        $r.State | Should -Be 'Open'
    }

    It 'reports a closed loopback port as Refused within the default timeout' {
        $r = Test-NdtPort -Target 127.0.0.1 -Port $closedPort
        $r.Status | Should -Be 'FAIL'
        $r.State | Should -Be 'Refused'
        $r.ElapsedMs | Should -BeLessThan 3000
    }

    It 'traces the route to 127.0.0.1 in one hop with tracert.exe' {
        $r = Trace-NdtRoute -Target 127.0.0.1 -MaxHops 3 -TimeoutMs 500
        $r.Status | Should -Be 'PASS'
        $r.Reached | Should -BeTrue
        $r.HopCount | Should -Be 1
        $r.Hops[0].Address | Should -Be '127.0.0.1'
    }

    It 'resolves localhost with Resolve-DnsName' {
        $r = Resolve-NdtDnsName -Name localhost -RecordType A
        $r.Status | Should -Be 'PASS'
        $r.RecordType | Should -Be 'A'
        @($r.Records | Where-Object { $_ -like 'A 127.0.0.1 *' }).Count | Should -Be 1
    }

    It 'reads the IP configuration' {
        $results = @(Get-NdtIPConfig -All -WarningAction SilentlyContinue)
        $results.Count | Should -BeGreaterThan 0
        foreach ($r in $results) {
            $r.TestType | Should -Be 'IPConfig'
            @('PASS', 'WARN', 'INFO') | Should -Contain $r.Status
            $r.Target | Should -Not -BeNullOrEmpty
        }
    }

    It 'lists network adapters' {
        $results = @(Get-NdtAdapter -IncludeVirtual -WarningAction SilentlyContinue)
        $results.Count | Should -BeGreaterThan 0
        foreach ($r in $results) {
            $r.TestType | Should -Be 'Adapter'
            $r.AdapterStatus | Should -Not -BeNullOrEmpty
        }
    }

    It 'runs a quick check and exports CSV and text reports' {
        $results = @(Invoke-NdtQuickCheck -Target localhost -Port $openPort -Count 1)
        ($results | ForEach-Object { $_.TestType }) | Should -Be @('DNS', 'Ping', 'TcpPort')
        ($results | ForEach-Object { $_.Status }) | Should -Be @('PASS', 'PASS', 'PASS')

        $dir = Join-Path -Path $TestDrive -ChildPath 'reports'
        $files = @($results | Export-NdtReport -OutputDirectory $dir)
        $files.Count | Should -Be 2
        @(Import-Csv -LiteralPath ($files | Where-Object { $_.Extension -eq '.csv' }).FullName).Count | Should -Be 3
    }
}

Describe 'Start-NetworkToolkit.ps1 end to end' -Tag 'Integration' {
    It 'runs the menu in a new PowerShell process with typed answers' {
        $hostExe = (Get-Process -Id $PID).Path
        $script = Join-Path -Path $repoRoot -ChildPath 'Start-NetworkToolkit.ps1'
        $reportDir = Join-Path -Path $TestDrive -ChildPath 'menu-reports'

        $answers = @(
            '1', '127.0.0.1', '1', ''                  # ping 127.0.0.1 once, default timeout
            '6', '127.0.0.1', "$openPort", ''          # TCP check against the test listener
            '6', '127.0.0.1', '1-1024'                 # port range must be refused
            '1', '192.0.2.0/24'                        # CIDR must be refused
            'zz'                                       # unknown option
            '9'                                        # save CSV + text
            'q'
        )

        # The answers are fed from an ASCII file. Process.StandardInput is not used
        # because on Windows PowerShell 5.1 (.NET Framework) it writes a UTF-8
        # byte-order mark as soon as the process starts whenever the console's input
        # encoding is UTF-8, and the child then reads the first answer as garbage.
        $answerFile = Join-Path -Path $TestDrive -ChildPath 'menu-answers.txt'
        $stdoutFile = Join-Path -Path $TestDrive -ChildPath 'menu-stdout.txt'
        $stderrFile = Join-Path -Path $TestDrive -ChildPath 'menu-stderr.txt'
        Set-Content -LiteralPath $answerFile -Value $answers -Encoding Ascii

        $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$script`"",
            '-NoColor', '-ReportDirectory', "`"$reportDir`"")
        $process = Start-Process -FilePath $hostExe -ArgumentList $arguments -NoNewWindow -PassThru `
            -RedirectStandardInput $answerFile -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
        $null = $process.Handle   # keeps the handle open so ExitCode is available after exit

        $finished = $process.WaitForExit(120000)
        if (-not $finished) { $process.Kill() }
        $finished | Should -BeTrue -Because 'the menu must exit on Q or end of input'

        $output = Get-Content -LiteralPath $stdoutFile -Raw
        Get-Content -LiteralPath $stderrFile -Raw | Should -BeNullOrEmpty
        $process.ExitCode | Should -Be 0
        $output | Should -BeLike '*`[PASS`] Ping 127.0.0.1 - 1/1 replies*'
        $output | Should -BeLike "*``[PASS``] TcpPort 127.0.0.1 - TCP port $openPort is open*"
        $output | Should -BeLike '*`[ERROR`] Port ranges like ''1-1024'' are not allowed*'
        $output | Should -BeLike '*`[ERROR`] ''192.0.2.0/24'' looks like a subnet (CIDR) range*'
        $output | Should -BeLike "*``[ERROR``] 'ZZ' is not a menu option*"
        $output | Should -BeLike '*Goodbye.*'

        $saved = @(Get-ChildItem -LiteralPath $reportDir)
        ($saved | ForEach-Object { $_.Extension } | Sort-Object) | Should -Be @('.csv', '.txt')
        $rows = @(Import-Csv -LiteralPath ($saved | Where-Object { $_.Extension -eq '.csv' }).FullName)
        ($rows | ForEach-Object { $_.TestType }) | Should -Be @('Ping', 'TcpPort')
    }
}
