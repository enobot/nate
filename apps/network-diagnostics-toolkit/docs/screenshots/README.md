# Screenshots to capture

This folder is for real screenshots of the toolkit running. None are included yet. Until they are added, the [console transcripts in docs/examples](../examples/) show real output.

Before taking screenshots, use a test or lab machine, or blur anything that identifies a real network: IP addresses, MAC addresses, computer names, DNS servers, user names and folder paths. Run checks only against devices you are allowed to test.

| File name | What to capture | How |
| --- | --- | --- |
| `01-menu.png` | The main menu right after start | `.\Start-NetworkToolkit.ps1` in a normal PowerShell window (colour on) |
| `02-ping-pass-fail.png` | A ping with a PASS and a FAIL line in colour | Option 1, targets `127.0.0.1` and an address you know does not answer on your lab network |
| `03-traceroute.png` | A traceroute hop table | Option 2 to a host a few hops away on a lab network |
| `04-ipconfig.png` | IP configuration with PASS/INFO lines | Option 3 |
| `05-dns.png` | A DNS PASS and an NXDOMAIN FAIL | Option 4 with a real name and a misspelled one |
| `06-adapters.png` | Adapter list with link speed and MAC | Option 5 |
| `07-tcp-port.png` | Open, Refused and TimedOut results | Option 6 against a lab host |
| `08-validation-error.png` | An `[ERROR]` line for a CIDR range or port range | Option 1 with `192.0.2.0/24`, or option 6 with `1-1024` |
| `09-ticket-notes.png` | The ticket notes block | Option 8 after a few checks |
| `10-report-files.png` | The saved CSV open in Excel and the text report in Notepad | Option 9, then open the files from `reports\` |
| `11-help.png` | `Get-Help Test-NdtPort -Examples` output | In PowerShell after `Import-Module .\src\NetworkDiagnostics\NetworkDiagnostics.psd1` |
| `12-tests.png` | The end of a passing test run | `.\tools\Invoke-Tests.ps1` |
| `13-ci.png` | Both Pester jobs and PSScriptAnalyzer green in GitHub Actions | The repository's Actions tab after the first push |

After adding the images, link the most useful ones (for example 01, 02, 09 and 10) near the top of the main README.
