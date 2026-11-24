<#
    Input validation for every target, port and list the toolkit accepts.

    Why so strict?
      [System.Net.IPAddress]::TryParse accepts several forms a technician would never mean:
        '1'          -> 0.0.0.1
        '192.168.1'  -> 192.168.0.1
        '010.1.1.1'  -> 8.1.1.1   (leading zero is read as octal)
        '0x7f.0.0.1' -> 127.0.0.1 (hex)
      So IPv4 input must be four decimal octets (0-255, no leading zeros) before TryParse is used.

    Safety rules enforced here:
      - Only individual, explicitly typed targets. No CIDR ranges, dash ranges or wildcards.
      - No broadcast, multicast or unspecified addresses (they can make many hosts answer).
      - Small list sizes (see $script:NdtLimits in the root module).
#>

$script:NdtIPv4Pattern = '\A(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}\z'

function Test-NdtIPv4Address {
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [AllowNull()][AllowEmptyString()][string]$Value
    )

    if ([string]::IsNullOrEmpty($Value)) { return $false }
    if ($Value -notmatch $script:NdtIPv4Pattern) { return $false }

    $parsed = $null
    return [System.Net.IPAddress]::TryParse($Value, [ref]$parsed)
}

function Test-NdtIPv6Address {
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [AllowNull()][AllowEmptyString()][string]$Value
    )

    if ([string]::IsNullOrEmpty($Value)) { return $false }
    if ($Value.Length -gt 50) { return $false }
    if (-not $Value.Contains(':')) { return $false }

    # Only hex digits, colons, dots (embedded IPv4) and an optional numeric zone index (fe80::1%12).
    if ($Value -notmatch '\A[0-9A-Fa-f:.]+(%[0-9]{1,5})?\z') { return $false }

    $parsed = $null
    if (-not [System.Net.IPAddress]::TryParse($Value, [ref]$parsed)) { return $false }
    return ($parsed.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetworkV6)
}

function Test-NdtHostname {
    <#
        RFC 1123 host name check:
          - total length 1-253 characters (a single trailing dot is allowed and ignored)
          - labels 1-63 characters of letters, digits and hyphens
          - labels cannot start or end with a hyphen
          - the last label cannot be all digits (so '192.0.2.300' is never treated as a name)
        -AllowUnderscore is used for DNS lookups, where service names such as
        _ldap._tcp.example.com and _dmarc.example.com are valid query names.
    #>
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [AllowNull()][AllowEmptyString()][string]$Value,
        [switch]$AllowUnderscore
    )

    if ([string]::IsNullOrWhiteSpace($Value)) { return $false }

    $name = $Value
    if ($name.EndsWith('.')) { $name = $name.Substring(0, $name.Length - 1) }
    if ($name.Length -lt 1 -or $name.Length -gt 253) { return $false }

    if ($AllowUnderscore) {
        $labelPattern = '\A[A-Za-z0-9_]([A-Za-z0-9_-]{0,61}[A-Za-z0-9])?\z'
    }
    else {
        $labelPattern = '\A[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\z'
    }

    $labels = $name.Split('.')
    foreach ($label in $labels) {
        if ($label -cnotmatch $labelPattern) { return $false }
    }

    if ($labels[$labels.Count - 1] -match '\A[0-9]+\z') { return $false }
    return $true
}

function Get-NdtValidatedTarget {
    <#
        Returns the trimmed target if it is a single, valid, safe IP address or host name.
        Throws an ArgumentException with a plain-language message otherwise.
        -Kind DnsName allows underscores in labels for DNS queries.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [AllowNull()][AllowEmptyString()][string]$Target,
        [ValidateSet('Host', 'DnsName')][string]$Kind = 'Host'
    )

    if ($null -eq $Target -or $Target.Trim().Length -eq 0) {
        throw [System.ArgumentException]::new('A target is required. Enter an IP address or host name.')
    }

    $value = $Target.Trim()
    $shown = ConvertTo-NdtSafeText -Text $value -MaxLength 80

    if ($value.Contains('/')) {
        throw [System.ArgumentException]::new("'$shown' looks like a subnet (CIDR) range. Enter individual IP addresses or host names; ranges are not allowed.")
    }
    if ($value.Contains('*') -or $value.Contains('?')) {
        throw [System.ArgumentException]::new("'$shown' contains a wildcard. Enter individual IP addresses or host names; wildcards are not allowed.")
    }
    if ($value -match '\A[0-9.]+-[0-9.]+\z') {
        throw [System.ArgumentException]::new("'$shown' looks like an address range. Enter each address separately; ranges are not allowed.")
    }

    if (Test-NdtIPv4Address -Value $value) {
        $firstOctet = [int]($value.Split('.')[0])
        if ($value -eq '0.0.0.0') {
            throw [System.ArgumentException]::new("'0.0.0.0' is not a host address. Enter the address of a specific device.")
        }
        if ($value -eq '255.255.255.255') {
            throw [System.ArgumentException]::new("'255.255.255.255' is the broadcast address. Broadcast targets are not allowed.")
        }
        if ($firstOctet -ge 224 -and $firstOctet -le 239) {
            throw [System.ArgumentException]::new("'$shown' is a multicast address. Multicast targets are not allowed because many devices can answer.")
        }
        return $value
    }

    if ($value.Contains(':')) {
        if (-not (Test-NdtIPv6Address -Value $value)) {
            throw [System.ArgumentException]::new("'$shown' is not a valid IPv6 address.")
        }
        $parsed = [System.Net.IPAddress]::Parse($value)
        if ($parsed.Equals([System.Net.IPAddress]::IPv6Any)) {
            throw [System.ArgumentException]::new("'::' is not a host address. Enter the address of a specific device.")
        }
        if ($value.ToLowerInvariant().StartsWith('ff')) {
            throw [System.ArgumentException]::new("'$shown' is an IPv6 multicast address. Multicast targets are not allowed because many devices can answer.")
        }
        return $value
    }

    if ($value -match '\A[0-9.]+\z') {
        throw [System.ArgumentException]::new("'$shown' is not a valid IPv4 address. Use four numbers from 0 to 255 separated by dots, without leading zeros (for example 192.0.2.10).")
    }

    if (Test-NdtHostname -Value $value -AllowUnderscore:($Kind -eq 'DnsName')) {
        return $value
    }

    throw [System.ArgumentException]::new("'$shown' is not a valid IP address or host name. Host names can contain letters, numbers, hyphens and dots, and cannot start or end with a hyphen.")
}

function Get-NdtValidatedTargetList {
    <#
        Validates every entry, removes duplicates (case-insensitive) and enforces the per-run limit.
    #>
    [CmdletBinding()]
    [OutputType([string[]])]
    param(
        [AllowNull()][AllowEmptyCollection()][string[]]$Target,
        [ValidateSet('Host', 'DnsName')][string]$Kind = 'Host',
        [int]$Maximum = $script:NdtLimits.MaxTargets
    )

    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    $clean = New-Object 'System.Collections.Generic.List[string]'

    foreach ($item in @($Target)) {
        if ($null -eq $item -or $item.Trim().Length -eq 0) { continue }
        $valid = Get-NdtValidatedTarget -Target $item -Kind $Kind
        if ($seen.Add($valid)) { $clean.Add($valid) }
    }

    if ($clean.Count -eq 0) {
        throw [System.ArgumentException]::new('No targets were entered. Enter at least one IP address or host name.')
    }
    if ($clean.Count -gt $Maximum) {
        throw [System.ArgumentException]::new("Too many targets ($($clean.Count)). The limit is $Maximum per run. This toolkit checks specific devices; it is not a network scanner.")
    }

    return $clean.ToArray()
}

function Get-NdtValidatedPortList {
    <#
        Validates TCP port numbers (1-65535), removes duplicates and enforces the per-run limit.
    #>
    [CmdletBinding()]
    [OutputType([int[]])]
    param(
        [AllowNull()][AllowEmptyCollection()][int[]]$Port,
        [int]$Maximum = $script:NdtLimits.MaxPorts
    )

    $clean = New-Object 'System.Collections.Generic.List[int]'
    foreach ($p in @($Port)) {
        if ($null -eq $p) { continue }
        if ($p -lt 1 -or $p -gt 65535) {
            throw [System.ArgumentException]::new("Port $p is out of range. Use a number from 1 to 65535.")
        }
        if (-not $clean.Contains($p)) { $clean.Add($p) }
    }

    if ($clean.Count -eq 0) {
        throw [System.ArgumentException]::new('No ports were entered. Enter at least one TCP port number, for example 443.')
    }
    if ($clean.Count -gt $Maximum) {
        throw [System.ArgumentException]::new("Too many ports ($($clean.Count)). The limit is $Maximum per run. Port scanning is not supported.")
    }

    return $clean.ToArray()
}

function ConvertFrom-NdtListInput {
    <#
        Splits typed input such as "192.0.2.10, 192.0.2.11 server01.example" into separate entries.
        Commas, semicolons and whitespace are all treated as separators.
    #>
    [CmdletBinding()]
    [OutputType([string[]])]
    param(
        [AllowNull()][AllowEmptyString()][string]$Text
    )

    if ([string]::IsNullOrWhiteSpace($Text)) { return @() }
    return @($Text -split '[,;\s]+' | Where-Object { $_.Length -gt 0 })
}

function ConvertFrom-NdtPortInput {
    <#
        Converts typed port input ("80, 443 3389") into validated integers.
        Port ranges such as 1-1024 are rejected on purpose.
    #>
    [CmdletBinding()]
    [OutputType([int[]])]
    param(
        [AllowNull()][AllowEmptyString()][string]$Text
    )

    $ports = New-Object 'System.Collections.Generic.List[int]'
    foreach ($token in (ConvertFrom-NdtListInput -Text $Text)) {
        $shown = ConvertTo-NdtSafeText -Text $token -MaxLength 20
        if ($token.Contains('-')) {
            throw [System.ArgumentException]::new("Port ranges like '$shown' are not allowed. List each port separately, for example 80,443.")
        }
        if ($token -notmatch '\A[0-9]{1,5}\z') {
            throw [System.ArgumentException]::new("'$shown' is not a port number. Use whole numbers from 1 to 65535.")
        }
        $ports.Add([int]$token)
    }

    return Get-NdtValidatedPortList -Port $ports.ToArray()
}

function Get-NdtValidatedTcpCheckCount {
    <#
        Returns hosts x ports, or throws if that exceeds the per-run TCP check limit.
    #>
    [CmdletBinding()]
    [OutputType([int])]
    param(
        [int]$TargetCount,
        [int]$PortCount
    )

    $total = $TargetCount * $PortCount
    if ($total -gt $script:NdtLimits.MaxTcpChecksPerRun) {
        throw [System.ArgumentException]::new("That would be $total TCP checks ($TargetCount hosts x $PortCount ports). The limit is $($script:NdtLimits.MaxTcpChecksPerRun) per run. Use fewer hosts or ports.")
    }
    return $total
}
