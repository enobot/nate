<#
    Prompts and handlers for the interactive menu (Start-NdtMenu).

    All keyboard input goes through Read-NdtInput so that:
      - tests can replace it with a mock that returns scripted answers, and
      - end-of-input (for example when answers are piped in) is detected and the menu exits
        instead of looping forever.

    Handlers validate input before any network traffic is sent and throw ArgumentException
    with a plain-language message on bad input; Start-NdtMenu prints that as [ERROR].
#>

function Read-NdtInput {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$Prompt
    )

    Write-NdtHostLine -Text "$Prompt`: " -NoNewline
    $value = Read-Host
    if ($null -eq $value) {
        $script:NdtInputClosed = $true
        return $null
    }
    return [string]$value
}

function Read-NdtNumber {
    [CmdletBinding()]
    [OutputType([int])]
    param(
        [Parameter(Mandatory)][string]$Prompt,
        [Parameter(Mandatory)][int]$Default,
        [Parameter(Mandatory)][int]$Minimum,
        [Parameter(Mandatory)][int]$Maximum
    )

    $text = Read-NdtInput -Prompt "$Prompt [$Default]"
    if ($null -eq $text) { return $null }
    $text = $text.Trim()
    if ($text.Length -eq 0) { return $Default }

    $number = 0
    $parsed = [int]::TryParse($text, [System.Globalization.NumberStyles]::None, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$number)
    $shown = ConvertTo-NdtSafeText -Text $text -MaxLength 20
    if (-not $parsed) {
        throw [System.ArgumentException]::new("'$shown' is not a whole number. Enter a number from $Minimum to $Maximum.")
    }
    if ($number -lt $Minimum -or $number -gt $Maximum) {
        throw [System.ArgumentException]::new("$number is out of range. Enter a number from $Minimum to $Maximum.")
    }
    return $number
}

function Read-NdtYesNo {
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)][string]$Prompt,
        [bool]$Default = $false
    )

    $hint = '[y/N]'
    if ($Default) { $hint = '[Y/n]' }
    $text = Read-NdtInput -Prompt "$Prompt $hint"
    if ($null -eq $text) { return $null }

    $answer = $text.Trim().ToLowerInvariant()
    if ($answer -eq 'y' -or $answer -eq 'yes') { return $true }
    if ($answer -eq 'n' -or $answer -eq 'no') { return $false }
    return $Default
}

function Read-NdtTargetList {
    [CmdletBinding()]
    [OutputType([string[]])]
    param(
        [Parameter(Mandatory)][string]$Prompt,
        [ValidateSet('Host', 'DnsName')][string]$Kind = 'Host'
    )

    $text = Read-NdtInput -Prompt $Prompt
    if ($null -eq $text) { return $null }
    $list = [string[]]@(Get-NdtValidatedTargetList -Target (ConvertFrom-NdtListInput -Text $text) -Kind $Kind)
    # The leading comma returns the array as one object, so a single target is not unrolled
    # into a plain string (where $targets[0] would be its first character).
    return , $list
}

function Show-NdtMenuScreen {
    [CmdletBinding()]
    param(
        [int]$ResultCount,
        [int]$UnsavedCount,
        [string]$ReportDirectory
    )

    $rule = ' ' + ('-' * 62)
    Write-NdtHostLine -Text ''
    Write-NdtHostLine -Text " Network Diagnostics Toolkit $script:NdtModuleVersion"
    Write-NdtHostLine -Text ' Read-only checks. Only the targets you type are contacted.'
    Write-NdtHostLine -Text $rule
    Write-NdtHostLine -Text '  1  Ping (ICMP echo) test'
    Write-NdtHostLine -Text '  2  Traceroute'
    Write-NdtHostLine -Text '  3  IP configuration'
    Write-NdtHostLine -Text '  4  DNS lookup'
    Write-NdtHostLine -Text '  5  Network adapters'
    Write-NdtHostLine -Text '  6  TCP port check'
    Write-NdtHostLine -Text '  7  Quick check (DNS + ping + TCP ports)'
    Write-NdtHostLine -Text '  8  Show ticket notes for this session'
    Write-NdtHostLine -Text '  9  Save report (CSV + text)'
    Write-NdtHostLine -Text '  C  Clear session results'
    Write-NdtHostLine -Text '  H  Help and safety limits'
    Write-NdtHostLine -Text '  Q  Quit'
    Write-NdtHostLine -Text $rule
    Write-NdtHostLine -Text " Session: $ResultCount result(s), $UnsavedCount not saved. Reports folder: $ReportDirectory"
}

function Show-NdtMenuHelp {
    [CmdletBinding()]
    param()

    $limits = $script:NdtLimits
    $text = @(
        ''
        ' HOW TO USE'
        '  - Type a menu number and press Enter. Press Enter at a prompt to accept the [default].'
        '  - Separate several targets or ports with commas or spaces: 192.0.2.10, printer01.example'
        '  - Results from each check are kept for this session. Use 8 for ticket notes and 9 to save'
        '    a CSV file and a text report.'
        ''
        ' WHAT EACH CHECK TELLS YOU'
        '  1 Ping        Does the device answer ICMP echo? (Firewalls often block ping.)'
        '  2 Traceroute  Which routers the traffic passes through and where it stops.'
        '  3 IP config   This PC''s address, gateway, DNS servers and DHCP state (like ipconfig /all).'
        '  4 DNS lookup  Does a name resolve, and to what? Separates NXDOMAIN, no records and timeouts.'
        '  5 Adapters    Link up/down, speed and MAC address of each network adapter.'
        '  6 TCP port    Is a service listening (open), refusing, or silently blocked (timed out)?'
        '  7 Quick check DNS + ping + optional TCP ports for each target, in one step.'
        ''
        ' SAFETY LIMITS'
        "  - At most $($limits.MaxTargets) targets per run, $($limits.MaxPorts) ports per run, $($limits.MaxTcpChecksPerRun) TCP checks per run."
        '  - No subnet (CIDR) ranges, address ranges, port ranges, wildcards, broadcast or multicast.'
        '  - Read-only: nothing on this computer or the network is changed.'
        '  - Only test devices you are responsible for or have permission to test.'
    )
    foreach ($line in $text) { Write-NdtHostLine -Text $line }
}

function Invoke-NdtMenuPing {
    [CmdletBinding()]
    param()

    $targets = Read-NdtTargetList -Prompt "Targets to ping (IP addresses or host names, max $($script:NdtLimits.MaxTargets))"
    if ($null -eq $targets) { return }
    $count = Read-NdtNumber -Prompt 'Echo requests per target (1-10)' -Default 4 -Minimum 1 -Maximum 10
    if ($null -eq $count) { return }
    $timeout = Read-NdtNumber -Prompt 'Timeout per reply in ms (100-5000)' -Default 1000 -Minimum 100 -Maximum 5000
    if ($null -eq $timeout) { return }

    Write-NdtHostLine -Text "Pinging $($targets.Count) target(s)..."
    Test-NdtPing -Target $targets -Count $count -TimeoutMs $timeout
}

function Invoke-NdtMenuTraceroute {
    [CmdletBinding()]
    param()

    $targets = Read-NdtTargetList -Prompt 'Target to trace (one IP address or host name)'
    if ($null -eq $targets) { return }
    if ($targets.Count -ne 1) {
        throw [System.ArgumentException]::new('Traceroute runs against one target at a time. Enter a single IP address or host name.')
    }
    $maxHops = Read-NdtNumber -Prompt 'Maximum hops (1-30)' -Default 20 -Minimum 1 -Maximum 30
    if ($null -eq $maxHops) { return }
    $timeout = Read-NdtNumber -Prompt 'Timeout per probe in ms (100-5000)' -Default 1000 -Minimum 100 -Maximum 5000
    if ($null -eq $timeout) { return }

    $worstCase = [math]::Ceiling(($maxHops * 3 * $timeout) / 1000)
    Write-NdtHostLine -Text "Tracing route to $($targets[0]). This stops when the target answers; worst case about $worstCase seconds..."
    Trace-NdtRoute -Target $targets[0] -MaxHops $maxHops -TimeoutMs $timeout
}

function Invoke-NdtMenuIPConfig {
    [CmdletBinding()]
    param()

    $all = Read-NdtYesNo -Prompt 'Also list interfaces whose adapter is not present (removed USB, old Wi-Fi)?' -Default $false
    if ($null -eq $all) { return }
    Get-NdtIPConfig -All:$all
}

function Invoke-NdtMenuDnsLookup {
    [CmdletBinding()]
    param()

    $names = Read-NdtTargetList -Prompt "Names to look up (or IP addresses for reverse lookup, max $($script:NdtLimits.MaxTargets))" -Kind 'DnsName'
    if ($null -eq $names) { return }

    $typeText = Read-NdtInput -Prompt 'Record type A, AAAA, CNAME, MX, NS, PTR, SOA, SRV or TXT [A]'
    if ($null -eq $typeText) { return }
    $type = $typeText.Trim().ToUpperInvariant()
    if ($type.Length -eq 0) { $type = 'A' }
    $allowed = @('A', 'AAAA', 'CNAME', 'MX', 'NS', 'PTR', 'SOA', 'SRV', 'TXT')
    if ($allowed -notcontains $type) {
        $shown = ConvertTo-NdtSafeText -Text $type -MaxLength 20
        throw [System.ArgumentException]::new("'$shown' is not a supported record type. Use one of: $($allowed -join ', ').")
    }

    $serverText = Read-NdtInput -Prompt 'DNS server to ask (IP or name; press Enter for this PC''s DNS servers)'
    if ($null -eq $serverText) { return }

    $query = @{ Name = $names; RecordType = $type }
    if ($serverText.Trim().Length -gt 0) { $query.Server = $serverText.Trim() }
    Resolve-NdtDnsName @query
}

function Invoke-NdtMenuAdapter {
    [CmdletBinding()]
    param()

    $virtual = Read-NdtYesNo -Prompt 'Include virtual adapters (VPN, Hyper-V, Bluetooth)?' -Default $false
    if ($null -eq $virtual) { return }
    Get-NdtAdapter -IncludeVirtual:$virtual
}

function Invoke-NdtMenuPort {
    [CmdletBinding()]
    param()

    $targets = Read-NdtTargetList -Prompt "Hosts to check (max $($script:NdtLimits.MaxTargets))"
    if ($null -eq $targets) { return }
    $portText = Read-NdtInput -Prompt "TCP ports (for example 443 or 80,443; max $($script:NdtLimits.MaxPorts), no ranges)"
    if ($null -eq $portText) { return }
    $ports = @(ConvertFrom-NdtPortInput -Text $portText)
    $null = Get-NdtValidatedTcpCheckCount -TargetCount $targets.Count -PortCount $ports.Count
    $timeout = Read-NdtNumber -Prompt 'Timeout per connection in ms (500-10000)' -Default 3000 -Minimum 500 -Maximum 10000
    if ($null -eq $timeout) { return }

    Write-NdtHostLine -Text "Checking $($targets.Count * $ports.Count) host/port combination(s)..."
    Test-NdtPort -Target $targets -Port $ports -TimeoutMs $timeout
}

function Invoke-NdtMenuQuickCheck {
    [CmdletBinding()]
    param()

    $targets = Read-NdtTargetList -Prompt "Targets for the quick check (max $($script:NdtLimits.MaxTargets))"
    if ($null -eq $targets) { return }
    $portText = Read-NdtInput -Prompt 'TCP ports to check on each target (press Enter to skip)'
    if ($null -eq $portText) { return }

    Write-NdtHostLine -Text "Running quick check for $($targets.Count) target(s)..."
    if ($portText.Trim().Length -gt 0) {
        $ports = @(ConvertFrom-NdtPortInput -Text $portText)
        Invoke-NdtQuickCheck -Target $targets -Port $ports
    }
    else {
        Invoke-NdtQuickCheck -Target $targets
    }
}
