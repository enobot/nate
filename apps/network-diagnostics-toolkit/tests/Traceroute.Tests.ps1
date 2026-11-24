# Unit tests for tracert output parsing and Trace-NdtRoute.
# The tracert text below is fictional (documentation addresses only) but follows the exact
# layout tracert.exe -d prints on Windows, including the "<1 ms", "*" and "reports:" forms.

BeforeAll {
    $modulePath = Join-Path -Path $PSScriptRoot -ChildPath '..\src\NetworkDiagnostics\NetworkDiagnostics.psd1'
    Import-Module -Name $modulePath -Force

    $ReachedOutput = @(
        ''
        'Tracing route to 203.0.113.50 over a maximum of 20 hops'
        ''
        '  1    <1 ms    <1 ms    <1 ms  192.0.2.1 '
        '  2     3 ms     2 ms     4 ms  198.51.100.1 '
        '  3     *        *        *     Request timed out.'
        '  4    11 ms    10 ms    12 ms  203.0.113.50 '
        ''
        'Trace complete.'
    )

    $NotReachedOutput = @(
        ''
        'Tracing route to 203.0.113.99 over a maximum of 4 hops'
        ''
        '  1    <1 ms    <1 ms    <1 ms  192.0.2.1 '
        '  2     5 ms     4 ms     *     198.51.100.1 '
        '  3     *        *        *     Request timed out.'
        '  4     *        *        *     Request timed out.'
        ''
        'Trace complete.'
    )

    $UnreachableOutput = @(
        ''
        'Tracing route to 203.0.113.77 over a maximum of 20 hops'
        ''
        '  1    <1 ms    <1 ms    <1 ms  192.0.2.1 '
        '  2  192.0.2.1  reports: Destination host unreachable.'
        ''
        'Trace complete.'
    )

    $HostNameOutput = @(
        ''
        'Tracing route to intranet.example [203.0.113.50]'
        'over a maximum of 20 hops:'
        ''
        '  1    <1 ms    <1 ms    <1 ms  192.0.2.1 '
        '  2     9 ms     8 ms     9 ms  203.0.113.50 '
        ''
        'Trace complete.'
    )

    $IPv6Output = @(
        ''
        'Tracing route to 2001:db8::50 over a maximum of 20 hops'
        ''
        '  1     1 ms    <1 ms    <1 ms  2001:db8::1 '
        '  2     6 ms     5 ms     5 ms  2001:db8::50 '
        ''
        'Trace complete.'
    )

    $UnresolvedOutput = @('Unable to resolve target system name missing.example.')
}

Describe 'ConvertFrom-NdtTracertOutput' -Tag 'Unit' {
    It 'parses hops, probe times and timeouts' {
        InModuleScope NetworkDiagnostics -Parameters @{ Lines = $ReachedOutput } {
            param($Lines)
            $p = ConvertFrom-NdtTracertOutput -Line $Lines -Target '203.0.113.50'
            $p.Hops.Count | Should -Be 4
            $p.Hops[0].Hop | Should -Be 1
            $p.Hops[0].Probe1 | Should -Be '<1 ms'
            $p.Hops[0].Address | Should -Be '192.0.2.1'
            $p.Hops[1].Probe3 | Should -Be '4 ms'
            $p.Hops[2].Address | Should -BeNullOrEmpty
            $p.Hops[2].TimedOutCount | Should -Be 3
            $p.Hops[2].Note | Should -Be 'Request timed out.'
            $p.Reached | Should -BeTrue
            $p.DestinationAddress | Should -Be '203.0.113.50'
        }
    }

    It 'reads the destination address from the header for host names' {
        InModuleScope NetworkDiagnostics -Parameters @{ Lines = $HostNameOutput } {
            param($Lines)
            $p = ConvertFrom-NdtTracertOutput -Line $Lines -Target 'intranet.example'
            $p.DestinationAddress | Should -Be '203.0.113.50'
            $p.Reached | Should -BeTrue
            $p.Hops.Count | Should -Be 2
        }
    }

    It 'handles IPv6 hops' {
        InModuleScope NetworkDiagnostics -Parameters @{ Lines = $IPv6Output } {
            param($Lines)
            $p = ConvertFrom-NdtTracertOutput -Line $Lines -Target '2001:db8::50'
            $p.Hops[1].Address | Should -Be '2001:db8::50'
            $p.Reached | Should -BeTrue
        }
    }

    It 'is not reached when the last hops time out' {
        InModuleScope NetworkDiagnostics -Parameters @{ Lines = $NotReachedOutput } {
            param($Lines)
            $p = ConvertFrom-NdtTracertOutput -Line $Lines -Target '203.0.113.99'
            $p.Reached | Should -BeFalse
            $p.Hops.Count | Should -Be 4
            $p.Hops[1].TimedOutCount | Should -Be 1
        }
    }

    It 'parses "reports: Destination host unreachable" lines' {
        InModuleScope NetworkDiagnostics -Parameters @{ Lines = $UnreachableOutput } {
            param($Lines)
            $p = ConvertFrom-NdtTracertOutput -Line $Lines -Target '203.0.113.77'
            $p.Hops.Count | Should -Be 2
            $p.Hops[1].Address | Should -Be '192.0.2.1'
            $p.Hops[1].Note | Should -Be 'reports: Destination host unreachable.'
            $p.Reached | Should -BeFalse
        }
    }

    It 'keeps non-hop lines when no hops are returned' {
        InModuleScope NetworkDiagnostics -Parameters @{ Lines = $UnresolvedOutput } {
            param($Lines)
            $p = ConvertFrom-NdtTracertOutput -Line $Lines -Target 'missing.example'
            $p.Hops.Count | Should -Be 0
            $p.OtherLines | Should -Contain 'Unable to resolve target system name missing.example.'
        }
    }

    It 'handles empty output' {
        InModuleScope NetworkDiagnostics {
            $p = ConvertFrom-NdtTracertOutput -Line @() -Target '192.0.2.1'
            $p.Hops.Count | Should -Be 0
            $p.Reached | Should -BeFalse
        }
    }
}

Describe 'Trace-NdtRoute with mocked tracert output' -Tag 'Unit' {
    It 'is PASS when the destination is reached and mentions silent hops' {
        Mock -ModuleName NetworkDiagnostics Invoke-NdtTracert { [pscustomobject]@{ ExitCode = 0; Lines = $ReachedOutput } }
        $r = Trace-NdtRoute -Target 203.0.113.50
        $r.Status | Should -Be 'PASS'
        $r.Summary | Should -BeLike 'Reached 203.0.113.50 in 4 hop(s). 1 hop(s) did not reply*'
        $r.HopCount | Should -Be 4
        $r.SilentHopCount | Should -Be 1
        $r.Details[0] | Should -BeLike 'Hop*Probe 1*Address / note'
        $r.Details[3] | Should -BeLike '3*(no reply)*'
    }

    It 'is FAIL with the last answering hop when the destination is not reached' {
        Mock -ModuleName NetworkDiagnostics Invoke-NdtTracert { [pscustomobject]@{ ExitCode = 0; Lines = $NotReachedOutput } }
        $r = Trace-NdtRoute -Target 203.0.113.99 -MaxHops 4
        $r.Status | Should -Be 'FAIL'
        $r.Summary | Should -BeLike '*within 4 hops. Last hop that answered: hop 2 (198.51.100.1)*'
    }

    It 'is FAIL with the router message for destination unreachable' {
        Mock -ModuleName NetworkDiagnostics Invoke-NdtTracert { [pscustomobject]@{ ExitCode = 0; Lines = $UnreachableOutput } }
        $r = Trace-NdtRoute -Target 203.0.113.77
        $r.Status | Should -Be 'FAIL'
        $r.Summary | Should -Be 'Did not reach 203.0.113.77. Hop 2 (192.0.2.1) reported: reports: Destination host unreachable.'
    }

    It 'is FAIL with tracert''s message when the name cannot be resolved' {
        Mock -ModuleName NetworkDiagnostics Invoke-NdtTracert { [pscustomobject]@{ ExitCode = 1; Lines = $UnresolvedOutput } }
        $r = Trace-NdtRoute -Target missing.example
        $r.Status | Should -Be 'FAIL'
        $r.Summary | Should -Be 'tracert returned no hops: Unable to resolve target system name missing.example.'
    }

    It 'is FAIL (not an exception) when tracert cannot be started' {
        Mock -ModuleName NetworkDiagnostics Invoke-NdtTracert { throw [System.IO.FileNotFoundException]::new('tracert.exe was not found at C:\Windows\System32\tracert.exe.') }
        $r = Trace-NdtRoute -Target 192.0.2.1
        $r.Status | Should -Be 'FAIL'
        $r.Summary | Should -BeLike 'Could not run tracert: tracert.exe was not found*'
    }

    It 'passes MaxHops and TimeoutMs to tracert' {
        Mock -ModuleName NetworkDiagnostics Invoke-NdtTracert { [pscustomobject]@{ ExitCode = 0; Lines = $ReachedOutput } }
        $null = Trace-NdtRoute -Target 203.0.113.50 -MaxHops 12 -TimeoutMs 400
        Should -Invoke -ModuleName NetworkDiagnostics Invoke-NdtTracert -Times 1 -Exactly -ParameterFilter { $Target -eq '203.0.113.50' -and $MaxHops -eq 12 -and $TimeoutMs -eq 400 }
    }
}
