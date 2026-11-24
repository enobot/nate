#Requires -Version 5.1
<#
.SYNOPSIS
    Runs the Pester test suite for the Network Diagnostics Toolkit.

.DESCRIPTION
    Imports Pester 5.x or later (the suite is developed with Pester 6.2.0) and runs the tests
    in the tests folder. Unit tests mock the operating system calls; integration tests run
    real checks against 127.0.0.1/localhost and a TCP listener the tests open themselves.

    Note: in Windows PowerShell 5.1, "Import-Module Pester -MinimumVersion 6" fails because
    "6" is not a valid System.Version string. This script uses '5.0.0'.

.PARAMETER Tag
    Run only tests with this tag: Unit or Integration. Default: all tests.

.PARAMETER CodeCoverage
    Measure code coverage of the module source and print the percentage.

.PARAMETER CI
    Write an NUnit XML result file to TestResults\ and exit with a non-zero code on failure.

.EXAMPLE
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\Invoke-Tests.ps1

.EXAMPLE
    .\tools\Invoke-Tests.ps1 -Tag Unit -CodeCoverage
#>
[CmdletBinding()]
param(
    [ValidateSet('Unit', 'Integration')]
    [string[]]$Tag,

    [switch]$CodeCoverage,

    [switch]$CI
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Path $PSScriptRoot -Parent

$pester = Get-Module -ListAvailable -Name Pester | Where-Object { $_.Version -ge [version]'5.0.0' } | Sort-Object -Property Version -Descending | Select-Object -First 1
if (-not $pester) {
    Write-Error -Message 'Pester 5.0.0 or later is required. Install it with: Install-Module Pester -MinimumVersion 5.0.0 -Scope CurrentUser' -ErrorAction Continue
    exit 2
}
Import-Module -Name $pester.Path -Force

$config = New-PesterConfiguration
$config.Run.Path = Join-Path -Path $repoRoot -ChildPath 'tests'
$config.Run.PassThru = $true
$config.Output.Verbosity = 'Detailed'
if ($Tag) { $config.Filter.Tag = $Tag }

if ($CodeCoverage) {
    $config.CodeCoverage.Enabled = $true
    $config.CodeCoverage.Path = @(
        (Join-Path -Path $repoRoot -ChildPath 'src\NetworkDiagnostics\Public')
        (Join-Path -Path $repoRoot -ChildPath 'src\NetworkDiagnostics\Private')
    )
    $config.CodeCoverage.OutputPath = Join-Path -Path $repoRoot -ChildPath 'TestResults\coverage.xml'
}

if ($CI) {
    $resultsDir = Join-Path -Path $repoRoot -ChildPath 'TestResults'
    if (-not (Test-Path -LiteralPath $resultsDir)) { $null = New-Item -ItemType Directory -Path $resultsDir }
    $config.TestResult.Enabled = $true
    $config.TestResult.OutputFormat = 'NUnitXml'
    $config.TestResult.OutputPath = Join-Path -Path $resultsDir -ChildPath ("pester-{0}-{1}.xml" -f $PSVersionTable.PSEdition, $PSVersionTable.PSVersion.Major)
}

Write-Output ("PowerShell {0} ({1}), Pester {2}" -f $PSVersionTable.PSVersion, $PSVersionTable.PSEdition, $pester.Version)
$result = Invoke-Pester -Configuration $config

if ($CodeCoverage -and $result.CodeCoverage) {
    $percent = [math]::Round($result.CodeCoverage.CoveragePercent, 1)
    Write-Output ("Code coverage: {0}% of {1} analysed commands" -f $percent, $result.CodeCoverage.CommandsAnalyzedCount)
}

if ($CI -and $result.FailedCount -gt 0) { exit 1 }
if ($CI -and $result.Result -ne 'Passed') { exit 1 }
