# Unit tests for Resolve-NdtDnsName. Resolve-DnsName is mocked with objects shaped like the
# real DnsClient records (Name, Type, Section, TTL and type-specific properties) and with the
# same Win32 error codes the real cmdlet raises. All names and addresses are fictional.

BeforeAll {
    $modulePath = Join-Path -Path $PSScriptRoot -ChildPath '..\src\NetworkDiagnostics\NetworkDiagnostics.psd1'
    Import-Module -Name $modulePath -Force
}

Describe 'Resolve-NdtDnsName answers' -Tag 'Unit' {
    It 'is PASS with A records and ignores Authority/Additional sections' {
        Mock -ModuleName NetworkDiagnostics Resolve-DnsName {
            [pscustomobject]@{ Name = 'intranet.example'; Type = 'A'; Section = 'Answer'; TTL = 300; IPAddress = '203.0.113.50' }
            [pscustomobject]@{ Name = 'intranet.example'; Type = 'A'; Section = 'Answer'; TTL = 300; IPAddress = '203.0.113.51' }
            [pscustomobject]@{ Name = 'ns1.example'; Type = 'A'; Section = 'Additional'; TTL = 300; IPAddress = '198.51.100.53' }
        }
        $r = Resolve-NdtDnsName -Name intranet.example
        $r.Status | Should -Be 'PASS'
        $r.RecordCount | Should -Be 2
        $r.Records | Should -Be @('A 203.0.113.50 (TTL 300s)', 'A 203.0.113.51 (TTL 300s)')
        $r.Summary | Should -BeLike 'A lookup for intranet.example returned 2 record(s) in * ms: A 203.0.113.50 (TTL 300s); A 203.0.113.51 (TTL 300s)'
        $r.Outcome | Should -Be 'Answer'
    }

    It 'treats a name with only an SOA in the Authority section as "no records"' {
        Mock -ModuleName NetworkDiagnostics Resolve-DnsName {
            [pscustomobject]@{ Name = 'example.com'; Type = 'SOA'; Section = 'Authority'; TTL = 3600; PrimaryServer = 'ns1.example.com'; NameAdministrator = 'hostmaster.example.com'; SerialNumber = 2026112201 }
        }
        $r = Resolve-NdtDnsName -Name example.com -RecordType SRV
        $r.Status | Should -Be 'FAIL'
        $r.Outcome | Should -Be 'NoRecords'
        $r.Summary | Should -BeLike '*returned no SRV records. The name exists*'
    }

    It 'keeps Question-section answers (hosts file / local resolver)' {
        Mock -ModuleName NetworkDiagnostics Resolve-DnsName {
            [pscustomobject]@{ Name = 'localhost'; Type = 'A'; Section = 'Question'; TTL = 1200; IPAddress = '127.0.0.1' }
        }
        $r = Resolve-NdtDnsName -Name localhost
        $r.Status | Should -Be 'PASS'
        $r.Records | Should -Be 'A 127.0.0.1 (TTL 1200s)'
    }

    It 'formats <Type> records' -ForEach @(
        @{ Type = 'MX'; Record = @{ Name = 'example.com'; Type = 'MX'; Section = 'Answer'; TTL = 60; NameExchange = 'mail.example.com'; Preference = 10 }; Expected = 'MX preference 10 mail.example.com (TTL 60s)' }
        @{ Type = 'TXT'; Record = @{ Name = 'example.com'; Type = 'TXT'; Section = 'Answer'; TTL = 60; Strings = @('v=spf1 ', '-all') }; Expected = 'TXT "v=spf1 -all" (TTL 60s)' }
        @{ Type = 'CNAME'; Record = @{ Name = 'www.example.com'; Type = 'CNAME'; Section = 'Answer'; TTL = 60; NameHost = 'web01.example.com' }; Expected = 'CNAME www.example.com -> web01.example.com (TTL 60s)' }
        @{ Type = 'NS'; Record = @{ Name = 'example.com'; Type = 'NS'; Section = 'Answer'; TTL = 60; NameHost = 'ns1.example.com' }; Expected = 'NS ns1.example.com (TTL 60s)' }
        @{ Type = 'AAAA'; Record = @{ Name = 'example.com'; Type = 'AAAA'; Section = 'Answer'; TTL = 60; IPAddress = '2001:db8::50' }; Expected = 'AAAA 2001:db8::50 (TTL 60s)' }
        @{ Type = 'SRV'; Record = @{ Name = '_ldap._tcp.example.com'; Type = 'SRV'; Section = 'Answer'; TTL = 60; NameTarget = 'dc01.example.com'; Port = 389; Priority = 0; Weight = 100 }; Expected = 'SRV priority 0 weight 100 port 389 dc01.example.com (TTL 60s)' }
    ) {
        InModuleScope NetworkDiagnostics -Parameters @{ Record = $Record; Expected = $Expected } {
            param($Record, $Expected)
            Format-NdtDnsRecord -Record ([pscustomobject]$Record) | Should -Be $Expected
        }
    }

    It 'removes control characters from untrusted TXT data' {
        $escape = [char]27
        Mock -ModuleName NetworkDiagnostics Resolve-DnsName {
            [pscustomobject]@{ Name = 'example.com'; Type = 'TXT'; Section = 'Answer'; TTL = 60; Strings = @("evil${escape}[2Jtext`r`nline2") }
        }
        $r = Resolve-NdtDnsName -Name example.com -RecordType TXT
        $r.Records[0].Contains([string]$escape) | Should -BeFalse
        $r.Records[0].Contains("`n") | Should -BeFalse
    }
}

Describe 'Resolve-NdtDnsName query options' -Tag 'Unit' {
    BeforeEach {
        Mock -ModuleName NetworkDiagnostics Resolve-DnsName {
            [pscustomobject]@{ Name = 'x'; Type = 'PTR'; Section = 'Answer'; TTL = 60; NameHost = 'host.example' }
        }
    }

    It 'uses PTR automatically for an IP address' {
        $r = Resolve-NdtDnsName -Name 192.0.2.10 -RecordType A
        $r.RecordType | Should -Be 'PTR'
        Should -Invoke -ModuleName NetworkDiagnostics Resolve-DnsName -Times 1 -Exactly -ParameterFilter { $Name -eq '192.0.2.10' -and "$Type" -eq 'PTR' }
    }

    It 'passes -Server and -DnsOnly through' {
        $null = Resolve-NdtDnsName -Name host.example -RecordType PTR -Server 198.51.100.53 -DnsOnly
        Should -Invoke -ModuleName NetworkDiagnostics Resolve-DnsName -Times 1 -Exactly -ParameterFilter { $Server -contains '198.51.100.53' -and $DnsOnly }
    }

    It 'does not pass -Server or -DnsOnly when they are not given' {
        $null = Resolve-NdtDnsName -Name host.example -RecordType PTR
        Should -Invoke -ModuleName NetworkDiagnostics Resolve-DnsName -Times 1 -Exactly -ParameterFilter { -not $PSBoundParameters.ContainsKey('Server') -and -not $DnsOnly }
    }

    It 'accepts SRV-style names with underscores' {
        $null = Resolve-NdtDnsName -Name _ldap._tcp.example.com -RecordType SRV
        Should -Invoke -ModuleName NetworkDiagnostics Resolve-DnsName -Times 1 -Exactly -ParameterFilter { $Name -eq '_ldap._tcp.example.com' }
    }

    It 'rejects an unsupported record type' {
        { Resolve-NdtDnsName -Name example.com -RecordType ANY } | Should -Throw
    }
}

Describe 'Resolve-NdtDnsName failures' -Tag 'Unit' {
    It 'maps Win32 error <Code> to <Outcome>' -ForEach @(
        @{ Code = 9003; Outcome = 'NXDOMAIN'; Text = '*Name does not exist (NXDOMAIN)*' }
        @{ Code = 1460; Outcome = 'Timeout'; Text = '*timed out*' }
        @{ Code = 9002; Outcome = 'ServerFailure'; Text = '*SERVFAIL*' }
        @{ Code = 9005; Outcome = 'Refused'; Text = '*refused*' }
        @{ Code = 9501; Outcome = 'NoRecords'; Text = '*no records of the requested type*' }
        @{ Code = 10054; Outcome = 'ConnectionReset'; Text = '*port 53*' }
        @{ Code = 5; Outcome = 'Error'; Text = '*' }
    ) {
        Mock -ModuleName NetworkDiagnostics Resolve-DnsName { throw [System.ComponentModel.Win32Exception]::new($Code, 'test failure') }
        $r = Resolve-NdtDnsName -Name missing.example
        $r.Status | Should -Be 'FAIL'
        $r.Outcome | Should -Be $Outcome
        $r.Summary | Should -BeLike $Text
        $r.RecordCount | Should -Be 0
    }

    It 'continues with the next name after a failure' {
        Mock -ModuleName NetworkDiagnostics Resolve-DnsName { throw [System.ComponentModel.Win32Exception]::new(9003, 'missing') } -ParameterFilter { $Name -eq 'missing.example' }
        Mock -ModuleName NetworkDiagnostics Resolve-DnsName { [pscustomobject]@{ Name = 'ok.example'; Type = 'A'; Section = 'Answer'; TTL = 60; IPAddress = '192.0.2.5' } } -ParameterFilter { $Name -eq 'ok.example' }
        $results = @(Resolve-NdtDnsName -Name missing.example, ok.example)
        $results.Count | Should -Be 2
        $results[0].Status | Should -Be 'FAIL'
        $results[1].Status | Should -Be 'PASS'
    }
}
