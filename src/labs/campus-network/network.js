// A model of the lab network built from lab-plan.json and the device configs.
//
// A JavaScript port of labcheck/network.py from the campus-network-lab
// repository. It answers one question: would R1 (and, for SSH to a network
// device, that device's VTY access list) let a given packet through? It reads
// the router's real subinterface addresses and ACLs from R1's config.
//
// It models layer 3 policy only. It cannot tell whether the configs work in
// Packet Tracer.
//
// `reasons` uses the same wording as the Python version so the two can be
// compared line by line. `steps` carries the same decisions as data for the
// explorer's interface.

import { evaluate, ipToInt, parseAcl } from "./acl.js";

export const BROADCAST = "255.255.255.255";

/** Is this numbered ACL a standard one (1-99, 1300-1999)? */
function isStandardNumber(name) {
  const number = Number(name);
  return number < 100 || (number >= 1300 && number <= 1999);
}

/**
 * An ACL as written in a config: its kind, the lines as they appear in the
 * file, and the parsed entries (each with `line`, its index in `lines`).
 */
export function aclDefinition(config, name) {
  if (config.namedAcls.has(name)) {
    const { kind, lines } = config.namedAcls.get(name);
    return { name, kind, numbered: false, lines, entries: parseAcl(lines, kind) };
  }
  if (config.numberedAcls.has(name)) {
    const kind = isStandardNumber(name) ? "standard" : "extended";
    const lines = config.numberedAcls.get(name);
    return { name, kind, numbered: true, lines, entries: parseAcl(lines, kind) };
  }
  throw new Error(`ACL "${name}" is not defined`);
}

export function aclEntries(config, name) {
  return aclDefinition(config, name).entries;
}

function parseMask(mask) {
  const value = ipToInt(mask);
  const inverted = ~value >>> 0;
  if ((inverted & (inverted + 1)) !== 0) throw new Error(`"${mask}" is not a valid subnet mask`);
  return value;
}

/** The router's VLAN subinterfaces: VLAN, address, and any ACLs applied. */
export function routerSubinterfaces(router) {
  const result = [];
  for (const [name, lines] of router.interfaces) {
    if (!name.includes(".")) continue;
    let vlan = null;
    let native = false;
    let address = null;
    let aclIn = null;
    let aclOut = null;
    let description = null;
    for (const line of lines) {
      const words = line.split(" ");
      if (words[0] === "encapsulation" && words[1] === "dot1Q") {
        vlan = Number(words[2]);
        native = words.slice(3).includes("native");
      } else if (words[0] === "ip" && words[1] === "address") {
        const mask = parseMask(words[3]);
        address = { ip: words[2], mask, network: (ipToInt(words[2]) & mask) >>> 0 };
      } else if (words[0] === "ip" && words[1] === "access-group") {
        if (words[3] === "in") aclIn = words[2];
        else aclOut = words[2];
      } else if (words[0] === "description") {
        description = words.slice(1).join(" ");
      }
    }
    if (vlan === null) throw new Error(`${name} has no 'encapsulation dot1Q' line`);
    result.push({ name, vlan, native, address, aclIn, aclOut, description });
  }
  return result;
}

function inSubnet(sub, ip) {
  return ((ipToInt(ip) & sub.address.mask) >>> 0) === sub.address.network;
}

export class CampusNetwork {
  constructor(plan, devices) {
    this.plan = plan;
    this.devices = devices;
    this.router = devices.R1;
    if (!this.router) throw new Error("The lab plan has no R1 configuration");
    this.subinterfaces = routerSubinterfaces(this.router).filter((sub) => sub.address);
    this.routerIps = new Set(this.subinterfaces.map((sub) => sub.address.ip));
  }

  subinterfaceFor(ip) {
    return this.subinterfaces.find((sub) => inSubnet(sub, ip)) ?? null;
  }

  subinterfaceForVlan(vlan) {
    return this.subinterfaces.find((sub) => sub.vlan === vlan) ?? null;
  }

  check(aclName, packet, sub, direction, decision) {
    const where = `${direction} on ${sub.name}`;
    if (aclName === null) {
      decision.reasons.push(`${where}: no ACL`);
      decision.steps.push({ type: "no-acl", direction, interface: sub.name, vlan: sub.vlan });
      return true;
    }
    const acl = aclDefinition(this.router, aclName);
    const { action, entry } = evaluate(acl.entries, packet);
    const matched = entry ? entry.text : "implicit deny any";
    decision.reasons.push(`${where}: ${aclName} -> ${action} (${matched})`);
    decision.matched.push([aclName, matched]);
    decision.steps.push({
      type: "acl",
      device: "R1",
      direction,
      interface: sub.name,
      vlan: sub.vlan,
      acl,
      action,
      matchedLine: entry ? entry.line : null,
    });
    return action === "permit";
  }

  /** Would the packet reach its destination at layer 3? */
  forward(packet, fromVlan = null) {
    const decision = { action: "deny", reasons: [], matched: [], steps: [] };
    const ingress = fromVlan ? this.subinterfaceForVlan(fromVlan) : this.subinterfaceFor(packet.src);
    if (ingress === null) {
      decision.reasons.push("source is in no routed VLAN");
      decision.steps.push({ type: "no-source-vlan" });
      return decision;
    }

    const isBroadcast = packet.dst === BROADCAST;
    const toRouter = this.routerIps.has(packet.dst);
    const destinationSub = isBroadcast ? ingress : this.subinterfaceFor(packet.dst);
    if (destinationSub === ingress && !toRouter && !isBroadcast) {
      decision.action = "permit";
      decision.reasons.push(`same VLAN ${ingress.vlan}: switched, never reaches R1`);
      decision.steps.push({ type: "switched", vlan: ingress.vlan });
      return decision;
    }

    decision.steps.push({ type: "ingress", interface: ingress.name, vlan: ingress.vlan });
    if (!this.check(ingress.aclIn, packet, ingress, "in", decision)) return decision;

    if (toRouter || isBroadcast) {
      decision.action = "permit";
      decision.reasons.push("delivered to R1 itself");
      decision.steps.push({ type: "to-router", broadcast: isBroadcast });
      return decision;
    }

    if (destinationSub === null) {
      decision.reasons.push("no route to destination");
      decision.steps.push({ type: "no-route" });
      return decision;
    }
    decision.steps.push({ type: "egress", interface: destinationSub.name, vlan: destinationSub.vlan });
    if (this.check(destinationSub.aclOut, packet, destinationSub, "out", decision)) {
      decision.action = "permit";
      decision.steps.push({ type: "delivered", vlan: destinationSub.vlan });
    }
    return decision;
  }

  /** "R1", a switch name, or null when the address isn't a network device. */
  deviceForAddress(ip) {
    if (this.routerIps.has(ip)) return "R1";
    const device = this.plan.devices.find((item) => item.management_ip === ip);
    return device ? device.name : null;
  }

  /** Would the device's VTY lines accept an SSH session from sourceIp? */
  sshAllowed(deviceName, sourceIp) {
    const decision = { action: "deny", reasons: [], matched: [], steps: [] };
    const config = this.devices[deviceName];
    const vtyKey = [...config.lines.keys()].find((key) => key.startsWith("vty"));
    if (vtyKey === undefined) {
      decision.reasons.push(`${deviceName}: no VTY lines configured`);
      decision.steps.push({ type: "vty", device: deviceName, problem: "no-vty" });
      return decision;
    }
    const vty = config.lines.get(vtyKey);
    if (!vty.includes("transport input ssh")) {
      decision.reasons.push(`${deviceName}: VTY does not accept SSH`);
      decision.steps.push({ type: "vty", device: deviceName, lines: vtyKey, problem: "no-ssh" });
      return decision;
    }
    const accessClassLine = vty.find((line) => line.startsWith("access-class "));
    if (accessClassLine === undefined) {
      decision.action = "permit";
      decision.reasons.push(`${deviceName}: VTY has no access-class`);
      decision.steps.push({ type: "vty", device: deviceName, lines: vtyKey, action: "permit", acl: null });
      return decision;
    }
    const accessClass = accessClassLine.split(" ")[1];
    const acl = aclDefinition(config, accessClass);
    const packet = { proto: "tcp", src: sourceIp, dst: "0.0.0.0", sport: null, dport: 22, icmp: null };
    const { action, entry } = evaluate(acl.entries, packet);
    const matched = entry ? entry.text : "implicit deny any";
    decision.reasons.push(`${deviceName}: VTY access-class ${accessClass} -> ${action} (${matched})`);
    decision.steps.push({
      type: "vty",
      device: deviceName,
      lines: vtyKey,
      acl,
      action,
      matchedLine: entry ? entry.line : null,
    });
    decision.action = action;
    return decision;
  }

  /**
   * Evaluate a scenario: { proto, src, dst, sport?, dport?, icmp?, from_vlan?, layer? }.
   * The lab's policy test cases use exactly this shape.
   */
  evaluatePolicy(test) {
    const packet = {
      proto: test.proto,
      src: test.src,
      dst: test.dst,
      sport: test.sport ?? null,
      dport: test.dport ?? null,
      icmp: test.icmp ?? null,
    };
    const decision = this.forward(packet, test.from_vlan ?? null);
    if (decision.action !== "permit" || test.layer !== "management") return decision;
    const target = this.deviceForAddress(packet.dst);
    if (target === null) {
      decision.action = "deny";
      decision.reasons.push("destination is not a network device");
      decision.steps.push({ type: "not-a-device" });
      return decision;
    }
    const management = this.sshAllowed(target, packet.src);
    decision.action = management.action;
    decision.reasons.push(...management.reasons);
    decision.steps.push(...management.steps);
    return decision;
  }
}
