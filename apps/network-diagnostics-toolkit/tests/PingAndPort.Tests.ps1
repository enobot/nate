# Unit tests for ping and TCP port checks.
# The OS/.NET wrappers (Resolve-NdtAddress, Invoke-NdtPing, Invoke-NdtTcpConnect) are mocked
# so each case is repeatable. The code under test is the toolkit's own decision logic:
# counting replies, PASS/WARN/FAIL rules, messages and error handling.

BeforeAll {
    $modulePath = Join-Path -Path $PSScriptRoot -ChildPath '..\src\NetworkDiagnostics\NetworkDiagnostics.psd1'
    Import-Module -Name $modulePath -Force
}

Describe 'ConvertTo-NdtPingResult' -Tag 'Unit' {
    It 'is PASS when every request gets a reply, with min/avg/max' {
        InModuleScope NetworkDiagnostics {
            $replies = @(
                [pscustomobject]@{ Status = 'Success'; RoundtripMs = 2; ReplyAddress = '192.0.2.10'; Ttl = 64; Message = '' }
                [pscustomobject]@{ Status = 'Success'; RoundtripMs = 4; ReplyAddress = '192.0.2.10'; Ttl = 64; Message = '' }
                [pscustomobject]@{ Status = 'Success'; RoundtripMs = 3; ReplyAddress = '192.0.2.10'; Ttl = 64; Message = '' }
                [pscustomobject]@{ Status = 'Success'; RoundtripMs = 7; ReplyAddress = '192.0.2.10'; Ttl = 64; Message = '' }
            )
            $r = ConvertTo-NdtPingResult -Target '192.0.2.10' -ResolvedAddress '192.0.2.10' -Reply $replies
            $r.Status | Should -Be 'PASS'
            $r.Sent | Should -Be 4
            $r.Received | Should -Be 4
            $r.LossPercent | Should -Be 0
            $r.MinMs | Should -Be 2
            $r.AverageMs | Should -Be 4
            $r.MaxMs | Should -Be 7
            $r.Summary | Should -Be '4/4 replies, 0% loss, min/avg/max 2/4/7 ms'
            $r.Details.Count | Should -Be 4
            $r.Details[0] | Should -Be 'Reply 1: Success from 192.0.2.10 time=2 ms TTL=64'
        }
    }

    It 'is WARN with partial packet loss' {
        InModuleScope NetworkDiagnostics {
            $replies = @(
                [pscustomobject]@{ Status = 'Success'; RoundtripMs = 10; ReplyAddress = '192.0.2.10'; Ttl = 64; Message = '' }
                [pscustomobject]@{ Status = 'TimedOut'; RoundtripMs = 0; ReplyAddress = $null; Ttl = $null; Message = '' }
                [pscustomobject]@{ Status = 'Success'; RoundtripMs = 20; ReplyAddress = '192.0.2.10'; Ttl = 64; Message = '' }
                [pscustomobject]@{ Status = 'Success'; RoundtripMs = 30; ReplyAddress = '192.0.2.10'; Ttl = 64; Message = '' }
            )
            $r = ConvertTo-NdtPingResult -Target '192.0.2.10' -ResolvedAddress '192.0.2.10' -Reply $replies
            $r.Status | Should -Be 'WARN'
            $r.Received | Should -Be 3
            $r.LossPercent | Should -Be 25
            $r.AverageMs | Should -Be 20
            $r.Summary | Should -BeLike '3/4 replies, 25% loss, avg 20 ms*'
            $r.Details[1] | Should -Be 'Reply 2: TimedOut'
        }
    }

    It 'is FAIL with no replies and explains a timeout' {
        InModuleScope NetworkDiagnostics {
            $replies = 1..2 | ForEach-Object { [pscustomobject]@{ Status = 'TimedOut'; RoundtripMs = 0; ReplyAddress = $null; Ttl = $null; Message = '' } }
            $r = ConvertTo-NdtPingResult -Target '192.0.2.99' -ResolvedAddress '192.0.2.99' -Reply $replies -TimeoutMs 1500
            $r.Status | Should -Be 'FAIL'
            $r.LossPercent | Should -Be 100
            $r.AverageMs | Should -BeNullOrEmpty
            $r.Summary | Should -BeLike '0/2 replies, 100% loss. No reply within 1500 ms*'
            $r.Summary | Should -BeLike '*TCP port check*'
        }
    }

    It 'does not count "destination host unreachable" replies as received' {
        InModuleScope NetworkDiagnostics {
            $replies = 1..3 | ForEach-Object { [pscustomobject]@{ Status = 'DestinationHostUnreachable'; RoundtripMs = 0; ReplyAddress = '192.0.2.1'; Ttl = $null; Message = '' } }
            $r = ConvertTo-NdtPingResult -Target '192.0.2.50' -ResolvedAddress '192.0.2.50' -Reply $replies
            $r.Status | Should -Be 'FAIL'
            $r.Received | Should -Be 0
            $r.Summary | Should -BeLike '*Destination host unreachable*'
        }
    }

    It 'shows the resolved address when a host name was tested' {
        InModuleScope NetworkDiagnostics {
            $replies = @([pscustomobject]@{ Status = 'Success'; RoundtripMs = 1; ReplyAddress = '192.0.2.10'; Ttl = 128; Message = '' })
            $r = ConvertTo-NdtPingResult -Target 'server01.example' -ResolvedAddress '192.0.2.10' -Reply $replies
            $r.Summary | Should -BeLike '1/1 replies (resolved to 192.0.2.10)*'
            $r.Target | Should -Be 'server01.example'
            $r.TestType | Should -Be 'Ping'
        }
    }

    It 'produces the shared result shape and type names' {
        InModuleScope NetworkDiagnostics {
            $replies = @([pscustomobject]@{ Status = 'Success'; RoundtripMs = 1; ReplyAddress = '192.0.2.10'; Ttl = 128; Message = '' })
            $r = ConvertTo-NdtPingResult -Target '192.0.2.10' -ResolvedAddress '192.0.2.10' -Reply $replies
            $r.PSObject.TypeNames[0] | Should -Be 'NetworkDiagnostics.Result.Ping'
            $r.PSObject.TypeNames | Should -Contain 'NetworkDiagnostics.Result'
            $r.Timestamp | Should -Match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$'
            $r.SourceComputer | Should -Be ([System.Environment]::MachineName)
        }
    }
}

Describe 'Test-NdtPing with mocked replies' -Tag 'Unit' {
    BeforeEach {
        Mock -ModuleName NetworkDiagnostics Start-Sleep { }
    }

    It 'sends Count echo requests to the resolved address' {
        Mock -ModuleName NetworkDiagnostics Resolve-NdtAddress { [System.Net.IPAddress]::Parse('192.0.2.10') }
        Mock -ModuleName NetworkDiagnostics Invoke-NdtPing { [pscustomobject]@{ Status = 'Success'; RoundtripMs = 5; ReplyAddress = '192.0.2.10'; Ttl = 64; Message = '' } }

        $r = Test-NdtPing -Target 'server01.example' -Count 3
        $r.Status | Should -Be 'PASS'
        $r.ResolvedAddress | Should -Be '192.0.2.10'
        Should -Invoke -ModuleName NetworkDiagnostics Invoke-NdtPing -Times 3 -Exactly -ParameterFilter { $Address.ToString() -eq '192.0.2.10' -and $TimeoutMs -eq 1000 }
        Should -Invoke -ModuleName NetworkDiagnostics Start-Sleep -Times 2 -Exactly
    }

    It 'returns one result per target in the order given' {
        Mock -ModuleName NetworkDiagnostics Invoke-NdtPing { [pscustomobject]@{ Status = 'Success'; RoundtripMs = 1; ReplyAddress = $Address.ToString(); Ttl = 64; Message = '' } }
        $results = @(Test-NdtPing -Target 192.0.2.1, 192.0.2.2 -Count 1)
        $results.Count | Should -Be 2
        $results[0].Target | Should -Be '192.0.2.1'
        $results[1].Target | Should -Be '192.0.2.2'
    }

    It 'reports FAIL (not an exception) when the name does not resolve' {
        Mock -ModuleName NetworkDiagnostics Resolve-NdtAddress { throw [System.Net.Sockets.SocketException]::new(11001) }
        Mock -ModuleName NetworkDiagnostics Invoke-NdtPing { throw 'Invoke-NdtPing must not be called when the name does not resolve' }
        $r = Test-NdtPing -Target 'missing.example' -Count 2
        $r.Status | Should -Be 'FAIL'
        $r.Summary | Should -BeLike "Could not resolve 'missing.example'*"
        $r.ReplyStatus | Should -Be 'NameResolutionFailed'
        Should -Invoke -ModuleName NetworkDiagnostics Invoke-NdtPing -Times 0 -Exactly
    }

    It 'records an error reply when the ping call itself throws' {
        Mock -ModuleName NetworkDiagnostics Invoke-NdtPing { throw [System.Net.NetworkInformation.PingException]::new('An exception occurred during a Ping request.') }
        $r = Test-NdtPing -Target 192.0.2.10 -Count 2
        $r.Status | Should -Be 'FAIL'
        $r.ReplyStatus | Should -Be @('Error', 'Error')
        $r.Details[0] | Should -BeLike 'Reply 1: Error (An exception occurred during a Ping request.)'
    }

    It 'passes the timeout through to each request' {
        Mock -ModuleName NetworkDiagnostics Invoke-NdtPing { [pscustomobject]@{ Status = 'TimedOut'; RoundtripMs = 0; ReplyAddress = $null; Ttl = $null; Message = '' } }
        $r = Test-NdtPing -Target 192.0.2.10 -Count 1 -TimeoutMs 250
        $r.TimeoutMs | Should -Be 250
        Should -Invoke -ModuleName NetworkDiagnostics Invoke-NdtPing -Times 1 -Exactly -ParameterFilter { $TimeoutMs -eq 250 }
    }
}

Describe 'Test-NdtPort with mocked connections' -Tag 'Unit' {
    It 'maps <State> to <Status>' -ForEach @(
        @{ State = 'Open'; Status = 'PASS'; Text = 'TCP port 443 is open on 192.0.2.20 (connected in 12 ms).' }
        @{ State = 'Refused'; Status = 'FAIL'; Text = 'TCP port 443 refused on 192.0.2.20: the host answered*' }
        @{ State = 'TimedOut'; Status = 'FAIL'; Text = 'TCP port 443 on 192.0.2.20 did not answer within 3000 ms*' }
        @{ State = 'Unreachable'; Status = 'FAIL'; Text = '*host or network unreachable*' }
        @{ State = 'Error'; Status = 'FAIL'; Text = '*connection error*' }
    ) {
        Mock -ModuleName NetworkDiagnostics Invoke-NdtTcpConnect { [pscustomobject]@{ State = $State; ElapsedMs = 12; Message = 'test' } }
        $r = Test-NdtPort -Target 192.0.2.20 -Port 443
        $r.Status | Should -Be $Status
        $r.State | Should -Be $State
        $r.Port | Should -Be 443
        $r.Summary | Should -BeLike $Text
    }

    It 'returns one result per host and port' {
        Mock -ModuleName NetworkDiagnostics Invoke-NdtTcpConnect { [pscustomobject]@{ State = 'Open'; ElapsedMs = 1; Message = '' } }
        $results = @(Test-NdtPort -Target 192.0.2.20, 192.0.2.21 -Port 80, 443, 443)
        $results.Count | Should -Be 4
        ($results | ForEach-Object { "$($_.Target):$($_.Port)" }) | Should -Be @('192.0.2.20:80', '192.0.2.20:443', '192.0.2.21:80', '192.0.2.21:443')
    }

    It 'reports name resolution failure for each requested port without connecting' {
        Mock -ModuleName NetworkDiagnostics Resolve-NdtAddress { throw 'No such host is known' }
        Mock -ModuleName NetworkDiagnostics Invoke-NdtTcpConnect { throw 'must not be called' }
        $results = @(Test-NdtPort -Target missing.example -Port 80, 443)
        $results.Count | Should -Be 2
        $results | ForEach-Object { $_.Status | Should -Be 'FAIL'; $_.State | Should -Be 'NameResolutionFailed' }
        Should -Invoke -ModuleName NetworkDiagnostics Invoke-NdtTcpConnect -Times 0 -Exactly
    }

    It 'uses a 3000 ms default timeout and passes a custom one' {
        Mock -ModuleName NetworkDiagnostics Invoke-NdtTcpConnect { [pscustomobject]@{ State = 'Open'; ElapsedMs = 1; Message = '' } }
        $null = Test-NdtPort -Target 192.0.2.20 -Port 22
        Should -Invoke -ModuleName NetworkDiagnostics Invoke-NdtTcpConnect -Times 1 -Exactly -ParameterFilter { $TimeoutMs -eq 3000 -and $Port -eq 22 }
        $null = Test-NdtPort -Target 192.0.2.20 -Port 22 -TimeoutMs 800
        Should -Invoke -ModuleName NetworkDiagnostics Invoke-NdtTcpConnect -Times 1 -Exactly -ParameterFilter { $TimeoutMs -eq 800 }
    }

    It 'rejects a timeout outside 500-10000 ms' {
        { Test-NdtPort -Target 192.0.2.20 -Port 22 -TimeoutMs 100 } | Should -Throw
        { Test-NdtPort -Target 192.0.2.20 -Port 22 -TimeoutMs 20000 } | Should -Throw
    }
}

Describe 'Resolve-NdtAddress' -Tag 'Unit' {
    It 'returns IP literals without a lookup' {
        InModuleScope NetworkDiagnostics {
            (Resolve-NdtAddress -Target '192.0.2.10').ToString() | Should -Be '192.0.2.10'
            (Resolve-NdtAddress -Target '::1').ToString() | Should -Be '::1'
        }
    }
}
