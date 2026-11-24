#Requires -Version 5.1
<#
.SYNOPSIS
    Captures real console transcripts of the toolkit into docs\examples, with local
    identifiers replaced by documentation values.

.DESCRIPTION
    Runs the toolkit for real against this computer only (127.0.0.1, localhost and a TCP
    listener this script opens on a random loopback port), in a separate PowerShell process
    with typed answers piped to the menu. Three transcripts are written:

      docs\examples\menu-session.txt      a full menu session, ending with a saved report
      docs\examples\input-validation.txt  rejected input (ranges, CIDR, limits, bad values)
      docs\examples\cmdlet-usage.txt      using the module commands directly

    Before saving, the output is scrubbed: this computer's name, user name, folder paths,
    IP addresses, default gateways, DNS servers, MAC addresses and adapter descriptions are
    replaced with documentation values (192.0.2.0/24 from RFC 5737, 2001:db8::/32 from
    RFC 3849, 00-00-5E-00-53-xx from RFC 7042). The script then checks that none of the
    original values remain and stops with an error if any do.

    Loopback (127.0.0.1, ::1) is not replaced because it is the same on every computer.

.EXAMPLE
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\New-ExampleTranscript.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$examplesDir = Join-Path -Path $repoRoot -ChildPath 'docs\examples'
$entryScript = Join-Path -Path $repoRoot -ChildPath 'Start-NetworkToolkit.ps1'
$hostExe = (Get-Process -Id $PID).Path

$workDir = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath ('ndt-transcript-' + [guid]::NewGuid().ToString('N'))
$reportDir = Join-Path -Path $workDir -ChildPath 'reports'
$null = New-Item -ItemType Directory -Path $reportDir -Force

function Invoke-ChildPowerShell {
    param(
        [Parameter(Mandatory)][string]$Arguments,
        [string[]]$InputLine = @()
    )

    # Input comes from an ASCII file. Process.StandardInput is not used because on
    # Windows PowerShell 5.1 it writes a UTF-8 byte-order mark when the process
    # starts if the console's input encoding is UTF-8, which corrupts the first line.
    $id = [guid]::NewGuid().ToString('N')
    $inputFile = Join-Path -Path $workDir -ChildPath "stdin-$id.txt"
    $stdoutFile = Join-Path -Path $workDir -ChildPath "stdout-$id.txt"
    $stderrFile = Join-Path -Path $workDir -ChildPath "stderr-$id.txt"
    Set-Content -LiteralPath $inputFile -Value $InputLine -Encoding Ascii

    $process = Start-Process -FilePath $hostExe -ArgumentList $Arguments -WorkingDirectory $repoRoot `
        -NoNewWindow -PassThru -RedirectStandardInput $inputFile `
        -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
    $null = $process.Handle   # keeps the handle open so ExitCode is available after exit

    if (-not $process.WaitForExit(180000)) {
        $process.Kill()
        throw 'The child PowerShell process did not exit within 3 minutes.'
    }
    $stderrText = Get-Content -LiteralPath $stderrFile -Raw
    if ($stderrText) { throw "The child PowerShell process wrote errors: $stderrText" }
    return (Get-Content -LiteralPath $stdoutFile -Raw)
}

# ---------------------------------------------------------------- identifiers to scrub
$replacements = New-Object 'System.Collections.Generic.List[object]'
function Add-Replacement {
    param([string]$Real, [string]$Fake, [ValidateSet('Text', 'IPv4', 'IPv6')][string]$Kind = 'Text')
    if ([string]::IsNullOrWhiteSpace($Real)) { return }
    foreach ($existing in $replacements) { if ($existing.Real -eq $Real) { return } }
    $replacements.Add([pscustomobject]@{ Real = $Real; Fake = $Fake; Kind = $Kind })
}

$ipv4 = New-Object 'System.Collections.Generic.List[string]'
$ipv6 = New-Object 'System.Collections.Generic.List[string]'
function Add-Address {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return }
    $clean = ($Value -split '%')[0]
    $parsed = $null
    if (-not [System.Net.IPAddress]::TryParse($clean, [ref]$parsed)) { return }
    if ([System.Net.IPAddress]::IsLoopback($parsed) -or $parsed.Equals([System.Net.IPAddress]::Any) -or $parsed.Equals([System.Net.IPAddress]::IPv6Any)) { return }
    # Keep both the normalised form and the form Windows printed, in case they differ.
    foreach ($text in @($parsed.ToString(), $clean.ToLowerInvariant()) | Select-Object -Unique) {
        if ($parsed.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork) {
            if (-not $ipv4.Contains($text)) { $ipv4.Add($text) }
        }
        elseif (-not $ipv6.Contains($text)) { $ipv6.Add($text) }
    }
}

Get-NetIPAddress -ErrorAction SilentlyContinue | ForEach-Object { Add-Address -Value $_.IPAddress }
Get-NetRoute -ErrorAction SilentlyContinue | Where-Object { $_.DestinationPrefix -in '0.0.0.0/0', '::/0' } | ForEach-Object { Add-Address -Value $_.NextHop }
Get-DnsClientServerAddress -ErrorAction SilentlyContinue | ForEach-Object { foreach ($s in @($_.ServerAddresses)) { Add-Address -Value $s } }

$n = 100
foreach ($a in $ipv4) { Add-Replacement -Real $a -Fake "192.0.2.$n" -Kind IPv4; $n++ }
$n = 100
foreach ($a in $ipv6) { Add-Replacement -Real $a -Fake ('2001:db8::{0:x}' -f $n) -Kind IPv6; $n++ }

$n = 16
$descriptionIndex = 1
foreach ($adapter in @(Get-NetAdapter -IncludeHidden -ErrorAction SilentlyContinue)) {
    if ($adapter.MacAddress) {
        Add-Replacement -Real ([string]$adapter.MacAddress) -Fake ('00-00-5E-00-53-{0:X2}' -f $n)
        $n++
    }
    if ($adapter.InterfaceDescription) {
        Add-Replacement -Real ([string]$adapter.InterfaceDescription) -Fake "Example Network Adapter $descriptionIndex"
        $descriptionIndex++
    }
}

Add-Replacement -Real $reportDir -Fake 'C:\Tools\network-diagnostics-toolkit\reports'
Add-Replacement -Real $workDir -Fake 'C:\Tools\network-diagnostics-toolkit\work'
Add-Replacement -Real $repoRoot -Fake 'C:\Tools\network-diagnostics-toolkit'
Add-Replacement -Real ([System.IO.Path]::GetTempPath().TrimEnd('\')) -Fake 'C:\Temp'
Add-Replacement -Real $env:USERPROFILE -Fake 'C:\Users\technician'
Add-Replacement -Real ([System.Environment]::MachineName) -Fake 'HELPDESK-PC01'
Add-Replacement -Real $env:COMPUTERNAME -Fake 'HELPDESK-PC01'
Add-Replacement -Real $env:USERNAME -Fake 'technician'

function Protect-Transcript {
    param([string]$Text)
    $output = $Text
    foreach ($r in ($replacements | Sort-Object -Property { $_.Real.Length } -Descending)) {
        $escaped = [regex]::Escape($r.Real)
        switch ($r.Kind) {
            'IPv4' { $pattern = '(?<![0-9.])' + $escaped + '(?![0-9])' }
            'IPv6' { $pattern = '(?i)(?<![0-9a-f:])' + $escaped + '(?![0-9a-f:])' }
            default { $pattern = '(?i)' + $escaped }
        }
        $output = [regex]::Replace($output, $pattern, $r.Fake.Replace('$', '$$'))
    }
    return $output
}

function Test-TranscriptClean {
    param([string]$Text)
    foreach ($r in $replacements) {
        $escaped = [regex]::Escape($r.Real)
        switch ($r.Kind) {
            'IPv4' { $pattern = '(?<![0-9.])' + $escaped + '(?![0-9])' }
            'IPv6' { $pattern = '(?i)(?<![0-9a-f:])' + $escaped + '(?![0-9a-f:])' }
            default { $pattern = '(?i)' + $escaped }
        }
        if ([regex]::IsMatch($Text, $pattern)) { return $false }
    }
    return $true
}

function Save-Transcript {
    param(
        [string]$FileName,
        [string]$Description,
        [string]$Body,
        [string]$Note = '# The menu ran with answers piped in, so PowerShell echoes each typed answer after its prompt.'
    )
    $header = @(
        "# $Description"
        "# Real console output captured with tools\New-ExampleTranscript.ps1 on $((Get-Date).ToString('yyyy-MM-dd')),"
        "# PowerShell $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition)); output was redirected to a file, so there is no colour."
        '# Targets: 127.0.0.1, localhost and a TCP listener opened by the script on a random loopback port.'
        '# Scrubbed: computer name, user name, folder paths, IP addresses, gateways, DNS servers, MAC'
        '# addresses and adapter descriptions were replaced with documentation values'
        '# (192.0.2.0/24, 2001:db8::/32, 00-00-5E-00-53-xx, HELPDESK-PC01).'
        $Note
        ''
    ) -join "`r`n"
    $clean = Protect-Transcript -Text $Body
    $clean = ($clean -replace "`r?`n", "`r`n").TrimEnd() + "`r`n"
    if (-not (Test-TranscriptClean -Text $clean)) {
        throw "A local identifier was still present in $FileName after scrubbing. Nothing was saved for this file."
    }
    $path = Join-Path -Path $examplesDir -ChildPath $FileName
    [System.IO.File]::WriteAllText($path, $header + "`r`n" + $clean, (New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false))
    "Wrote $path"
}

# ---------------------------------------------------------------- listeners on loopback
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$openPort = $listener.LocalEndpoint.Port
$probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$probe.Start()
$closedPort = $probe.LocalEndpoint.Port
$probe.Stop()

try {
    $menuArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$entryScript`" -NoColor -ReportDirectory `"$reportDir`""

    # 1. Full menu session
    $session = @(
        '3', 'n'                                   # IP configuration (connected interfaces)
        '5', 'n'                                   # physical adapters
        '1', '127.0.0.1, localhost', '2', ''       # ping
        '2', '127.0.0.1', '3', '500'               # traceroute
        '4', 'localhost', '', ''                   # DNS A record, default server
        '6', '127.0.0.1', "$openPort, $closedPort", ''  # TCP: one open, one closed port
        '7', 'localhost', "$openPort"              # quick check
        '8', 'n'                                   # ticket notes, no clipboard
        '9'                                        # save CSV + text
        'q'
    )
    $output = Invoke-ChildPowerShell -Arguments $menuArgs -InputLine $session
    $intro = "PS C:\Tools\network-diagnostics-toolkit> .\Start-NetworkToolkit.ps1 -NoColor`r`n(listener for this run: port $openPort open, port $closedPort closed)`r`n"
    Save-Transcript -FileName 'menu-session.txt' -Description 'Interactive menu session: every check, ticket notes and a saved report' -Body ($intro + $output)

    # 2. Rejected input: nothing is sent for any of these
    $elevenTargets = (1..11 | ForEach-Object { "192.0.2.$_" }) -join ','
    $validation = @(
        '1', '192.0.2.0/24'                        # CIDR range
        '1', '198.51.100.1-50'                     # address range
        '1', '*.example'                           # wildcard
        '1', $elevenTargets                        # more than 10 targets
        '1', '010.1.1.1'                           # leading zero (TryParse would read 8.1.1.1)
        '1', '192.168.1'                           # three octets (TryParse would read 192.168.0.1)
        '1', '224.0.0.1'                           # multicast
        '1', '127.0.0.1', '50'                     # count out of range
        '6', '127.0.0.1', '1-1024'                 # port range
        '6', '192.0.2.1 192.0.2.2 192.0.2.3', '1,2,3,4,5,6,7'  # 21 TCP checks
        '2', '127.0.0.1 192.0.2.1'                 # traceroute takes one target
        '4', 'example.com', 'ANY'                  # unsupported record type
        'x'                                        # unknown menu option
        'q'
    )
    $output = Invoke-ChildPowerShell -Arguments $menuArgs -InputLine $validation
    Save-Transcript -FileName 'input-validation.txt' -Description 'Input validation: rejected targets, ports and values (no network traffic is sent for these)' -Body ("PS C:\Tools\network-diagnostics-toolkit> .\Start-NetworkToolkit.ps1 -NoColor`r`n" + $output)

    # 3. Direct use of the module commands
    $usageScript = Join-Path -Path $workDir -ChildPath 'usage.ps1'
    $usage = @'
param([int]$openPort, [int]$closedPort)
$ErrorActionPreference = 'Stop'
$steps = @(
    { Import-Module .\src\NetworkDiagnostics\NetworkDiagnostics.psd1 }
    { Get-Command -Module NetworkDiagnostics | Select-Object -ExpandProperty Name }
    { Test-NdtPing -Target 127.0.0.1 -Count 2 | Show-NdtResult }
    { Test-NdtPing -Target 127.0.0.1, localhost -Count 1 | Format-Table -AutoSize }
    { Test-NdtPort -Target 127.0.0.1 -Port $openPort, $closedPort | Format-Table Status, Target, Port, State, ElapsedMs -AutoSize }
    { Trace-NdtRoute -Target 127.0.0.1 -MaxHops 3 -TimeoutMs 500 | Show-NdtResult }
    { (Trace-NdtRoute -Target 127.0.0.1 -MaxHops 3 -TimeoutMs 500).Hops | Format-Table -AutoSize }
    { Resolve-NdtDnsName -Name localhost | Show-NdtResult }
    { Get-NdtAdapter | Show-NdtResult -NoDetails }
    { Invoke-NdtQuickCheck -Target localhost -Port $openPort -Count 1 | New-NdtTicketNote -Title 'INC0000000 example' }
    { try { Test-NdtPing -Target 192.0.2.0/24 } catch { "Error: $($_.Exception.Message)" } }
    { try { Test-NdtPort -Target 127.0.0.1 -Port (1..21) } catch { "Error: $($_.Exception.Message)" } }
)
"(listener for this run: port $openPort open, port $closedPort closed)"
foreach ($step in $steps) {
    Write-Host ''
    Write-Host ('PS C:\Tools\network-diagnostics-toolkit> ' + $step.ToString().Trim())
    & $step | Out-Host
}
'@
    [System.IO.File]::WriteAllText($usageScript, $usage, (New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false))
    $output = Invoke-ChildPowerShell -Arguments "-NoProfile -ExecutionPolicy Bypass -File `"$usageScript`" -openPort $openPort -closedPort $closedPort"
    Save-Transcript -FileName 'cmdlet-usage.txt' -Description 'Using the module commands directly from a PowerShell prompt' -Body $output -Note '# Each "PS ...>" line is the command that ran; the lines after it are its output.'
}
finally {
    $listener.Stop()
    if (Test-Path -LiteralPath $workDir) { Remove-Item -LiteralPath $workDir -Recurse -Force }
}
