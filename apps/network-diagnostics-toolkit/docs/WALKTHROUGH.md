# Walkthrough

This document follows one check from the keyboard to the saved report, explains the main design decisions, and ends with interview questions about the toolkit and the networking behind it.

## 1. What happens when you run a check

Take option 6 in the menu (TCP port check) with the answers `192.0.2.20` and `443`.

1. **Start-NetworkToolkit.ps1** imports `src\NetworkDiagnostics\NetworkDiagnostics.psd1` and calls `Start-NdtMenu`. The root module (`NetworkDiagnostics.psm1`) dot-sources every file in `Private\` and `Public\`, sets the safety limits, and exports only the 11 public commands.
2. **Start-NdtMenu** shows the menu and reads the choice through `Read-NdtInput` (a thin wrapper around `Read-Host`). Choice `6` calls the private handler `Invoke-NdtMenuPort`.
3. **Validation (Private\Validation.ps1).** The handler splits the typed text into entries, then:
   - `Get-NdtValidatedTargetList` checks each target with `Get-NdtValidatedTarget` (rejects CIDR, ranges, wildcards, broadcast, multicast, malformed addresses and names) and enforces the 10-target limit.
   - `ConvertFrom-NdtPortInput` rejects port ranges and non-numbers, and `Get-NdtValidatedPortList` enforces 1-65535 and the 20-port limit.
   - `Get-NdtValidatedTcpCheckCount` enforces 20 checks per run (hosts x ports).
   If anything fails, an `ArgumentException` with a plain message is thrown, the menu prints `[ERROR] ...`, and nothing is sent.
4. **Test-NdtPort (Public)** validates again (it can also be called directly), then for each host calls `Resolve-NdtAddress` (IP literal, or Windows resolver preferring IPv4) and for each port calls `Invoke-NdtTcpConnect`.
5. **Invoke-NdtTcpConnect (Private\NetworkWrappers.ps1)** creates a `TcpClient`, calls `BeginConnect`, waits up to the timeout with `AsyncWaitHandle.WaitOne`, and closes the socket. It returns a small object: `State` = Open, Refused, TimedOut, Unreachable or Error, plus the elapsed time.
6. **ConvertTo-NdtPortResult (Private\PingAndPort.ps1)** turns that into the shared result object through `New-NdtResult`: `Status` (PASS for Open, FAIL otherwise), a summary that explains what the state usually means, and detail lines.
7. **Back in the menu**, the results are printed by `Show-NdtResult` (marker line plus indented details, colour via `Write-NdtHostLine`) and added to the session list.
8. **Option 8** passes the session list to `New-NdtTicketNote`, which builds a plain ASCII block. **Option 9** passes it to `Export-NdtReport`, which writes the CSV and text report with `FileMode.CreateNew` so nothing is overwritten.

Every other check follows the same pattern: validate, collect with a wrapper or Windows cmdlet, interpret in a builder function, return result objects.

## 2. Key design decisions

**Read-only and explicit targets only.** The toolkit is meant to be safe to hand to a new technician. It never changes settings, never discovers targets on its own (not even the default gateway), and rejects anything that looks like a range. A Pester test parses the module source and fails if any command that changes network or system settings appears.

**Small wrappers around the network calls.** `Invoke-NdtPing`, `Invoke-NdtTcpConnect`, `Invoke-NdtTracert` and `Resolve-NdtAddress` are the only code that sends traffic. Unit tests mock them (and the Windows cmdlets `Get-NetIPConfiguration`, `Get-NetAdapter`, `Resolve-DnsName`) to produce exact cases such as "three replies then a timeout". The decision logic that the tests check is the real code.

**Builders separate from collectors.** Functions like `ConvertTo-NdtPingResult` and `ConvertFrom-NdtTracertOutput` take plain data and return results. That is why they can be tested directly, and why `tools\New-SampleReport.ps1` can produce realistic fictional reports by running the same builders on made-up data.

**One result shape.** Every result has the same seven core properties, so a mixed set of checks becomes one CSV file and one ticket note.

**.NET classes for ping and TCP, tracert.exe for traceroute.** See the README's technology table: consistent behaviour across 5.1 and 7, explicit timeouts, and faster failures than `Test-NetConnection`.

**Plain-language summaries.** A junior technician should not need to know what `ConnectionRefused` means. Each status comes with the usual cause, for example "the host answered, but nothing is listening on that port".

**Markers before colour.** `[PASS]`/`[FAIL]` text works in transcripts, redirected output, ticket notes, for colour-blind users and with screen readers. Colour is extra.

**Strict, testable input rules.** Validation happens at the public command boundary (not only in the menu), so scripts that call the commands get the same protection.

## 3. Interview questions

**1. What is the difference between an ICMP ping and a TCP port check?**
Ping sends an ICMP echo request and waits for an echo reply; it shows whether the host's IP stack answers ICMP. A TCP check tries the three-way handshake (SYN, SYN-ACK, ACK) on a specific port; it shows whether a service is listening and whether the path allows that port. Many firewalls block ICMP, so a host can fail ping and still pass a TCP check.

**2. A TCP check can be "Refused" or "TimedOut". What is the difference?**
Refused means the host (or a firewall) answered with a reset: the host is reachable but nothing is listening, or the connection was actively rejected. TimedOut means no answer at all within the timeout, which usually means a firewall is silently dropping the packets or the host is offline.

**3. Why is the default TCP timeout 3000 ms?**
On Windows a refused connection took about 2 seconds to be reported on the development PC, because Windows retries the connection attempt. With a 1-second timeout a closed port would be reported as TimedOut, which points the technician at the wrong cause.

**4. What does traceroute show, and how does it work?**
It shows the routers (hops) between this PC and the destination and the round-trip time to each. It sends probes with an increasing TTL (time to live): 1, then 2, and so on. Each router that decrements the TTL to zero sends back an ICMP "time exceeded" message, which reveals its address. A `*` means no reply for that probe.

**5. A traceroute has `*` at hop 4 but reaches the destination at hop 7. Is hop 4 broken?**
No. Many routers do not answer traceroute probes or rate-limit them. If later hops and the destination answer, traffic is passing through hop 4. It only matters when every hop after a certain point is `*` and the destination is never reached.

**6. Why does the toolkit use `tracert -d`?**
`-d` skips the reverse DNS lookup for every hop. That makes the trace faster, avoids extra DNS traffic, and keeps the output to addresses, which are easier to parse reliably.

**7. What DNS record types does it support, and what are they for?**
A (IPv4 address), AAAA (IPv6 address), CNAME (alias to another name), MX (mail servers), NS (name servers for a zone), PTR (reverse lookup, address to name), SOA (zone information), SRV (service location, such as `_ldap._tcp` for domain controllers) and TXT (text, for example SPF records).

**8. What is the difference between NXDOMAIN, "no records" and a DNS timeout?**
NXDOMAIN means the DNS server says the name does not exist. "No records" means the name exists but has no record of the requested type. A timeout means the server did not answer at all, which points to the DNS server or the path to it rather than the record.

**9. Ping to the server's IP works but its name fails. What does that tell you?**
The network path and the server are fine; the problem is name resolution. Check which DNS servers the PC uses (`Get-NdtIPConfig`), whether they answer (ping or TCP 53), and whether another DNS server resolves the name (`Resolve-NdtDnsName -Server`).

**10. What does a 169.254.x.x address mean?**
That is APIPA (automatic private IP addressing). Windows assigns it itself when it is set to use DHCP and no DHCP server answers. Common causes are no link, the switch port not being active or in the wrong VLAN, or a DHCP problem.

**11. Why is the toolkit read-only and limited to a few explicit targets?**
So it is safe for any technician to run on any network. It cannot change a user's settings by mistake, and it cannot be used as a scanner: there are no subnet sweeps, no port ranges, and small per-run limits. Scanning networks without permission can break policy and set off security alerts.

**12. How do the unit tests work without a real network?**
Pester's `Mock` replaces the small wrapper functions and the Windows networking cmdlets with fixed results, for example a list of ping replies with one timeout. The real decision code then runs on that data and the tests check the status and messages. Integration tests run the real checks against 127.0.0.1, localhost and a TCP listener the test opens itself.

**13. Why does the IP address validation not just use `[IPAddress]::TryParse`?**
TryParse accepts forms nobody means to type: `1` becomes `0.0.0.1`, `192.168.1` becomes `192.168.0.1`, and `010.1.1.1` becomes `8.1.1.1` because of octal. The toolkit first requires four decimal numbers from 0 to 255 without leading zeros, then uses TryParse.

**14. What problems are specific to Windows PowerShell 5.1 versus PowerShell 7?**
`Test-Connection` returns different objects, default file encodings differ, native command error output is handled differently, and 5.1 reads BOM-less scripts as the ANSI code page. The toolkit uses .NET classes for ping and TCP, writes files with an explicit encoding, keeps source files ASCII, and CI runs the tests on both versions.

**15. What is CSV injection and why does a network tool care?**
Spreadsheet programs run cells that start with `=`, `+`, `-` or `@` as formulas. DNS TXT records and other outside text end up in the CSV, so a malicious record could become a formula when someone opens the report in Excel. The toolkit prefixes those cells with `'` so they display as text.
