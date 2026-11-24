@{
    RootModule           = 'NetworkDiagnostics.psm1'
    ModuleVersion        = '1.0.0'
    GUID                 = 'ff6b3498-13c1-4287-b79d-d39e9ff68472'
    Author               = 'Nathanael Haig, Tracy Tran'
    CompanyName          = 'Nathanael Haig and Tracy Tran'
    Copyright            = '(c) 2026 Nathanael Haig and Tracy Tran. Released under the MIT License.'
    Description          = 'Read-only network troubleshooting checks for help desk and network technicians: ping, traceroute, IP configuration, DNS lookups, adapter status, TCP port checks, CSV/text reports and ticket notes.'
    PowerShellVersion    = '5.1'
    CompatiblePSEditions = @('Desktop', 'Core')

    FunctionsToExport    = @(
        'Export-NdtReport'
        'Get-NdtAdapter'
        'Get-NdtIPConfig'
        'Invoke-NdtQuickCheck'
        'New-NdtTicketNote'
        'Resolve-NdtDnsName'
        'Show-NdtResult'
        'Start-NdtMenu'
        'Test-NdtPing'
        'Test-NdtPort'
        'Trace-NdtRoute'
    )
    CmdletsToExport      = @()
    VariablesToExport    = @()
    AliasesToExport      = @()

    PrivateData          = @{
        PSData = @{
            Tags       = @('Network', 'Diagnostics', 'Troubleshooting', 'HelpDesk', 'Ping', 'Traceroute', 'DNS', 'Windows')
            LicenseUri = 'https://github.com/enobot/nate/blob/main/apps/network-diagnostics-toolkit/LICENSE'
            ProjectUri = 'https://github.com/enobot/nate/tree/main/apps/network-diagnostics-toolkit'
        }
    }
}
