# Unit tests for input validation and safety limits (src/NetworkDiagnostics/Private/Validation.ps1).
# No network traffic: anything that could reach the network is mocked to throw.

BeforeAll {
    $modulePath = Join-Path -Path $PSScriptRoot -ChildPath '..\src\NetworkDiagnostics\NetworkDiagnostics.psd1'
    Import-Module -Name $modulePath -Force
}

Describe 'IPv4 address validation' -Tag 'Unit' {
    It 'accepts <Value>' -ForEach @(
        @{ Value = '192.0.2.10' }
        @{ Value = '0.0.0.0' }
        @{ Value = '127.0.0.1' }
        @{ Value = '255.255.255.255' }
        @{ Value = '198.51.100.0' }
    ) {
        InModuleScope NetworkDiagnostics -Parameters @{ Value = $Value } {
            param($Value)
            Test-NdtIPv4Address -Value $Value | Should -BeTrue
        }
    }

    # TryParse accepts several of these; the strict check must not.
    It 'rejects input: <Reason>' -ForEach @(
        @{ Value = '1'; Reason = 'TryParse would read 0.0.0.1' }
        @{ Value = '192.168.1'; Reason = 'TryParse would read 192.168.0.1' }
        @{ Value = '010.1.1.1'; Reason = 'leading zero is read as octal by TryParse' }
        @{ Value = '0x7f.0.0.1'; Reason = 'hex form' }
        @{ Value = '256.1.1.1'; Reason = 'octet over 255' }
        @{ Value = '1.2.3.4.5'; Reason = 'five octets' }
        @{ Value = ' 192.0.2.1'; Reason = 'leading space' }
        @{ Value = "192.0.2.1`n"; Reason = 'trailing newline' }
        @{ Value = ''; Reason = 'empty' }
    ) {
        InModuleScope NetworkDiagnostics -Parameters @{ Value = $Value } {
            param($Value)
            Test-NdtIPv4Address -Value $Value | Should -BeFalse
        }
    }
}

Describe 'IPv6 address validation' -Tag 'Unit' {
    It 'accepts <Value>' -ForEach @(
        @{ Value = '::1' }
        @{ Value = '2001:db8::10' }
        @{ Value = 'fe80::1%12' }
        @{ Value = '2001:DB8:0:0:0:0:0:1' }
    ) {
        InModuleScope NetworkDiagnostics -Parameters @{ Value = $Value } {
            param($Value)
            Test-NdtIPv6Address -Value $Value | Should -BeTrue
        }
    }

    It 'rejects <Value>' -ForEach @(
        @{ Value = '2001:db8::zz' }
        @{ Value = 'fe80::1%eth0' }
        @{ Value = '192.0.2.1' }
        @{ Value = ':::' }
        @{ Value = '2001:db8::1 ; whoami' }
    ) {
        InModuleScope NetworkDiagnostics -Parameters @{ Value = $Value } {
            param($Value)
            Test-NdtIPv6Address -Value $Value | Should -BeFalse
        }
    }
}

Describe 'Host name validation (RFC 1123)' -Tag 'Unit' {
    It 'accepts <Value>' -ForEach @(
        @{ Value = 'localhost' }
        @{ Value = 'printer01.example' }
        @{ Value = 'www.example.com.' }
        @{ Value = 'a-b.example.org' }
        @{ Value = '3com.example' }
        @{ Value = ('a' * 63) + '.example' }
    ) {
        InModuleScope NetworkDiagnostics -Parameters @{ Value = $Value } {
            param($Value)
            Test-NdtHostname -Value $Value | Should -BeTrue
        }
    }

    It 'rejects <Name>' -ForEach @(
        @{ Name = 'leading hyphen'; Value = '-h' }
        @{ Name = 'trailing hyphen label'; Value = 'host-.example' }
        @{ Name = 'underscore'; Value = 'host_name.example' }
        @{ Name = 'empty label'; Value = 'a..example' }
        @{ Name = 'label over 63 characters'; Value = ('a' * 64) + '.example' }
        @{ Name = 'name over 253 characters'; Value = ((1..26 | ForEach-Object { 'abcdefghi' }) -join '.') }
        @{ Name = 'numeric last label'; Value = '192.0.2.300' }
        @{ Name = 'space'; Value = 'my host' }
        @{ Name = 'shell characters'; Value = 'host;calc' }
        @{ Name = 'non-ASCII'; Value = ('caf' + [char]0x00E9 + '.example') }
    ) {
        InModuleScope NetworkDiagnostics -Parameters @{ Value = $Value } {
            param($Value)
            Test-NdtHostname -Value $Value | Should -BeFalse
        }
    }

    It 'allows underscores only for DNS query names' {
        InModuleScope NetworkDiagnostics {
            Test-NdtHostname -Value '_ldap._tcp.example.com' | Should -BeFalse
            Test-NdtHostname -Value '_ldap._tcp.example.com' -AllowUnderscore | Should -BeTrue
        }
    }
}

Describe 'Get-NdtValidatedTarget safety rules' -Tag 'Unit' {
    It 'returns a trimmed valid target' {
        InModuleScope NetworkDiagnostics {
            Get-NdtValidatedTarget -Target '  192.0.2.10 ' | Should -Be '192.0.2.10'
            Get-NdtValidatedTarget -Target 'server01.example' | Should -Be 'server01.example'
        }
    }

    It 'rejects <Value> with a message containing "<Expected>"' -ForEach @(
        @{ Value = '192.0.2.0/24'; Expected = 'CIDR' }
        @{ Value = '2001:db8::/64'; Expected = 'CIDR' }
        @{ Value = '192.0.2.1-50'; Expected = 'range' }
        @{ Value = '192.0.2.1-192.0.2.9'; Expected = 'range' }
        @{ Value = '*.example.com'; Expected = 'wildcard' }
        @{ Value = 'host?.example'; Expected = 'wildcard' }
        @{ Value = '255.255.255.255'; Expected = 'broadcast' }
        @{ Value = '224.0.0.1'; Expected = 'multicast' }
        @{ Value = '239.255.255.250'; Expected = 'multicast' }
        @{ Value = 'ff02::1'; Expected = 'multicast' }
        @{ Value = '0.0.0.0'; Expected = 'not a host address' }
        @{ Value = '::'; Expected = 'not a host address' }
        @{ Value = '192.168.1'; Expected = 'not a valid IPv4 address' }
        @{ Value = '300.1.1.1'; Expected = 'not a valid IPv4 address' }
        @{ Value = 'not_valid'; Expected = 'not a valid IP address or host name' }
        @{ Value = ''; Expected = 'required' }
        @{ Value = '   '; Expected = 'required' }
    ) {
        InModuleScope NetworkDiagnostics -Parameters @{ Value = $Value; Expected = $Expected } {
            param($Value, $Expected)
            { Get-NdtValidatedTarget -Target $Value } | Should -Throw -ExpectedMessage "*$Expected*"
        }
    }

    It 'does not echo control characters from bad input back to the console' {
        InModuleScope NetworkDiagnostics {
            $escape = [char]27
            $bad = "bad${escape}[31mname"
            $caught = $null
            try { Get-NdtValidatedTarget -Target $bad } catch { $caught = $_.Exception.Message }
            $caught | Should -Not -BeNullOrEmpty
            $caught.Contains([string]$escape) | Should -BeFalse
        }
    }
}

Describe 'Target and port list limits' -Tag 'Unit' {
    It 'removes duplicates case-insensitively and keeps order' {
        InModuleScope NetworkDiagnostics {
            $list = @(Get-NdtValidatedTargetList -Target @('Server01.example', '192.0.2.1', 'server01.EXAMPLE', '', '192.0.2.1'))
            $list.Count | Should -Be 2
            $list[0] | Should -Be 'Server01.example'
            $list[1] | Should -Be '192.0.2.1'
        }
    }

    It 'accepts exactly 10 targets' {
        InModuleScope NetworkDiagnostics {
            $ten = 1..10 | ForEach-Object { "192.0.2.$_" }
            @(Get-NdtValidatedTargetList -Target $ten).Count | Should -Be 10
        }
    }

    It 'rejects 11 targets' {
        InModuleScope NetworkDiagnostics {
            $eleven = 1..11 | ForEach-Object { "192.0.2.$_" }
            { Get-NdtValidatedTargetList -Target $eleven } | Should -Throw -ExpectedMessage '*limit is 10*'
        }
    }

    It 'rejects an empty list' {
        InModuleScope NetworkDiagnostics {
            { Get-NdtValidatedTargetList -Target @('', ' ') } | Should -Throw -ExpectedMessage '*No targets*'
        }
    }

    It 'accepts ports at the edges of the range and removes duplicates' {
        InModuleScope NetworkDiagnostics {
            $ports = @(Get-NdtValidatedPortList -Port @(1, 65535, 443, 443))
            $ports | Should -Be @(1, 65535, 443)
        }
    }

    It 'rejects port <Port>' -ForEach @(@{ Port = 0 }, @{ Port = 65536 }, @{ Port = -1 }) {
        InModuleScope NetworkDiagnostics -Parameters @{ Port = $Port } {
            param($Port)
            { Get-NdtValidatedPortList -Port @($Port) } | Should -Throw -ExpectedMessage '*out of range*'
        }
    }

    It 'rejects more than 20 ports' {
        InModuleScope NetworkDiagnostics {
            { Get-NdtValidatedPortList -Port (1..21) } | Should -Throw -ExpectedMessage '*limit is 20*'
        }
    }

    It 'rejects more than 20 TCP checks in total' {
        InModuleScope NetworkDiagnostics {
            Get-NdtValidatedTcpCheckCount -TargetCount 4 -PortCount 5 | Should -Be 20
            { Get-NdtValidatedTcpCheckCount -TargetCount 3 -PortCount 7 } | Should -Throw -ExpectedMessage '*21 TCP checks*'
        }
    }
}

Describe 'Typed menu input parsing' -Tag 'Unit' {
    It 'splits on commas, semicolons and spaces' {
        InModuleScope NetworkDiagnostics {
            $items = @(ConvertFrom-NdtListInput -Text ' 192.0.2.1, 192.0.2.2;printer01.example   192.0.2.3 ')
            $items | Should -Be @('192.0.2.1', '192.0.2.2', 'printer01.example', '192.0.2.3')
        }
    }

    It 'returns nothing for blank input' {
        InModuleScope NetworkDiagnostics {
            @(ConvertFrom-NdtListInput -Text '   ').Count | Should -Be 0
        }
    }

    It 'parses a port list' {
        InModuleScope NetworkDiagnostics {
            @(ConvertFrom-NdtPortInput -Text '80, 443 3389') | Should -Be @(80, 443, 3389)
        }
    }

    It 'rejects port input "<Text>"' -ForEach @(
        @{ Text = '1-1024'; Expected = 'ranges' }
        @{ Text = '80,abc'; Expected = 'not a port number' }
        @{ Text = '443.5'; Expected = 'not a port number' }
        @{ Text = '99999'; Expected = 'out of range' }
        @{ Text = ''; Expected = 'No ports' }
    ) {
        InModuleScope NetworkDiagnostics -Parameters @{ Text = $Text; Expected = $Expected } {
            param($Text, $Expected)
            { ConvertFrom-NdtPortInput -Text $Text } | Should -Throw -ExpectedMessage "*$Expected*"
        }
    }
}

Describe 'Public commands enforce the limits before any network call' -Tag 'Unit' {
    BeforeEach {
        Mock -ModuleName NetworkDiagnostics Invoke-NdtPing { throw 'Invoke-NdtPing must not be called' }
        Mock -ModuleName NetworkDiagnostics Invoke-NdtTcpConnect { throw 'Invoke-NdtTcpConnect must not be called' }
        Mock -ModuleName NetworkDiagnostics Invoke-NdtTracert { throw 'Invoke-NdtTracert must not be called' }
        Mock -ModuleName NetworkDiagnostics Resolve-DnsName { throw 'Resolve-DnsName must not be called' }
    }

    It 'Test-NdtPing rejects a CIDR range' {
        { Test-NdtPing -Target '192.0.2.0/24' } | Should -Throw -ExpectedMessage '*CIDR*'
        Should -Invoke -ModuleName NetworkDiagnostics Invoke-NdtPing -Times 0 -Exactly
    }

    It 'Test-NdtPing applies the 10-target limit to pipeline input as a whole' {
        { 1..11 | ForEach-Object { "192.0.2.$_" } | Test-NdtPing -Count 1 } | Should -Throw -ExpectedMessage '*limit is 10*'
        Should -Invoke -ModuleName NetworkDiagnostics Invoke-NdtPing -Times 0 -Exactly
    }

    It 'Test-NdtPing rejects a count above 10' {
        { Test-NdtPing -Target 192.0.2.1 -Count 11 } | Should -Throw
    }

    It 'Test-NdtPort rejects a port range string' {
        { Test-NdtPort -Target 192.0.2.1 -Port '1-1024' } | Should -Throw
        Should -Invoke -ModuleName NetworkDiagnostics Invoke-NdtTcpConnect -Times 0 -Exactly
    }

    It 'Test-NdtPort rejects more than 20 checks in total' {
        { Test-NdtPort -Target 192.0.2.1, 192.0.2.2, 192.0.2.3 -Port (1..7) } | Should -Throw -ExpectedMessage '*limit is 20*'
        Should -Invoke -ModuleName NetworkDiagnostics Invoke-NdtTcpConnect -Times 0 -Exactly
    }

    It 'Trace-NdtRoute rejects a multicast target' {
        { Trace-NdtRoute -Target 224.0.0.1 } | Should -Throw -ExpectedMessage '*multicast*'
        Should -Invoke -ModuleName NetworkDiagnostics Invoke-NdtTracert -Times 0 -Exactly
    }

    It 'Trace-NdtRoute rejects more than 30 hops' {
        { Trace-NdtRoute -Target 192.0.2.1 -MaxHops 31 } | Should -Throw
    }

    It 'Resolve-NdtDnsName rejects an invalid DNS server' {
        { Resolve-NdtDnsName -Name example.com -Server '198.51.100.0/24' } | Should -Throw -ExpectedMessage '*CIDR*'
        Should -Invoke -ModuleName NetworkDiagnostics Resolve-DnsName -Times 0 -Exactly
    }

    It 'Invoke-NdtQuickCheck rejects 11 targets' {
        { Invoke-NdtQuickCheck -Target (1..11 | ForEach-Object { "192.0.2.$_" }) } | Should -Throw -ExpectedMessage '*limit is 10*'
    }
}
