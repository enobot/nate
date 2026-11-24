// Evaluate Cisco IOS access lists the way a router does.
//
// A JavaScript port of labcheck/acl.py from the campus-network-lab
// repository. Entries are checked top to bottom and the first match decides.
// If nothing matches, the packet is denied (the implicit "deny any" at the
// end). Supports the forms the lab uses: standard ACLs, and extended ACLs for
// ip/tcp/udp/icmp with any / host / address + wildcard, "eq <port>", and ICMP
// type keywords.

export const ICMP_TYPES = { "echo-reply": 0, unreachable: 3, echo: 8, "time-exceeded": 11 };
export const PORT_NAMES = { www: 80, domain: 53, bootps: 67, bootpc: 68, ftp: 21, telnet: 23 };

const OCTET = /^(0|[1-9]\d{0,2})$/;

/** "10.10.20.21" -> 168432661. Rejects anything that isn't four 0-255 octets without leading zeros. */
export function ipToInt(ip) {
  const parts = typeof ip === "string" ? ip.split(".") : [];
  if (parts.length !== 4 || !parts.every((part) => OCTET.test(part) && Number(part) <= 255)) {
    throw new Error(`"${ip}" is not an IPv4 address`);
  }
  return parts.reduce((value, part) => value * 256 + Number(part), 0);
}

export function isIPv4(word) {
  try {
    ipToInt(word);
    return true;
  } catch {
    return false;
  }
}

/** Does `ip` match an address + wildcard pair? Wildcard 1-bits are "don't care". */
export function addressMatches(match, ip) {
  const care = ~match.wildcard >>> 0;
  return ((ipToInt(ip) & care) >>> 0) === ((match.address & care) >>> 0);
}

export const ANY = Object.freeze({ address: 0, wildcard: 0xffffffff });

function takeAddress(tokens, text) {
  const word = tokens.shift();
  if (word === undefined) throw new Error(`Missing address in ACL entry "${text}"`);
  if (word === "any") return ANY;
  if (word === "host") return { address: ipToInt(tokens.shift()), wildcard: 0 };
  const address = ipToInt(word);
  if (tokens.length > 0 && isIPv4(tokens[0])) return { address, wildcard: ipToInt(tokens.shift()) };
  return { address, wildcard: 0 };
}

function takePort(tokens, text) {
  if (tokens[0] === "eq") {
    tokens.shift();
    const word = tokens.shift();
    if (word !== undefined && /^\d+$/.test(word)) return Number(word);
    if (word !== undefined && Object.hasOwn(PORT_NAMES, word)) return PORT_NAMES[word];
    throw new Error(`Unknown port "${word}" in ACL entry "${text}"`);
  }
  if (["gt", "lt", "neq", "range"].includes(tokens[0])) {
    throw new Error(`Port operator "${tokens[0]}" is not supported by this checker`);
  }
  return null;
}

/**
 * Parse one ACL line ("permit tcp any host 1.2.3.4 eq 80").
 * Returns null for remarks.
 */
export function parseEntry(text, kind) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens[0] === "remark") return null;
  const action = tokens.shift();
  if (action !== "permit" && action !== "deny") throw new Error(`Unexpected ACL action in "${text}"`);

  if (kind === "standard") {
    return { action, proto: "ip", src: takeAddress(tokens, text), dst: ANY, sport: null, dport: null, icmp: null, text };
  }

  const proto = tokens.shift();
  if (!["ip", "tcp", "udp", "icmp"].includes(proto)) throw new Error(`Unsupported protocol "${proto}" in "${text}"`);
  const hasPorts = proto === "tcp" || proto === "udp";
  const src = takeAddress(tokens, text);
  const sport = hasPorts ? takePort(tokens, text) : null;
  const dst = takeAddress(tokens, text);
  const dport = hasPorts ? takePort(tokens, text) : null;
  let icmp = null;
  if (proto === "icmp" && tokens.length > 0 && Object.hasOwn(ICMP_TYPES, tokens[0])) icmp = tokens.shift();
  if (tokens.length > 0) throw new Error(`Unparsed words [${tokens.join(", ")}] in ACL entry "${text}"`);
  return { action, proto, src, dst, sport, dport, icmp, text };
}

/**
 * Parse an ACL's lines. Each entry keeps `line`: its position in `lines`
 * (remarks included), so the explorer can highlight it in the original list.
 */
export function parseAcl(lines, kind) {
  const entries = [];
  lines.forEach((text, line) => {
    const entry = parseEntry(text, kind);
    if (entry) entries.push({ ...entry, line });
  });
  return entries;
}

/** Does one ACL entry match the packet? */
export function entryMatches(entry, packet) {
  if (entry.proto !== "ip" && entry.proto !== packet.proto) return false;
  if (!addressMatches(entry.src, packet.src) || !addressMatches(entry.dst, packet.dst)) return false;
  if (entry.sport !== null && (packet.sport ?? null) !== entry.sport) return false;
  if (entry.dport !== null && (packet.dport ?? null) !== entry.dport) return false;
  if (entry.icmp !== null && (packet.icmp ?? null) !== entry.icmp) return false;
  return true;
}

/**
 * First match wins. Returns { action, entry }, where entry is null when no
 * line matched and the implicit "deny any" decided.
 */
export function evaluate(entries, packet) {
  for (const entry of entries) {
    if (entryMatches(entry, packet)) return { action: entry.action, entry };
  }
  return { action: "deny", entry: null };
}
