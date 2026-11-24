# Network Diagnostics Toolkit

A PowerShell module and menu for the first round of network troubleshooting on a Windows PC: ping, traceroute, IP configuration, DNS lookups, network adapter status and TCP port checks. Every check prints a clear `[PASS]`, `[FAIL]`, `[WARN]` or `[INFO]` line, and the results can be saved as a timestamped CSV file and text report or turned into a short block of notes to paste into a help desk ticket.

It is written for junior IT support and network technicians. All checks are read-only and only contact the targets you type in.

```
[PASS] Ping 127.0.0.1 - 2/2 replies, 0% loss, min/avg/max 0/0/0 ms
[FAIL] TcpPort 127.0.0.1 - TCP port 56168 refused on 127.0.0.1: the host answered, but nothing is listening on that port or a firewall rejected the connection.
[PASS] Traceroute 127.0.0.1 - Reached 127.0.0.1 in 1 hop(s).
```

## Contents

- [Overview](#overview)
- [Objectives](#objectives)
- [Technologies and why they were chosen](#technologies-and-why-they-were-chosen)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Usage](#usage)
- [Implementation details](#implementation-details)
- [Testing](#testing)
- [Troubleshooting examples](#troubleshooting-examples)
- [Challenges](#challenges)
- [What's next](#whats-next)
- [Credits and license](#credits-and-license)

## Overview

When a user says "I can't reach the intranet" or "my wall jack doesn't work", the first checks are usually the same: does this PC have a valid address, is the cable linked, can it reach the gateway, does the name resolve, does the server answer, and is the service port open. This toolkit runs those checks with consistent output and keeps a record of what was tested and when.

There are two ways to use it:

- **Interactive menu**: run `Start-NetworkToolkit.ps1` and pick numbered options. Good for live troubleshooting.
- **PowerShell commands**: import the module and call `Test-NdtPing`, `Test-NdtPort` and the rest directly, pipe the results into `Export-NdtReport` or `New-NdtTicketNote`, or use them in your own scripts.

The repository also includes [fictional sample reports](samples/), [real console transcripts](docs/examples/) and a [walkthrough with interview questions](docs/WALKTHROUGH.md).

## Objectives

1. Automate the routine ping, tracert, ipconfig and nslookup-style checks, and log the results to CSV for ticket notes.
2. Make results easy to read for someone new to networking: every result has a status marker and a plain-language summary that says what the result usually means.
3. Produce a short, plain-text summary that can be pasted straight into a ServiceNow work note or an email.
4. Stay safe to run anywhere: read-only, explicit targets only, small limits, no scanning.
5. Run on the Windows PowerShell 5.1 that ships with Windows, with no extra installs, and also work on PowerShell 7.
6. Be tested: unit tests for the decision logic and integration tests that run the real checks against this computer.

## Technologies and why they were chosen

| Technology | Why |
| --- | --- |
| **Windows PowerShell 5.1** | Installed on every supported Windows 10/11 and Windows Server machine, so help desk PCs can run the toolkit without installing anything. The code avoids PowerShell 7-only syntax. |
| **PowerShell 7** | Supported as a second target. It is only tested in GitHub Actions (see [Testing](#testing)). |
| **`System.Net.NetworkInformation.Ping`** (.NET) | Used for ping instead of `Test-Connection`. `Test-Connection` returns different objects in 5.1 and 7, and the 5.1 version has no timeout parameter (checked with `Get-Command Test-Connection`). The .NET class behaves the same in both and takes a timeout in milliseconds. |
| **`tracert.exe -d`** | Used for traceroute instead of `Test-NetConnection -TraceRoute`. tracert shows the three round-trip times per hop and which hops did not answer; `Test-NetConnection -TraceRoute` only returns a list of hop addresses and ran a ping test first (5.1 s against 127.0.0.1, versus 0.12 s for tracert, on the development PC). |
| **`Get-NetIPConfiguration`** (NetTCPIP) | The object form of `ipconfig /all`: addresses, prefix length, gateway, DNS servers, DHCP state and the adapter, without parsing text. |
| **`Resolve-DnsName`** (DnsClient) | Supports record types (A, AAAA, CNAME, MX, NS, PTR, SOA, SRV, TXT), a chosen DNS server and DNS-only queries, and returns error codes that separate "name does not exist" from "server did not answer". |
| **`Get-NetAdapter`** (NetAdapter) | Link status, link speed, media type and MAC address for each adapter. |
| **`System.Net.Sockets.TcpClient`** (.NET) | Used for TCP port checks instead of `Test-NetConnection -Port`, which has no timeout setting. Against a closed port on 127.0.0.1 on the development PC, `Test-NetConnection -Port` took 8.9 s; `TcpClient` reported "refused" in 2.1 s. |
| **Pester 6.2.0** | The standard PowerShell test framework. Mocks let unit tests replace the Windows network calls with fixed data, so each pass/fail/timeout case is repeatable. |
| **PSScriptAnalyzer** | Static analysis for PowerShell. Run in CI only. |
| **GitHub Actions (`windows-latest`)** | Runs the tests on Windows PowerShell 5.1 and PowerShell 7 on every push and pull request. |

The timings above are single measurements on one Windows 11 PC (Windows PowerShell 5.1.26100), meant to show the difference in behaviour, not as benchmarks.

## Features

Everything listed here is implemented and covered by tests.

| Command | What it checks | Status rules |
| --- | --- | --- |
| `Test-NdtPing` | ICMP echo (ping) to 1-10 hosts, 1-10 requests each | PASS all replies, WARN some loss, FAIL no replies or name not found |
| `Trace-NdtRoute` | Path to one host with per-hop times (tracert) | PASS destination reached, FAIL not reached / unreachable / name not found |
| `Get-NdtIPConfig` | Addresses, gateway, DNS servers, DHCP, MAC per interface | WARN APIPA, no address, no DNS servers, no gateway anywhere; INFO disconnected adapter; PASS otherwise |
| `Resolve-NdtDnsName` | DNS records for 1-10 names, optional server, PTR for IPs | PASS answers; FAIL NXDOMAIN, no records, timeout, server failure |
| `Get-NdtAdapter` | Adapter status, link speed, MAC address | PASS up, WARN disconnected or wired link at 100 Mbps or less, INFO disabled / not present |
| `Test-NdtPort` | TCP connection to specific ports | PASS open; FAIL refused, timed out, unreachable |
| `Invoke-NdtQuickCheck` | DNS + ping + optional ports for each target | (uses the rules above) |
| `Show-NdtResult` | Prints results with markers and optional colour | |
| `New-NdtTicketNote` | Plain ASCII notes for a ticket | |
| `Export-NdtReport` | Timestamped CSV + text report | |
| `Start-NdtMenu` | The interactive menu (also started by `Start-NetworkToolkit.ps1`) | |

Every command has full comment-based help: `Get-Help Test-NdtPort -Full`.

### Safety limits

These are enforced in code before any traffic is sent, and covered by tests.

| Rule | Limit |
| --- | --- |
| Targets per run (ping, DNS, port check, quick check) | 10 |
| Distinct TCP ports per run | 20 |
| TCP checks per run (hosts x ports) | 20 |
| Traceroute | 1 target, 1-30 hops, 100-5000 ms per probe |
| Ping | 1-10 requests per target, 100-5000 ms timeout, 500 ms pause between requests |
| TCP timeout | 500-10000 ms (default 3000) |
| Rejected input | CIDR ranges (`192.0.2.0/24`), address ranges (`192.0.2.1-50`), port ranges (`1-1024`), wildcards, broadcast `255.255.255.255`, multicast (`224.0.0.0/4`, `ff00::/8`), `0.0.0.0` and `::` |
| System changes | None. The module never calls commands that change adapters, IP settings, DNS, routes or the firewall; a test checks the source code for such commands. |

Only run checks against devices you support or have permission to test.

### Output and reports

- Console lines start with `[PASS]`, `[FAIL]`, `[WARN]`, `[INFO]` or `[ERROR]`, so the meaning is clear without colour. Colour is added when the console supports it; turn it off with `-NoColor` or the `NO_COLOR` environment variable.
- `Export-NdtReport` writes `reports\ndt-report-<yyyyMMdd-HHmmss>.csv` and `.txt`. Timestamps inside are ISO 8601 with the UTC offset, for example `2026-11-20T09:14:02-08:00`. Existing files are never overwritten.
- CSV columns: `Timestamp, SourceComputer, TestType, Target, Status, Summary, Details`.
- The toolkit never asks for or stores credentials. Reports do contain internal addresses, host names and MAC addresses, so `reports/` is in `.gitignore` and should be handled like other ticket data.

See [samples/sample-report.txt](samples/sample-report.txt), [samples/sample-report.csv](samples/sample-report.csv) and [samples/sample-ticket-note.txt](samples/sample-ticket-note.txt) for a complete fictional example.

## Architecture

```
apps/network-diagnostics-toolkit/
|-- Start-NetworkToolkit.ps1          entry script: imports the module, opens the menu
|-- src/NetworkDiagnostics/
|   |-- NetworkDiagnostics.psd1       module manifest (version, exports, 5.1 + Core)
|   |-- NetworkDiagnostics.psm1       loads Private/ then Public/, sets the safety limits
|   |-- Public/                       one file per exported command (11)
|   `-- Private/
|       |-- Validation.ps1            IP / host name / port checks, limits, input parsing
|       |-- NetworkWrappers.ps1       the only code that touches the network (Ping, TcpClient, tracert, DNS resolver)
|       |-- PingAndPort.ps1           turns replies and connection attempts into results
|       |-- Traceroute.ps1            parses tracert output into hops
|       |-- Dns.ps1                   formats records, maps DNS error codes
|       |-- LocalNetwork.ps1          IP configuration and adapter results
|       |-- Results.ps1               shared result object, timestamps, text cleaning
|       |-- Report.ps1                CSV/text formatting, safe file writing
|       |-- Output.ps1                the only Write-Host call (markers + colour)
|       `-- Menu.ps1                  prompts and menu handlers
|-- tests/                            Pester tests (unit + integration)
|-- tools/                            test runner, sample and transcript generators
|-- samples/                          fictional reports (documentation addresses only)
`-- docs/                             walkthrough, console transcripts, screenshot list
```

The toolkit lives in the `apps/` folder of the [enobot/nate](https://github.com/enobot/nate) repository. Its CI workflow is at the repository root in [`.github/workflows/toolkit.yml`](../../.github/workflows/toolkit.yml) and runs only when this folder changes.

Each check follows the same three steps:

```
 typed input --> 1. validate          Validation.ps1: format, ranges, limits
                     |                (throws a plain-language error; nothing is sent)
                     v
                 2. collect           NetworkWrappers.ps1 / Windows cmdlets
                     |                (one ping, one TCP attempt, one tracert run ...)
                     v
                 3. interpret         PingAndPort / Traceroute / Dns / LocalNetwork
                     |                (PASS/FAIL/WARN/INFO + summary + detail lines)
                     v
            result objects --> Show-NdtResult      console
                           --> New-NdtTicketNote   ticket text
                           --> Export-NdtReport    CSV + text files
```

Keeping step 2 in small wrapper functions is what makes the code testable: unit tests replace the wrappers with mocks and check the decisions in step 3 with fixed data, while integration tests run step 2 for real against 127.0.0.1.

## Installation

Requirements: Windows 10, Windows 11 or Windows Server with Windows PowerShell 5.1 (built in) or PowerShell 7. No administrator rights are needed; all checks and tests were run in a non-elevated session.

1. Download the repository (green **Code** button > **Download ZIP**, then extract it and open the `apps\network-diagnostics-toolkit` folder) or clone it:

   ```powershell
   git clone https://github.com/enobot/nate.git
   cd nate\apps\network-diagnostics-toolkit
   ```

2. Start the menu:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-NetworkToolkit.ps1
   ```

### Execution policy notes

Windows client editions block `.ps1` scripts by default (execution policy `Restricted`), and files from a downloaded ZIP are marked as coming from the internet. If you see "running scripts is disabled on this system", you have three options:

- **Bypass for one run (recommended):** `powershell.exe -ExecutionPolicy Bypass -File .\Start-NetworkToolkit.ps1`. The setting only applies to that one PowerShell process and is gone when it closes.
- **Bypass for the current window:** `Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process`, then run `.\Start-NetworkToolkit.ps1`. Again, only that window is affected, nothing is saved and no admin rights are needed.
- **Unblock the downloaded files** after reading them: `Get-ChildItem -Recurse | Unblock-File`. This removes the "downloaded from the internet" mark so a `RemoteSigned` policy will allow them.

`-Scope Process` is used so the computer's own policy is never changed. Execution policy is a safety setting against running scripts by accident, not a security boundary, but on a managed PC it is still something IT controls. If Group Policy sets the policy, it takes priority over `-Scope Process`; in that case ask your IT team rather than working around it.

## Usage

### Interactive menu

```powershell
.\Start-NetworkToolkit.ps1                                   # reports go to .\reports
.\Start-NetworkToolkit.ps1 -ReportDirectory C:\Tickets\INC0012345 -NoColor
```

```
 Network Diagnostics Toolkit 1.0.0
 Read-only checks. Only the targets you type are contacted.
 --------------------------------------------------------------
  1  Ping (ICMP echo) test
  2  Traceroute
  3  IP configuration
  4  DNS lookup
  5  Network adapters
  6  TCP port check
  7  Quick check (DNS + ping + TCP ports)
  8  Show ticket notes for this session
  9  Save report (CSV + text)
  C  Clear session results
  H  Help and safety limits
  Q  Quit
```

Type several targets or ports separated by commas or spaces. Press Enter at a prompt to accept the `[default]`. Results build up during the session; option 8 shows ticket notes (and can copy them to the clipboard) and option 9 saves the CSV and text report. Quitting with unsaved results asks whether to save them.

A full recorded session is in [docs/examples/menu-session.txt](docs/examples/menu-session.txt), and examples of rejected input are in [docs/examples/input-validation.txt](docs/examples/input-validation.txt).

### PowerShell commands

```powershell
Import-Module .\src\NetworkDiagnostics\NetworkDiagnostics.psd1

# Is the gateway answering?
Test-NdtPing -Target 192.0.2.1 | Show-NdtResult

# Is the web server listening, and is RDP blocked?
Test-NdtPort -Target 203.0.113.50 -Port 443, 3389 | Show-NdtResult

# Where does the path stop?
Trace-NdtRoute -Target 203.0.113.50 -MaxHops 15 | Show-NdtResult

# What does this PC have for address, gateway and DNS?
Get-NdtIPConfig | Show-NdtResult

# Ask a specific DNS server for a record
Resolve-NdtDnsName -Name intranet.example -Server 198.51.100.53 -DnsOnly | Show-NdtResult

# Cable and link speed, plus MAC address for the switch MAC table lookup
Get-NdtAdapter | Show-NdtResult

# The usual "can't reach X" checks in one step, then ticket notes and a saved report
$results = Invoke-NdtQuickCheck -Target intranet.example -Port 443
$results | New-NdtTicketNote -Title 'INC0012345 user cannot open intranet' | Set-Clipboard
$results | Export-NdtReport -Title 'INC0012345'
```

Results are normal objects, so they work with the usual PowerShell commands:

```powershell
Test-NdtPing -Target 192.0.2.1, 192.0.2.10 -Count 2 | Where-Object Status -ne 'PASS'
(Trace-NdtRoute -Target 203.0.113.50).Hops | Format-Table
```

More examples with real output: [docs/examples/cmdlet-usage.txt](docs/examples/cmdlet-usage.txt).

### Example ticket notes

Shortened from the fictional [sample](samples/sample-ticket-note.txt) (`...` marks removed text):

```
SAMPLE - fictional data - INC0000000 user cannot open intranet.example
Run: 2026-11-20T09:14:02-08:00 to 2026-11-20T09:14:32-08:00 from EXAMPLE-HELPDESK-01
Tool: Network Diagnostics Toolkit 1.0.0 (read-only checks; only the targets listed were contacted)

[PASS] IPConfig Ethernet - IPv4 192.0.2.25/24; gateway 192.0.2.1; DNS 198.51.100.53; DHCP Enabled
[PASS] Adapter Ethernet - Up at 1 Gbps, MAC 00-00-5E-00-53-25
...
[PASS] Ping 192.0.2.1 - 4/4 replies, 0% loss, min/avg/max 1/1/2 ms
[FAIL] DNS intranet.example - A lookup for intranet.example failed: The DNS query timed out. ...
[PASS] Ping 203.0.113.50 - 4/4 replies, 0% loss, min/avg/max 8/9/10 ms
[PASS] TcpPort 203.0.113.50 - TCP port 443 is open on 203.0.113.50 (connected in 11 ms).
[FAIL] Ping 198.51.100.53 - 0/4 replies, 100% loss. ...
...
Totals: 10 check(s) - 5 PASS, 4 FAIL, 1 WARN, 0 INFO
```

## Implementation details

**One result shape for every check.** Each check returns objects with `Timestamp`, `SourceComputer`, `TestType`, `Target`, `Status`, `Summary` and `Details`, plus check-specific properties such as `AverageMs`, `State` or `Hops`. Because the core properties are the same, ping, DNS and port results can go into one CSV file and one ticket note.

**Strict input validation.** IPv4 addresses must be four decimal numbers from 0 to 255 without leading zeros before `[System.Net.IPAddress]::TryParse` is used, IPv6 addresses must parse as IPv6 (numeric zone IDs only), and host names must follow RFC 1123 (labels of letters, digits and hyphens, 63 characters per label, 253 in total, no leading or trailing hyphen). DNS lookups also accept underscores for names like `_ldap._tcp.example.com`. List limits are checked on the whole list, including pipeline input, before anything is sent.

**Ping.** One `Ping.Send` per request with a timeout and a 500 ms pause between requests. Only `Success` replies count as received. Host names are resolved once with the Windows resolver, preferring IPv4, and the address used is shown in the result.

**TCP port check.** `TcpClient.BeginConnect` plus `WaitOne(timeout)`, then the connection is closed straight away. `ConnectionRefused` becomes `Refused`; no answer within the timeout becomes `TimedOut`. No data is sent.

**Traceroute.** `tracert.exe -d -h <hops> -w <ms> <target>` is run from `%SystemRoot%\System32` by full path. The parser reads the hop number, the three probe columns and the address, which are the same on non-English Windows; the translated sentences are not used for decisions.

**DNS.** `Resolve-DnsName` answers are filtered by section: answers and local answers count, Authority and Additional records do not. Win32 error codes are mapped to plain causes (9003 NXDOMAIN, 1460 timeout, 9002 SERVFAIL, 9005 refused, 9501 no records, 10054 nothing listening on port 53).

**Reports.** CSV and text files are written as UTF-8 with a byte order mark on both PowerShell versions (Excel needs the BOM, and 5.1 and 7 have different encoding defaults). Files are opened with `FileMode.CreateNew`, so an existing report is never overwritten; a `-1`, `-2` suffix is added instead. Report folder paths must be file system paths, and file base names are limited to letters, digits, `-` and `_`.

**Untrusted text.** DNS TXT records, tracert output, error messages and typed input are cleaned of control characters (such as terminal escape sequences) before they are printed or saved, and CSV cells that start with `=`, `+`, `-` or `@` get a leading `'` so a spreadsheet will not run them as formulas.

**Errors.** Bad input raises a short message (for example *"'192.0.2.0/24' looks like a subnet (CIDR) range..."*). Network failures become FAIL results instead of exceptions. The menu prints `[ERROR] <message>` and carries on; users never see a stack trace.

## Testing

The tests are in [`tests/`](tests/) and run with [`tools/Invoke-Tests.ps1`](tools/Invoke-Tests.ps1).

```powershell
# Everything (unit + integration)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\Invoke-Tests.ps1

# Only one group
.\tools\Invoke-Tests.ps1 -Tag Unit
.\tools\Invoke-Tests.ps1 -Tag Integration

# With code coverage of src\NetworkDiagnostics
.\tools\Invoke-Tests.ps1 -CodeCoverage

# CI mode: writes TestResults\pester-*.xml and returns a non-zero exit code on failure
.\tools\Invoke-Tests.ps1 -CI
```

Pester 5.0 or later is required (developed with Pester 6.2.0): `Install-Module Pester -MinimumVersion 5.0.0 -Scope CurrentUser`. Note that in Windows PowerShell 5.1, `Import-Module Pester -MinimumVersion 6` fails because `6` is not a valid version string; use `'6.0.0'`.

**What is covered**

| Area | Unit tests (mocked) | Integration tests (real, this PC only) |
| --- | --- | --- |
| Validation | IPv4/IPv6/host name rules, TryParse quirks, CIDR/range/wildcard/broadcast/multicast rejection, list and port limits, typed input parsing, limits applied before any network call | |
| Ping | PASS/WARN/FAIL rules, statistics, unreachable replies, name resolution failure, errors, timeout pass-through | ping 127.0.0.1 and localhost, unresolvable `.invalid` name |
| TCP port | Open/Refused/TimedOut/Unreachable/Error, one result per host and port, timeouts | open port on a listener the test creates; closed port reports Refused |
| Traceroute | tracert parsing (reached, timeouts, unreachable, host names, IPv6, no hops) | tracert to 127.0.0.1 |
| DNS | record formatting for each type, Authority/Additional filtering, error code mapping, -Server/-DnsOnly, PTR for IPs, control characters | `localhost` A lookup |
| IP config / adapters | APIPA, missing DNS/gateway, disconnected adapters, duplicate DNS servers, speed warning, parameter sets | reads the real configuration and adapters |
| Reports | CSV columns, BOM, CSV injection, no overwrite, safe names, -WhatIf, non-file-system paths, ticket notes | quick check exported to CSV and text |
| Menu | every option, invalid input, save/quit/clear, clipboard prompt, end of input | `Start-NetworkToolkit.ps1` in a new PowerShell process with piped answers |
| Module | manifest, exports, help on every command and parameter, ASCII-only sources, no `Write-Host` outside the output helper, no state-changing commands | |

**Results on the development PC** (Windows 11, Windows PowerShell 5.1.26100, Pester 6.2.0, non-elevated): 271 tests passed, 0 failed, 0 skipped (260 unit, 11 integration). Pester's code coverage for `src\NetworkDiagnostics` was 94.3% of 1,619 analysed commands. The end-to-end menu test runs in a separate process, so it is not counted in that figure.

**PowerShell 7 and PSScriptAnalyzer** are only run in GitHub Actions ([toolkit.yml](../../.github/workflows/toolkit.yml)): the same suite runs once with `shell: powershell` (5.1) and once with `shell: pwsh` (7), and PSScriptAnalyzer checks the module, entry script and tools. Until that workflow has run on GitHub, PowerShell 7 support is untested.

## Troubleshooting examples

| What you see | What it usually means | Next step |
| --- | --- | --- |
| DNS lookup FAIL (timeout), but ping and TCP 443 to the server's IP address PASS | The server and network path are fine; name resolution is the problem | Check the DNS servers in `Get-NdtIPConfig`, ping the DNS server, try `Resolve-NdtDnsName -Server <other DNS server>` (this is the scenario in the [sample report](samples/sample-report.txt)) |
| DNS FAIL with NXDOMAIN | The name does not exist in DNS | Check the spelling and the DNS suffix; ask whoever manages DNS whether the record exists |
| DNS FAIL "no records" for AAAA but A works | The name only has an IPv4 address | Usually normal |
| Name works in a browser but `Resolve-NdtDnsName -DnsOnly` fails | The name comes from the hosts file or local name resolution, not DNS | Look at `C:\Windows\System32\drivers\etc\hosts` |
| Ping FAIL but TCP port PASS | The host is up; ICMP is blocked by a firewall | Use TCP checks for that host |
| Ping PASS, TCP port Refused | The host is up but the service is not listening (or is rejecting connections) | Check the service on the server |
| TCP port TimedOut | Something is dropping the traffic (firewall or ACL), or the host is offline | Compare with ping and traceroute; check firewall rules |
| IPConfig WARN with a `169.254.x.x` address | APIPA: no DHCP server answered | Check the cable/jack, that the switch port is active and in the right VLAN, and that DHCP is working |
| Adapter WARN "media disconnected" | No link | Check the patch cable, wall jack and switch port, or connect Wi-Fi |
| Adapter WARN "Up at 100 Mbps" on a wired link | The link fell back to a lower speed | Try another patch cable or jack if both ends support 1 Gbps |
| Ping WARN with partial loss | Intermittent drops | Repeat with `-Count 10`; check for a bad cable, Wi-Fi interference or congestion |
| Traceroute FAIL, last hop that answered is hop 2 | Traffic stops at or after that router | Report the last good hop; note that single `*` hops in the middle are normal |
| Traceroute PASS with some `*` hops | Some routers do not answer traceroute probes | Nothing to fix if the destination was reached |
| "running scripts is disabled on this system" | Execution policy | See [Execution policy notes](#execution-policy-notes) |

## Challenges

These are technical problems found while building and testing the toolkit, and how the design handles them.

- **`IPAddress.TryParse` accepts addresses nobody means to type.** On .NET Framework, `'1'` parses as `0.0.0.1`, `'192.168.1'` as `192.168.0.1`, `'010.1.1.1'` as `8.1.1.1` (octal) and `'0x7f.0.0.1'` as `127.0.0.1`. The toolkit checks the dotted-decimal format first and only then calls TryParse. There are tests for each case.
- **`Test-NetConnection` is slow when things fail.** It has no timeout parameter and runs extra checks. Measured on the development PC against 127.0.0.1: 8.9 s for a closed port and 5.1 s for a one-hop traceroute. Using `TcpClient` and `tracert.exe` keeps failed checks short and predictable.
- **Windows waits about 2 seconds before reporting a refused connection.** A closed port on 127.0.0.1 took about 2,050-2,070 ms to come back as refused, so a 1-second timeout would wrongly report "timed out" (which suggests a firewall). The default TCP timeout is 3000 ms for this reason, and an integration test checks that a closed port is reported as Refused.
- **Windows PowerShell 5.1 and PowerShell 7 behave differently.** `Test-Connection` was rewritten in PowerShell 7 with different output, so the toolkit uses the .NET `Ping` class. Default file encodings differ, so reports are written with .NET using UTF-8 with BOM. In 5.1, redirected stderr from a native program becomes error records, so the tracert wrapper sets its own error preference.
- **5.1 reads script files without a BOM as the ANSI code page.** Non-ASCII characters such as curly quotes or dashes can break a script on another PC. All source files are ASCII, and a test enforces it.
- **`Resolve-DnsName` does not always throw when there is no answer.** If a name exists but has no record of the requested type, it returns only the zone's SOA record in the Authority section, and `localhost` answers come back in the Question section. The toolkit filters by section so it does not report an SOA record as a successful A lookup.
- **`Get-NetIPConfiguration -All` cannot be combined with `-InterfaceAlias`.** They are separate parameter sets. A unit test caught this because Pester mocks keep the real parameter sets.
- **Windows sometimes lists the same DNS server twice.** Seen on the development PC for an IPv6 DNS server; duplicates are removed.
- **Piped answers and end of input.** When answers are piped into the menu, `Read-Host` returns `$null` at the end of the input. The menu treats that as "quit" instead of looping forever, which also makes the end-to-end test possible.
- **PowerShell unrolls one-item arrays.** A function returning a one-element array returns a plain string, and `$targets[0]` would then be the first character. The menu helpers return lists with the unary comma operator.
- **Limits must apply to pipeline input too.** `1..50 | Test-NdtPing` would otherwise run the 10-target check once per item. Commands collect pipeline input first and validate the whole list in the `end` block.

## What's next

Ideas that are not implemented yet:

- Ask for an optional ticket number in the menu when saving, and use it as the report title.
- Optional JSON export for other tools.
- Run the tracert parser tests against output captured on a non-English Windows install.
- Sign the scripts (Authenticode) so they can run where the execution policy is `AllSigned`.
- Publish the module to the PowerShell Gallery. A manual workflow for it is ready ([toolkit-publish.yml](../../.github/workflows/toolkit-publish.yml)); it needs a Gallery account and an API key saved as the `PSGALLERY_API_KEY` repository secret.
- Add real screenshots (see [docs/screenshots/README.md](docs/screenshots/README.md)).

## Credits and license

Created by Nathanael Haig and Tracy Tran.

Released under the [MIT License](LICENSE). Copyright (c) 2026 Nathanael Haig and Tracy Tran.

Documentation addresses (RFC 5737 / RFC 3849), the documentation MAC range (RFC 7042) and reserved names such as `example.com` and `.example` (RFC 2606) are used in all samples and tests.
