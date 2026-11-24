<#
    Thin wrappers around the operating system and .NET networking calls.

    Keeping these small and separate means:
      - the public functions contain the decision logic (PASS/FAIL, messages, limits), and
      - unit tests can replace these wrappers with Pester mocks to get repeatable
        success / failure / timeout cases without depending on the real network.

    All of these calls are read-only. They send at most one echo request, one TCP connection
    attempt or one tracert run per call and never change any setting.
#>

function Resolve-NdtAddress {
    <#
        Returns the IP address a check should use for a validated target.
        IP literals are returned as-is. Host names are resolved with the Windows resolver
        (hosts file, DNS cache, DNS servers), which is what most applications use.
        When a name has both IPv4 and IPv6 addresses, IPv4 is preferred so results are
        predictable on typical IPv4 campus and office networks. To test IPv6, enter the
        IPv6 address itself.
    #>
    [CmdletBinding()]
    [OutputType([System.Net.IPAddress])]
    param(
        [Parameter(Mandatory)][string]$Target
    )

    $literal = $null
    if ([System.Net.IPAddress]::TryParse($Target, [ref]$literal)) {
        return $literal
    }

    $addresses = @([System.Net.Dns]::GetHostAddresses($Target))
    $ipv4 = @($addresses | Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork })
    if ($ipv4.Count -gt 0) { return $ipv4[0] }
    if ($addresses.Count -gt 0) { return $addresses[0] }

    throw [System.InvalidOperationException]::new("The name '$Target' did not resolve to any IP address.")
}

function Invoke-NdtPing {
    <#
        Sends one ICMP echo request with System.Net.NetworkInformation.Ping.

        Ping is used instead of Test-Connection because Test-Connection returns different
        object types in Windows PowerShell 5.1 (Win32_PingStatus) and PowerShell 7
        (PingStatus), and the 5.1 version has no timeout parameter. The .NET class behaves
        the same in both and takes a timeout in milliseconds.
    #>
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory)][System.Net.IPAddress]$Address,
        [int]$TimeoutMs = 1000,
        [int]$Ttl = 128,
        [int]$BufferSize = 32
    )

    $pinger = New-Object -TypeName System.Net.NetworkInformation.Ping
    try {
        $buffer = New-Object -TypeName 'byte[]' -ArgumentList $BufferSize
        $options = New-Object -TypeName System.Net.NetworkInformation.PingOptions -ArgumentList $Ttl, $false
        $reply = $pinger.Send($Address, $TimeoutMs, $buffer, $options)

        $replyTtl = $null
        if ($null -ne $reply.Options) { $replyTtl = $reply.Options.Ttl }

        $replyAddress = $null
        if ($null -ne $reply.Address) { $replyAddress = $reply.Address.ToString() }

        return [pscustomobject]@{
            Status       = $reply.Status.ToString()
            RoundtripMs  = [long]$reply.RoundtripTime
            ReplyAddress = $replyAddress
            Ttl          = $replyTtl
            Message      = ''
        }
    }
    finally {
        $pinger.Dispose()
    }
}

function Invoke-NdtTcpConnect {
    <#
        Attempts one TCP connection with System.Net.Sockets.TcpClient and an explicit timeout.

        Test-NetConnection -Port is not used here because it has no timeout parameter and,
        on a closed port, measured about 9 seconds against 127.0.0.1 on the development
        machine (it also runs a ping first). TcpClient with BeginConnect + WaitOne lets the
        caller choose the timeout and tells "refused" apart from "no answer".

        Note: Windows retries a connection that is refused, so a refused result can take
        about 2 seconds to come back. Timeouts below roughly 2500 ms can therefore report a
        closed port as TimedOut. The public default is 3000 ms for that reason.

        Returned State values: Open, Refused, TimedOut, Unreachable, Error
    #>
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory)][System.Net.IPAddress]$Address,
        [Parameter(Mandatory)][ValidateRange(1, 65535)][int]$Port,
        [int]$TimeoutMs = 3000
    )

    $client = New-Object -TypeName System.Net.Sockets.TcpClient -ArgumentList $Address.AddressFamily
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $pending = $client.BeginConnect($Address, $Port, $null, $null)
        if (-not $pending.AsyncWaitHandle.WaitOne($TimeoutMs)) {
            return [pscustomobject]@{
                State     = 'TimedOut'
                ElapsedMs = [long]$timer.ElapsedMilliseconds
                Message   = "No response within $TimeoutMs ms."
            }
        }

        try {
            $client.EndConnect($pending)
            return [pscustomobject]@{
                State     = 'Open'
                ElapsedMs = [long]$timer.ElapsedMilliseconds
                Message   = 'TCP handshake completed.'
            }
        }
        catch {
            $inner = $_.Exception
            while ($null -ne $inner.InnerException) { $inner = $inner.InnerException }

            $state = 'Error'
            if ($inner -is [System.Net.Sockets.SocketException]) {
                switch ($inner.SocketErrorCode.ToString()) {
                    'ConnectionRefused' { $state = 'Refused' }
                    'TimedOut' { $state = 'TimedOut' }
                    'HostUnreachable' { $state = 'Unreachable' }
                    'NetworkUnreachable' { $state = 'Unreachable' }
                    default { $state = 'Error' }
                }
            }

            return [pscustomobject]@{
                State     = $state
                ElapsedMs = [long]$timer.ElapsedMilliseconds
                Message   = (ConvertTo-NdtSafeText -Text $inner.Message -MaxLength 300)
            }
        }
    }
    finally {
        $timer.Stop()
        $client.Close()
    }
}

function Invoke-NdtTracert {
    <#
        Runs the built-in tracert.exe with:
          -d   do not resolve hop addresses to names (faster, and avoids extra DNS traffic)
          -h   maximum number of hops
          -w   timeout in milliseconds for each probe
        tracert.exe is called by full path from System32 so a different program named
        tracert earlier in PATH cannot be picked up. The target has already passed
        validation, so it cannot contain spaces, quotes or a leading hyphen.
    #>
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory)][string]$Target,
        [Parameter(Mandatory)][int]$MaxHops,
        [Parameter(Mandatory)][int]$TimeoutMs
    )

    $tracertPath = Join-Path -Path $env:SystemRoot -ChildPath 'System32\tracert.exe'
    if (-not (Test-Path -LiteralPath $tracertPath -PathType Leaf)) {
        throw [System.IO.FileNotFoundException]::new("tracert.exe was not found at $tracertPath.")
    }

    # Keep native-command output (including anything on stderr) as plain text lines.
    # In Windows PowerShell 5.1, redirected stderr lines become error records, and a caller's
    # ErrorActionPreference of 'Stop' would turn them into terminating errors. PowerShell 7.3+
    # can also raise an error for a non-zero exit code when this preference is enabled.
    $ErrorActionPreference = 'Continue'
    Set-Variable -Name 'PSNativeCommandUseErrorActionPreference' -Value $false -Scope Local

    $output = & $tracertPath -d -h $MaxHops -w $TimeoutMs $Target 2>&1
    $exitCode = $LASTEXITCODE

    $lines = @()
    foreach ($item in @($output)) {
        $lines += [string]$item
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Lines    = [string[]]$lines
    }
}
