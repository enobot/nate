# Sample reports (fictional data)

Everything in this folder is **fictional**. No real network, computer or person is described.

| File | What it is |
| --- | --- |
| `sample-report.txt` | Text report from `Export-NdtReport` |
| `sample-report.csv` | CSV report from `Export-NdtReport` (UTF-8 with BOM, opens in Excel) |
| `sample-ticket-note.txt` | Ticket notes from `New-NdtTicketNote` |

The files were produced by [`tools/New-SampleReport.ps1`](../tools/New-SampleReport.ps1), which builds result objects from made-up input using the module's own result builders (the same code the real checks use, including the tracert parser) and then saves them with the module's export functions. No network traffic is sent when generating them.

Only reserved values are used:

- IPv4 documentation ranges 192.0.2.0/24, 198.51.100.0/24 and 203.0.113.0/24 (RFC 5737)
- MAC documentation range 00-00-5E-00-53-00 to 00-00-5E-00-53-FF (RFC 7042)
- Reserved names `intranet.example`, `example.com` (RFC 2606); computer name `EXAMPLE-HELPDESK-01`; ticket number `INC0000000`

The "Generated" line in the text report is the time the sample was regenerated; the check timestamps are fixed fictional times.

## The scenario

A user on EXAMPLE-HELPDESK-01 cannot open `intranet.example`.

1. IP configuration and the wired adapter look normal (Wi-Fi is disconnected, which is expected on a wired desk).
2. The default gateway answers.
3. The DNS lookup for `intranet.example` times out.
4. The intranet server answers ping and accepts HTTPS (TCP 443) by IP address.
5. The configured DNS server does not answer ping or TCP 53, and a traceroute to it stops after the second router.

Conclusion for the ticket: the user's PC and the intranet server are fine; the DNS server (or the path to it) is down. See the [troubleshooting table](../README.md#troubleshooting-examples) in the main README.

To regenerate:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\New-SampleReport.ps1
```
