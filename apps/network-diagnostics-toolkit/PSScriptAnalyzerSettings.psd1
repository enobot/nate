@{
    # CI fails on any Error or Warning from the default rule set.
    Severity = @('Error', 'Warning')

    Rules    = @{
        # Flag syntax that would not parse on Windows PowerShell 5.1 or PowerShell 7.
        PSUseCompatibleSyntax = @{
            Enable         = $true
            TargetVersions = @('5.1', '7.0')
        }
    }
}
