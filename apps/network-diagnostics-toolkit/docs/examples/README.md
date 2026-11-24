# Console transcripts

Real output from running the toolkit, captured with [`tools/New-ExampleTranscript.ps1`](../../tools/New-ExampleTranscript.ps1). They stand in for screenshots until real ones are added (see [../screenshots/README.md](../screenshots/README.md)).

| File | What it shows |
| --- | --- |
| [menu-session.txt](menu-session.txt) | A full menu session: IP configuration, adapters, ping, traceroute, DNS, TCP port check (one open and one closed port), quick check, ticket notes and a saved report |
| [input-validation.txt](input-validation.txt) | Input the toolkit refuses: CIDR and address ranges, wildcards, more than 10 targets, leading zeros, three-part addresses, multicast, out-of-range numbers, port ranges, more than 20 TCP checks, two traceroute targets, an unsupported record type, an unknown menu option |
| [cmdlet-usage.txt](cmdlet-usage.txt) | Using the module commands directly at a PowerShell prompt |

How they were made:

- The checks ran for real, against this computer only: `127.0.0.1`, `localhost`, and a TCP listener the script opened on a random loopback port (a second, just-closed port shows the Refused case).
- The menu ran in a separate Windows PowerShell 5.1 process with the answers piped in, so each typed answer appears after its prompt.
- Before saving, the script replaced the computer name, user name, folder paths, IP addresses, default gateways, DNS servers, MAC addresses and adapter descriptions with documentation values (`HELPDESK-PC01`, `192.0.2.x`, `2001:db8::x`, `00-00-5E-00-53-xx`, `Example Network Adapter N`), then checked that none of the original values were left. Loopback addresses were not changed.
- Because of that replacement, the local IP configuration lines show documentation addresses; the structure and status lines are exactly what the toolkit printed.
