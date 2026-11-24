// A small parser for the Cisco IOS configuration files in data/configs/.
//
// A JavaScript port of labcheck/iosconfig.py from the campus-network-lab
// repository. It understands only the commands the lab uses: interfaces
// (including "interface range"), VLANs, DHCP pools and exclusions, access
// lists, and console/VTY lines. It is a checking aid, not a full IOS parser.

// Lines that are typed at the exec prompt, not configuration.
const EXEC_COMMANDS = new Set(["enable", "configure terminal", "conf t", "end", "write memory", "exit"]);

const INTERFACE_PREFIXES = {
  gi: "GigabitEthernet",
  gigabitethernet: "GigabitEthernet",
  fa: "FastEthernet",
  fastethernet: "FastEthernet",
  vlan: "Vlan",
};

/** "gi0/1" or "GigabitEthernet0/1" -> "GigabitEthernet0/1". */
export function normalizeInterface(name) {
  const match = /^([A-Za-z]+)\s*([\d/.]+)$/.exec(name.trim());
  if (!match) throw new Error(`Unrecognised interface name: "${name}"`);
  const [, prefix, number] = match;
  const full = INTERFACE_PREFIXES[prefix.toLowerCase()];
  if (!full) throw new Error(`Unrecognised interface type: "${prefix}"`);
  return `${full}${number}`;
}

/** "FastEthernet0/3 - 9, GigabitEthernet0/2" -> each interface name. */
export function expandInterfaceRange(spec) {
  const names = [];
  for (const raw of spec.split(",")) {
    const part = raw.trim();
    const match = /^([A-Za-z]+\s*[\d/]*?\/)(\d+)\s*(?:-\s*(\d+))?$/.exec(part);
    if (!match) throw new Error(`Unrecognised interface range: "${part}"`);
    const [, prefix, start, end] = match;
    const first = Number(start);
    const last = end ? Number(end) : first;
    if (last < first) throw new Error(`Backwards interface range: "${part}"`);
    for (let port = first; port <= last; port += 1) names.push(normalizeInterface(`${prefix}${port}`));
  }
  return names;
}

function getOrCreate(map, key, create) {
  if (!map.has(key)) map.set(key, create());
  return map.get(key);
}

/**
 * Parse one device's configuration text.
 * Maps keep the order the file uses, like the Python dicts they replace.
 */
export function parseConfig(text) {
  const config = {
    hostname: null,
    globalLines: [],
    vlans: new Map(), // id -> name (or null)
    interfaces: new Map(), // full name -> sub-command lines
    dhcpPools: new Map(), // pool name -> sub-command lines
    dhcpExcluded: [], // [first, last]
    namedAcls: new Map(), // name -> { kind, lines }
    numberedAcls: new Map(), // number (string) -> lines after "access-list <n>"
    lines: new Map(), // "con 0", "vty 0 4" -> sub-command lines
  };
  // Sub-command lists that indented lines are added to (several for
  // "interface range", which applies each line to every port in it).
  let currentTargets = [];
  const vlanBlocks = new Map();

  for (const raw of text.split(/\r\n|\r|\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith("!")) continue;
    const indented = raw[0] === " " || raw[0] === "\t";
    const line = raw.trim().split(/\s+/).join(" ");

    if (indented) {
      if (currentTargets.length === 0) throw new Error(`Indented command outside any block: "${raw}"`);
      for (const target of currentTargets) target.push(line);
      continue;
    }

    currentTargets = [];
    if (EXEC_COMMANDS.has(line)) continue;

    if (line.startsWith("interface range ")) {
      for (const name of expandInterfaceRange(line.slice("interface range ".length))) {
        currentTargets.push(getOrCreate(config.interfaces, name, () => []));
      }
    } else if (line.startsWith("interface ")) {
      const name = normalizeInterface(line.slice("interface ".length));
      currentTargets = [getOrCreate(config.interfaces, name, () => [])];
    } else if (/^vlan \d+$/.test(line)) {
      const vlanId = Number(line.split(" ")[1]);
      if (!config.vlans.has(vlanId)) config.vlans.set(vlanId, null);
      currentTargets = [getOrCreate(vlanBlocks, vlanId, () => [])];
    } else if (line.startsWith("ip dhcp pool ")) {
      currentTargets = [getOrCreate(config.dhcpPools, line.slice("ip dhcp pool ".length), () => [])];
    } else if (line.startsWith("ip dhcp excluded-address ")) {
      const parts = line.split(" ").slice(3);
      config.dhcpExcluded.push([parts[0], parts[1] ?? parts[0]]);
    } else if (line.startsWith("ip access-list ")) {
      const parts = line.split(" ");
      if (parts.length < 4) throw new Error(`Incomplete access list header: "${line}"`);
      const entries = [];
      config.namedAcls.set(parts.slice(3).join(" "), { kind: parts[2], lines: entries });
      currentTargets = [entries];
    } else if (line.startsWith("access-list ")) {
      const parts = line.split(" ");
      if (parts.length < 3) throw new Error(`Incomplete access list line: "${line}"`);
      getOrCreate(config.numberedAcls, parts[1], () => []).push(parts.slice(2).join(" "));
    } else if (line.startsWith("line ")) {
      currentTargets = [getOrCreate(config.lines, line.slice("line ".length), () => [])];
    } else {
      if (line.startsWith("hostname ")) config.hostname = line.split(" ").slice(1).join(" ");
      config.globalLines.push(line);
    }
  }

  for (const [vlanId, block] of vlanBlocks) {
    for (const sub of block) {
      if (sub.startsWith("name ")) config.vlans.set(vlanId, sub.slice("name ".length));
    }
  }
  return config;
}
