# Module-level checks: manifest, exports, comment-based help, source file hygiene and a
# static read-only guarantee (no commands that change network or system settings).

BeforeDiscovery {
    $discoveryModulePath = Join-Path -Path $PSScriptRoot -ChildPath '..\src\NetworkDiagnostics\NetworkDiagnostics.psd1'
    Import-Module -Name $discoveryModulePath -Force
    $exportedFunctions = @(Get-Command -Module NetworkDiagnostics -CommandType Function | ForEach-Object { @{ Name = $_.Name } })
}

BeforeAll {
    $repoRoot = (Resolve-Path -Path (Join-Path -Path $PSScriptRoot -ChildPath '..')).Path
    $moduleRoot = Join-Path -Path $repoRoot -ChildPath 'src\NetworkDiagnostics'
    $manifestPath = Join-Path -Path $moduleRoot -ChildPath 'NetworkDiagnostics.psd1'
    Import-Module -Name $manifestPath -Force
}

Describe 'Module manifest' -Tag 'Unit' {
    It 'is a valid manifest' {
        { Test-ModuleManifest -Path $manifestPath -ErrorAction Stop } | Should -Not -Throw
    }

    It 'targets Windows PowerShell 5.1 and PowerShell 7 (Desktop and Core)' {
        $manifest = Import-PowerShellDataFile -Path $manifestPath
        $manifest.PowerShellVersion | Should -Be '5.1'
        $manifest.CompatiblePSEditions | Should -Be @('Desktop', 'Core')
    }

    It 'credits both authors' {
        $manifest = Import-PowerShellDataFile -Path $manifestPath
        $manifest.Author | Should -BeLike '*Nathanael Haig*'
        $manifest.Author | Should -BeLike '*Tracy Tran*'
        $manifest.Copyright | Should -BeLike '*Nathanael Haig and Tracy Tran*'
    }

    It 'exports exactly the functions in the Public folder' {
        $publicNames = @(Get-ChildItem -Path (Join-Path $moduleRoot 'Public') -Filter '*.ps1' | ForEach-Object { $_.BaseName } | Sort-Object)
        $manifest = Import-PowerShellDataFile -Path $manifestPath
        @($manifest.FunctionsToExport | Sort-Object) | Should -Be $publicNames
        @(Get-Command -Module NetworkDiagnostics -CommandType Function | ForEach-Object { $_.Name } | Sort-Object) | Should -Be $publicNames
    }

    It 'does not export private helpers' {
        Get-Command -Name 'Invoke-NdtPing' -Module NetworkDiagnostics -ErrorAction SilentlyContinue | Should -BeNullOrEmpty
        Get-Command -Name 'Get-NdtValidatedTarget' -Module NetworkDiagnostics -ErrorAction SilentlyContinue | Should -BeNullOrEmpty
    }

    It 'reports the manifest version at runtime' {
        InModuleScope NetworkDiagnostics { $script:NdtModuleVersion | Should -Be '1.0.0' }
    }
}

Describe 'Comment-based help for <Name>' -Tag 'Unit' -ForEach $exportedFunctions {
    BeforeAll {
        $help = Get-Help -Name $Name -Full
        $command = Get-Command -Name $Name
        $common = [System.Management.Automation.PSCmdlet]::CommonParameters + [System.Management.Automation.PSCmdlet]::OptionalCommonParameters
        $parameterNames = @($command.Parameters.Keys | Where-Object { $common -notcontains $_ })
    }

    It 'has a synopsis' {
        $help.Synopsis | Should -Not -BeNullOrEmpty
        $help.Synopsis.Trim() | Should -Not -BeLike "$Name *"
    }

    It 'has a description' {
        ($help.Description | ForEach-Object { $_.Text }) -join '' | Should -Not -BeNullOrEmpty
    }

    It 'has at least one example' {
        @($help.Examples.Example).Count | Should -BeGreaterThan 0
    }

    It 'describes every parameter' {
        foreach ($parameter in $parameterNames) {
            $entry = @($help.Parameters.Parameter | Where-Object { $_.Name -eq $parameter })
            $entry.Count | Should -Be 1 -Because "parameter $parameter should be documented"
            (($entry[0].Description | ForEach-Object { $_.Text }) -join '') | Should -Not -BeNullOrEmpty -Because "parameter $parameter needs a description"
        }
    }
}

Describe 'Source files' -Tag 'Unit' {
    BeforeAll {
        $sourceFiles = @(
            Get-ChildItem -Path (Join-Path $repoRoot 'src') -Recurse -Include '*.ps1', '*.psm1', '*.psd1' -File
            Get-ChildItem -Path (Join-Path $repoRoot 'tests') -Recurse -Include '*.ps1' -File
            Get-ChildItem -Path (Join-Path $repoRoot 'tools') -Recurse -Include '*.ps1' -File
            Get-Item -Path (Join-Path $repoRoot 'Start-NetworkToolkit.ps1')
        )
        $moduleCodeFiles = @(Get-ChildItem -Path (Join-Path $repoRoot 'src') -Recurse -Include '*.ps1', '*.psm1' -File)
    }

    It 'are plain ASCII (Windows PowerShell 5.1 reads files without a BOM as the ANSI code page)' {
        foreach ($file in $sourceFiles) {
            $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
            $nonAscii = @($bytes | Where-Object { $_ -gt 127 }).Count
            $nonAscii | Should -Be 0 -Because "$($file.Name) should contain only ASCII characters"
        }
    }

    It 'parse without syntax errors' {
        foreach ($file in $sourceFiles) {
            $tokens = $null
            $parseErrors = $null
            $null = [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$parseErrors)
            @($parseErrors).Count | Should -Be 0 -Because "$($file.Name) should parse cleanly"
        }
    }

    It 'call Write-Host only from the output helper' {
        foreach ($file in $moduleCodeFiles) {
            if ($file.Name -eq 'Output.ps1') { continue }
            $ast = [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$null, [ref]$null)
            $calls = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] -and $node.GetCommandName() -eq 'Write-Host' }, $true))
            $calls.Count | Should -Be 0 -Because "$($file.Name) should use Write-NdtHostLine"
        }
    }

    It 'never call commands that change network or system settings' {
        $forbidden = @(
            'Set-NetIPAddress', 'New-NetIPAddress', 'Remove-NetIPAddress', 'Set-NetIPInterface',
            'Set-DnsClientServerAddress', 'Set-DnsClient', 'Set-DnsClientGlobalSetting', 'Clear-DnsClientCache',
            'Enable-NetAdapter', 'Disable-NetAdapter', 'Restart-NetAdapter', 'Rename-NetAdapter', 'Set-NetAdapter',
            'Set-NetAdapterAdvancedProperty', 'New-NetRoute', 'Set-NetRoute', 'Remove-NetRoute',
            'New-NetFirewallRule', 'Set-NetFirewallRule', 'Remove-NetFirewallRule', 'Set-NetFirewallProfile',
            'Set-NetConnectionProfile', 'Invoke-Expression', 'Start-Process', 'Set-ItemProperty', 'New-ItemProperty',
            'Remove-Item', 'Restart-Computer', 'Stop-Computer', 'netsh', 'netsh.exe', 'route', 'route.exe', 'ipconfig', 'ipconfig.exe', 'arp', 'arp.exe'
        )
        foreach ($file in $moduleCodeFiles) {
            $ast = [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$null, [ref]$null)
            $names = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] }, $true) | ForEach-Object { $_.GetCommandName() } | Where-Object { $_ })
            foreach ($name in $names) {
                $forbidden | Should -Not -Contain $name -Because "$($file.Name) must stay read-only"
            }
        }
    }
}
