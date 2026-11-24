// What the policy explorer lets you pick (devices and kinds of traffic), and
// how a choice becomes a scenario for CampusNetwork.evaluatePolicy().
//
// Addresses come from the lab plan: static devices use their configured
// address, and DHCP devices use the first address their pool hands out
// (.21, because .1-.20 are excluded). Tests check every entry against the plan.

import { isIPv4 } from "./acl.js";
import { BROADCAST } from "./network.js";

export const CUSTOM = "custom";

/** Devices you can send traffic from or to. */
export const END_DEVICES = [
  { id: "faculty-pc", label: "Faculty PC", ip: "10.10.10.21", vlan: 10, dhcp: true, hosts: ["FAC-PC1", "FAC-PC2", "LIB-PC1"] },
  { id: "student-pc", label: "Student PC", ip: "10.10.20.21", vlan: 20, dhcp: true, hosts: ["STU-PC1", "STU-PC2", "STU-PC3", "STU-PC4"] },
  { id: "ip-phone", label: "IP phone", ip: "10.10.50.21", vlan: 50, dhcp: true, hosts: ["FAC-PHONE1", "LIB-PHONE1"] },
  { id: "printer", label: "Department printer", ip: "10.10.10.10", vlan: 10, dhcp: false, hosts: ["FAC-PRINTER"] },
  { id: "server", label: "Campus web and DNS server", ip: "10.10.30.10", vlan: 30, dhcp: false, hosts: ["SRV-WEB-DNS"] },
  { id: "it-admin", label: "IT admin PC", ip: "10.10.99.50", vlan: 99, dhcp: false, hosts: ["IT-ADMIN-PC"] },
];

/** Network devices: destinations only (R1's gateway addresses and the switches' management addresses). */
export const NETWORK_DEVICES = [
  { id: "r1-vlan10", label: "R1, VLAN 10 gateway", ip: "10.10.10.1", vlan: 10, device: "R1" },
  { id: "r1-vlan20", label: "R1, VLAN 20 gateway", ip: "10.10.20.1", vlan: 20, device: "R1" },
  { id: "r1-vlan30", label: "R1, VLAN 30 gateway", ip: "10.10.30.1", vlan: 30, device: "R1" },
  { id: "r1-vlan50", label: "R1, VLAN 50 gateway", ip: "10.10.50.1", vlan: 50, device: "R1" },
  { id: "r1-vlan99", label: "R1, VLAN 99 gateway", ip: "10.10.99.1", vlan: 99, device: "R1" },
  { id: "core-sw1", label: "CORE-SW1 (management)", ip: "10.10.99.2", vlan: 99, device: "CORE-SW1" },
  { id: "acc-sw1", label: "ACC-SW1 (management)", ip: "10.10.99.3", vlan: 99, device: "ACC-SW1" },
  { id: "acc-sw2", label: "ACC-SW2 (management)", ip: "10.10.99.4", vlan: 99, device: "ACC-SW2" },
];

export const ENDPOINTS = [...END_DEVICES, ...NETWORK_DEVICES];

/** Kinds of traffic. `dhcp` sends a DHCPDISCOVER broadcast from 0.0.0.0. */
export const SERVICES = [
  { id: "http", label: "Web page (HTTP, TCP 80)", proto: "tcp", dport: 80 },
  { id: "https", label: "Web page (HTTPS, TCP 443)", proto: "tcp", dport: 443 },
  { id: "dns", label: "DNS lookup (UDP 53)", proto: "udp", dport: 53 },
  { id: "ping", label: "Ping request (ICMP echo)", proto: "icmp", icmp: "echo" },
  { id: "ping-reply", label: "Ping reply (ICMP echo-reply)", proto: "icmp", icmp: "echo-reply" },
  { id: "ssh", label: "SSH (TCP 22)", proto: "tcp", dport: 22 },
  { id: "ftp", label: "FTP (TCP 21)", proto: "tcp", dport: 21 },
  { id: "printing", label: "Printing (TCP 9100)", proto: "tcp", dport: 9100 },
  { id: "web-reply", label: "Web server reply (from TCP 80)", proto: "tcp", sport: 80, dport: 49152 },
  { id: "dhcp", label: "DHCP request (broadcast)", proto: "udp", sport: 68, dport: 67, dhcp: true },
  { id: "custom-tcp", label: "Other TCP port", proto: "tcp", custom: true },
  { id: "custom-udp", label: "Other UDP port", proto: "udp", custom: true },
];

export const endpointById = (id) => ENDPOINTS.find((endpoint) => endpoint.id === id) ?? null;
export const serviceById = (id) => SERVICES.find((service) => service.id === id) ?? null;

const same = (a, b) => (a ?? null) === (b ?? null);

/** The traffic choice that produces this test case's packet. */
export function serviceForCase(test) {
  const fixed = SERVICES.find(
    (service) =>
      !service.custom &&
      service.proto === test.proto &&
      same(service.sport, test.sport) &&
      same(service.dport, test.dport) &&
      same(service.icmp, test.icmp),
  );
  if (fixed) return { serviceId: fixed.id, customPort: "" };
  if ((test.proto === "tcp" || test.proto === "udp") && test.sport == null && test.dport != null) {
    return { serviceId: `custom-${test.proto}`, customPort: String(test.dport) };
  }
  throw new Error(`No traffic choice matches test ${test.id ?? ""}`);
}

function endpointChoice(ip, pool) {
  const endpoint = pool.find((item) => item.ip === ip);
  return endpoint ? { id: endpoint.id, custom: "" } : { id: CUSTOM, custom: ip };
}

/** The form values that reproduce one of the lab's policy test cases. */
export function formForCase(test) {
  const { serviceId, customPort } = serviceForCase(test);
  const dhcp = serviceById(serviceId).dhcp;
  const source = dhcp
    ? { id: END_DEVICES.find((item) => item.dhcp && item.vlan === test.from_vlan)?.id ?? CUSTOM, custom: "" }
    : endpointChoice(test.src, END_DEVICES);
  const destination = dhcp ? { id: "r1-vlan10", custom: "" } : endpointChoice(test.dst, ENDPOINTS);
  return {
    sourceId: source.id,
    sourceCustom: source.custom,
    destinationId: destination.id,
    destinationCustom: destination.custom,
    serviceId,
    customPort,
  };
}

function resolveAddress(id, custom, label) {
  if (id !== CUSTOM) {
    const endpoint = endpointById(id);
    if (!endpoint) return { error: `Choose a ${label}.` };
    return { endpoint, ip: endpoint.ip };
  }
  const ip = custom.trim();
  if (!isIPv4(ip)) return { error: "Enter an IPv4 address, for example 10.10.20.30." };
  if (ip === "0.0.0.0" || ip === BROADCAST) {
    return { error: `${ip} is only used for DHCP here. Choose "DHCP request" as the traffic instead.` };
  }
  return { endpoint: null, ip };
}

/**
 * Turn form values into a scenario.
 * Returns { ok: true, test } for evaluatePolicy(), { ok: false, errors } for
 * invalid input, or { ok: false, notApplicable } when the choice makes no sense.
 */
export function buildScenario(form, network) {
  const service = serviceById(form.serviceId);
  const errors = {};
  if (!service) errors.service = "Choose the kind of traffic.";
  const source = resolveAddress(form.sourceId, form.sourceCustom, "source");
  if (source.error) errors.source = source.error;
  if (source.endpoint && !END_DEVICES.includes(source.endpoint)) errors.source = "Choose a device to send from.";

  let port = null;
  if (service?.custom) {
    const text = form.customPort.trim();
    port = /^\d{1,5}$/.test(text) ? Number(text) : NaN;
    if (!(port >= 1 && port <= 65535)) errors.port = "Enter a port number from 1 to 65535.";
  }

  if (service?.dhcp) {
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    if (!source.endpoint?.dhcp) {
      return {
        ok: false,
        notApplicable:
          "Only DHCP clients send DHCP requests. In this lab that's the faculty PCs, student PCs, and IP phones; the other devices use static addresses.",
      };
    }
    return {
      ok: true,
      test: { proto: "udp", src: "0.0.0.0", dst: BROADCAST, sport: 68, dport: 67, from_vlan: source.endpoint.vlan },
    };
  }

  const destination = resolveAddress(form.destinationId, form.destinationCustom, "destination");
  if (destination.error) errors.destination = destination.error;
  if (!errors.source && !errors.destination && source.ip === destination.ip) {
    errors.destination = "Choose a destination that's different from the source.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const test = {
    proto: service.proto,
    src: source.ip,
    dst: destination.ip,
    ...(service.sport != null ? { sport: service.sport } : {}),
    ...(service.custom ? { dport: port } : service.dport != null ? { dport: service.dport } : {}),
    ...(service.icmp ? { icmp: service.icmp } : {}),
  };
  // SSH to a router or switch is also checked against that device's VTY lines.
  if (test.proto === "tcp" && test.dport === 22 && network.deviceForAddress(test.dst) !== null) {
    test.layer = "management";
  }
  return { ok: true, test };
}

/** "TCP 10.10.20.21 -> 10.10.30.10, port 21" */
export function describePacket(test) {
  const proto = test.proto.toUpperCase();
  const route = `${test.src} → ${test.dst}`;
  if (test.proto === "icmp") return `${proto} ${test.icmp ?? "any type"}, ${route}`;
  const ports = [test.sport != null ? `from port ${test.sport}` : null, test.dport != null ? `to port ${test.dport}` : null];
  return [`${proto} ${route}`, ports.filter(Boolean).join(" ")].filter(Boolean).join(", ");
}
