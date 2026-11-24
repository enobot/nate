# Unit tests for Get-NdtIPConfig and Get-NdtAdapter.
# Get-NetIPConfiguration and Get-NetAdapter are mocked with objects that have the same
# property names the real CIM objects use. Addresses and MACs are documentation values
# (192.0.2.0/24, 198.51.100.0/24, 2001:db8::/32, 00-00-5E-00-53-xx).

BeforeAll {
    $modulePath = Join-Path -Path $PSScriptRoot -ChildPath '..\src\NetworkDiagnostics\NetworkDiagnostics.psd1'
    Import-Module -Name $modulePath -Force

    function New-TestIPConfig {
        param(
            [string]$Alias = 'Ethernet',
            [string[]]$IPv4 = @('192.0.2.25'),
            [int]$Prefix = 24,
            [string[]]$Gateway = @('192.0.2.1'),
            [string[]]$Dns = @('198.51.100.53'),
            [string]$Dhcp = 'Enabled',
            [string]$AdapterStatus = 'Up'
        )
        [pscustomobject]@{
            InterfaceAlias       = $Alias
            InterfaceDescription = 'Example Ethernet Controller'
            InterfaceIndex       = 7
            IPv4Address          = @($IPv4 | Where-Object { $_ } | ForEach-Object { [pscustomobject]@{ IPAddress = $_; PrefixLength = $Prefix } })
            IPv6Address          = @()
            IPv4DefaultGateway   = @($Gateway | Where-Object { $_ } | ForEach-Object { [pscustomobject]@{ NextHop = $_ } })
            IPv6DefaultGateway   = @()
            DNSServer            = @([pscustomobject]@{ AddressFamily = 2; ServerAddresses = @($Dns | Where-Object { $_ }) })
            NetIPv4Interface     = [pscustomobject]@{ Dhcp = $Dhcp }
            NetAdapter           = [pscustomobject]@{ Status = $AdapterStatus; MacAddress = '00-00-5E-00-53-25' }
        }
    }

    function New-TestAdapter {
        param(
            [string]$Name = 'Ethernet',
            [string]$Status = 'Up',
            [string]$LinkSpeed = '1 Gbps',
            [object]$Speed = 1000000000,
            [string]$Media = '802.3'
        )
        [pscustomobject]@{
            Name                 = $Name
            InterfaceDescription = 'Example Network Adapter'
            Status               = $Status
            LinkSpeed            = $LinkSpeed
            Speed                = $Speed
            MacAddress           = '00-00-5E-00-53-25'
            PhysicalMediaType    = $Media
            ifIndex              = 7
            Virtual              = $false
        }
    }
}

Describe 'Get-NdtIPConfig' -Tag 'Unit' {
    It 'is PASS for a normal DHCP configuration' {
        Mock -ModuleName NetworkDiagnostics Get-NetIPConfiguration { New-TestIPConfig }
        $r = Get-NdtIPConfig
        $r.Status | Should -Be 'PASS'
        $r.Target | Should -Be 'Ethernet'
        $r.IPv4Address | Should -Be '192.0.2.25/24'
        $r.DefaultGateway | Should -Be '192.0.2.1'
        $r.DnsServer | Should -Be '198.51.100.53'
        $r.DhcpEnabled | Should -Be 'Enabled'
        $r.MacAddress | Should -Be '00-00-5E-00-53-25'
        $r.Summary | Should -Be 'IPv4 192.0.2.25/24; gateway 192.0.2.1; DNS 198.51.100.53; DHCP Enabled'
    }

    It 'is WARN for an APIPA (169.254.x.x) address' {
        Mock -ModuleName NetworkDiagnostics Get-NetIPConfiguration { New-TestIPConfig -IPv4 '169.254.10.20' -Prefix 16 -Gateway @() }
        $r = Get-NdtIPConfig
        $r.Status | Should -Be 'WARN'
        $r.Summary | Should -BeLike 'APIPA address 169.254.10.20/16: *no DHCP server answered*'
    }

    It 'is WARN when no DNS servers are configured' {
        Mock -ModuleName NetworkDiagnostics Get-NetIPConfiguration { New-TestIPConfig -Dns @() }
        $r = Get-NdtIPConfig
        $r.Status | Should -Be 'WARN'
        $r.Summary | Should -BeLike 'No DNS servers are configured*'
    }

    It 'is WARN when no interface has a default gateway' {
        Mock -ModuleName NetworkDiagnostics Get-NetIPConfiguration { New-TestIPConfig -Gateway @() }
        $r = Get-NdtIPConfig
        $r.Status | Should -Be 'WARN'
        $r.Summary | Should -BeLike 'No default gateway on any interface*'
    }

    It 'is INFO for a gateway-less interface when another interface has a gateway' {
        Mock -ModuleName NetworkDiagnostics Get-NetIPConfiguration {
            New-TestIPConfig -Alias 'Ethernet'
            New-TestIPConfig -Alias 'vEthernet (Lab)' -IPv4 '198.51.100.9' -Gateway @()
        }
        $results = @(Get-NdtIPConfig)
        $results.Count | Should -Be 2
        $results[0].Status | Should -Be 'PASS'
        $results[1].Status | Should -Be 'INFO'
        $results[1].Summary | Should -BeLike 'No default gateway on this interface*'
    }

    It 'is INFO (not an APIPA warning) when the adapter is disconnected' {
        Mock -ModuleName NetworkDiagnostics Get-NetIPConfiguration {
            New-TestIPConfig -Alias 'Ethernet'
            New-TestIPConfig -Alias 'Wi-Fi' -IPv4 '169.254.10.20' -Prefix 16 -Gateway @() -AdapterStatus 'Disconnected'
        }
        $results = @(Get-NdtIPConfig)
        $results[1].Status | Should -Be 'INFO'
        $results[1].Summary | Should -BeLike 'Adapter is disconnected, so these settings are not in use*'
    }

    It 'still warns about APIPA on a connected adapter' {
        Mock -ModuleName NetworkDiagnostics Get-NetIPConfiguration { New-TestIPConfig -IPv4 '169.254.10.20' -Prefix 16 -Gateway @() -AdapterStatus 'Up' }
        (Get-NdtIPConfig).Status | Should -Be 'WARN'
    }

    It 'lists a DNS server once when Windows reports it twice' {
        Mock -ModuleName NetworkDiagnostics Get-NetIPConfiguration { New-TestIPConfig -Dns @('198.51.100.53', '198.51.100.53', '198.51.100.54') }
        (Get-NdtIPConfig).DnsServer | Should -Be @('198.51.100.53', '198.51.100.54')
    }

    It 'is WARN when no address is assigned' {
        Mock -ModuleName NetworkDiagnostics Get-NetIPConfiguration { New-TestIPConfig -IPv4 @() }
        (Get-NdtIPConfig).Status | Should -Be 'WARN'
    }

    It 'passes -All through' {
        Mock -ModuleName NetworkDiagnostics Get-NetIPConfiguration { New-TestIPConfig }
        $null = Get-NdtIPConfig -All
        Should -Invoke -ModuleName NetworkDiagnostics Get-NetIPConfiguration -Times 1 -Exactly -ParameterFilter { $All -and $Detailed }
    }

    It 'passes -InterfaceAlias through without -All (they are separate parameter sets)' {
        Mock -ModuleName NetworkDiagnostics Get-NetIPConfiguration { New-TestIPConfig }
        $null = Get-NdtIPConfig -InterfaceAlias 'Wi-Fi' -All
        Should -Invoke -ModuleName NetworkDiagnostics Get-NetIPConfiguration -Times 1 -Exactly -ParameterFilter { -not $All -and $Detailed -and $InterfaceAlias -contains 'Wi-Fi' }
    }

    It 'throws a clear error for an unknown interface name' {
        Mock -ModuleName NetworkDiagnostics Get-NetIPConfiguration { throw 'No MSFT_NetIPInterface objects found' }
        { Get-NdtIPConfig -InterfaceAlias 'Nope' } | Should -Throw -ExpectedMessage "No interface named 'Nope' was found*"
    }
}

Describe 'Get-NdtAdapter' -Tag 'Unit' {
    It 'maps <Status> at <LinkSpeed> to <Expected>' -ForEach @(
        @{ Status = 'Up'; LinkSpeed = '1 Gbps'; Speed = 1000000000; Media = '802.3'; Expected = 'PASS' }
        @{ Status = 'Up'; LinkSpeed = '100 Mbps'; Speed = 100000000; Media = '802.3'; Expected = 'WARN' }
        @{ Status = 'Up'; LinkSpeed = '72 Mbps'; Speed = 72000000; Media = 'Native 802.11'; Expected = 'PASS' }
        @{ Status = 'Disconnected'; LinkSpeed = '0 bps'; Speed = $null; Media = '802.3'; Expected = 'WARN' }
        @{ Status = 'Disabled'; LinkSpeed = '0 bps'; Speed = 0; Media = '802.3'; Expected = 'INFO' }
        @{ Status = 'Not Present'; LinkSpeed = '0 bps'; Speed = 0; Media = 'Native 802.11'; Expected = 'INFO' }
    ) {
        Mock -ModuleName NetworkDiagnostics Get-NetAdapter { New-TestAdapter -Status $Status -LinkSpeed $LinkSpeed -Speed $Speed -Media $Media }
        $r = Get-NdtAdapter
        $r.Status | Should -Be $Expected
        $r.AdapterStatus | Should -Be $Status
    }

    It 'includes the MAC address and link speed in the summary' {
        Mock -ModuleName NetworkDiagnostics Get-NetAdapter { New-TestAdapter }
        (Get-NdtAdapter).Summary | Should -Be 'Up at 1 Gbps, MAC 00-00-5E-00-53-25'
    }

    It 'asks for physical adapters only by default' {
        Mock -ModuleName NetworkDiagnostics Get-NetAdapter { New-TestAdapter }
        $null = Get-NdtAdapter
        Should -Invoke -ModuleName NetworkDiagnostics Get-NetAdapter -Times 1 -Exactly -ParameterFilter { $Physical }
    }

    It 'includes virtual adapters with -IncludeVirtual' {
        Mock -ModuleName NetworkDiagnostics Get-NetAdapter { New-TestAdapter }
        $null = Get-NdtAdapter -IncludeVirtual
        Should -Invoke -ModuleName NetworkDiagnostics Get-NetAdapter -Times 1 -Exactly -ParameterFilter { -not $Physical }
    }

    It 'returns adapters sorted by name' {
        Mock -ModuleName NetworkDiagnostics Get-NetAdapter { New-TestAdapter -Name 'Wi-Fi'; New-TestAdapter -Name 'Ethernet' }
        (@(Get-NdtAdapter) | ForEach-Object { $_.Target }) | Should -Be @('Ethernet', 'Wi-Fi')
    }

    It 'throws a clear error for an unknown adapter name' {
        Mock -ModuleName NetworkDiagnostics Get-NetAdapter { throw "No MSFT_NetAdapter objects found with property 'Name' equal to 'Nope'." }
        { Get-NdtAdapter -Name 'Nope' } | Should -Throw -ExpectedMessage "No adapter named 'Nope' was found*"
    }
}
