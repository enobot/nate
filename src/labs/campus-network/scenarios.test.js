import { describe, expect, it } from "vitest";
import { ipToInt } from "./acl.js";
import { getNetwork, plan } from "./labData.js";
import { routerSubinterfaces } from "./network.js";
import {
  CUSTOM,
  END_DEVICES,
  ENDPOINTS,
  NETWORK_DEVICES,
  SERVICES,
  buildScenario,
  describePacket,
  formForCase,
} from "./scenarios.js";

const network = getNetwork();
const vlanOf = (id) => plan.vlans.find((vlan) => vlan.id === id);
const inSubnet = (ip, subnet) => {
  const [base, bits] = subnet.split("/");
  const mask = bits === "0" ? 0 : (0xffffffff << (32 - Number(bits))) >>> 0;
  return ((ipToInt(ip) & mask) >>> 0) === ((ipToInt(base) & mask) >>> 0);
};

describe("the devices offered in the explorer", () => {
  it("have unique ids and addresses", () => {
    expect(new Set(ENDPOINTS.map((item) => item.id)).size).toBe(ENDPOINTS.length);
    expect(new Set(ENDPOINTS.map((item) => item.ip)).size).toBe(ENDPOINTS.length);
  });

  it("use the static addresses and VLANs from the lab plan", () => {
    for (const endpoint of END_DEVICES) {
      for (const name of endpoint.hosts) {
        const host = plan.hosts.find((item) => item.name === name);
        expect(host, name).toBeDefined();
        expect(host.vlan, name).toBe(endpoint.vlan);
        expect(host.addressing, name).toBe(endpoint.dhcp ? "dhcp" : "static");
        if (!endpoint.dhcp) expect(host.ip, name).toBe(endpoint.ip);
      }
    }
  });

  it("give DHCP devices the first address their pool hands out", () => {
    for (const endpoint of END_DEVICES.filter((item) => item.dhcp)) {
      const vlan = vlanOf(endpoint.vlan);
      expect(vlan.dhcp, endpoint.id).toBe(true);
      expect(inSubnet(endpoint.ip, vlan.subnet), endpoint.id).toBe(true);
      expect(ipToInt(endpoint.ip), endpoint.id).toBe(ipToInt(vlan.dhcp_excluded[1]) + 1);
    }
  });

  it("use R1's real gateway addresses and the switches' management addresses", () => {
    const gateways = routerSubinterfaces(network.router).filter((sub) => sub.address);
    const r1 = NETWORK_DEVICES.filter((item) => item.device === "R1");
    expect(r1.map((item) => [item.vlan, item.ip])).toEqual(gateways.map((sub) => [sub.vlan, sub.address.ip]));
    for (const item of NETWORK_DEVICES.filter((entry) => entry.device !== "R1")) {
      expect(plan.devices.find((device) => device.name === item.device)?.management_ip, item.id).toBe(item.ip);
    }
  });
});

describe("loading a lab test case into the form", () => {
  it.each(plan.policy_tests.map((test) => [`${test.id} ${test.desc}`, test]))(
    "%s rebuilds the same packet and result",
    (_name, test) => {
      const scenario = buildScenario(formForCase(test), network);
      expect(scenario.ok).toBe(true);
      const fields = ["proto", "src", "dst", "sport", "dport", "icmp", "from_vlan"];
      for (const field of fields) expect(scenario.test[field] ?? null, field).toBe(test[field] ?? null);
      if (test.layer === "management") expect(scenario.test.layer).toBe("management");
      expect(network.evaluatePolicy(scenario.test).action).toBe(test.expect);
    },
  );

  it("never needs a custom address or port for the lab's cases", () => {
    for (const test of plan.policy_tests) {
      const form = formForCase(test);
      expect(form.sourceId, test.id).not.toBe(CUSTOM);
      expect(form.destinationId, test.id).not.toBe(CUSTOM);
      expect(SERVICES.find((service) => service.id === form.serviceId)?.custom, test.id).toBeFalsy();
    }
  });
});

describe("building a scenario from the form", () => {
  const base = formForCase(plan.policy_tests.find((test) => test.id === "P03"));

  it("checks SSH to a network device against its VTY lines", () => {
    const scenario = buildScenario({ ...base, sourceId: "faculty-pc", destinationId: "core-sw1", serviceId: "ssh" }, network);
    expect(scenario.test.layer).toBe("management");
    expect(network.evaluatePolicy(scenario.test).action).toBe("deny");
    const toServer = buildScenario({ ...base, sourceId: "it-admin", destinationId: "server", serviceId: "ssh" }, network);
    expect(toServer.test.layer).toBeUndefined();
  });

  it("accepts a typed address and a custom port", () => {
    const scenario = buildScenario(
      { ...base, sourceId: CUSTOM, sourceCustom: " 10.10.20.77 ", serviceId: "custom-tcp", customPort: "3389" },
      network,
    );
    expect(scenario).toEqual({ ok: true, test: { proto: "tcp", src: "10.10.20.77", dst: "10.10.30.10", dport: 3389 } });
    expect(network.evaluatePolicy(scenario.test).action).toBe("deny");
  });

  it.each([
    ["a malformed address", { sourceId: CUSTOM, sourceCustom: "10.10.20" }, "source", /IPv4 address/],
    ["0.0.0.0 as a source", { sourceId: CUSTOM, sourceCustom: "0.0.0.0" }, "source", /DHCP/],
    ["a broadcast destination", { destinationId: CUSTOM, destinationCustom: "255.255.255.255" }, "destination", /DHCP/],
    ["the same source and destination", { destinationId: "student-pc" }, "destination", /different/],
    ["port 0", { serviceId: "custom-udp", customPort: "0" }, "port", /1 to 65535/],
    ["port 70000", { serviceId: "custom-udp", customPort: "70000" }, "port", /1 to 65535/],
    ["a non-numeric port", { serviceId: "custom-tcp", customPort: "80a" }, "port", /1 to 65535/],
  ])("reports %s", (_label, changes, field, message) => {
    const scenario = buildScenario({ ...base, ...changes }, network);
    expect(scenario.ok).toBe(false);
    expect(scenario.errors[field]).toMatch(message);
  });

  it("only lets DHCP clients send DHCP requests", () => {
    const fromServer = buildScenario({ ...base, sourceId: "server", serviceId: "dhcp" }, network);
    expect(fromServer.ok).toBe(false);
    expect(fromServer.notApplicable).toMatch(/Only DHCP clients/);
    const fromPhone = buildScenario({ ...base, sourceId: "ip-phone", serviceId: "dhcp" }, network);
    expect(fromPhone.test).toEqual({ proto: "udp", src: "0.0.0.0", dst: "255.255.255.255", sport: 68, dport: 67, from_vlan: 50 });
  });

  it("describes packets in one line", () => {
    expect(describePacket({ proto: "tcp", src: "10.10.20.21", dst: "10.10.30.10", dport: 21 })).toBe(
      "TCP 10.10.20.21 → 10.10.30.10, to port 21",
    );
    expect(describePacket({ proto: "icmp", src: "10.10.20.21", dst: "10.10.30.10", icmp: "echo" })).toBe(
      "ICMP echo, 10.10.20.21 → 10.10.30.10",
    );
  });
});
