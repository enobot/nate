import { describe, expect, it } from "vitest";
import pythonReference from "./data/python-reference.json";
import { LAB_COMMIT, getNetwork, loadDevices, plan } from "./labData.js";
import { BROADCAST, CampusNetwork, aclDefinition, aclEntries, routerSubinterfaces } from "./network.js";
import { parseConfig } from "./iosConfig.js";

const network = getNetwork();
const CASES = plan.policy_tests;

describe("the lab's policy test cases", () => {
  it("has 32 cases with unique ids", () => {
    expect(CASES).toHaveLength(32);
    expect(new Set(CASES.map((test) => test.id)).size).toBe(CASES.length);
  });

  it.each(CASES.map((test) => [`${test.id} ${test.desc}`, test]))("%s", (_name, test) => {
    const decision = network.evaluatePolicy(test);
    expect(decision.action, decision.reasons.join("\n")).toBe(test.expect);
  });

  it("makes every permit/deny line in R1's ACLs the deciding line for at least one case", () => {
    const used = new Set();
    for (const test of CASES) {
      for (const [acl, line] of network.evaluatePolicy(test).matched) used.add(`${acl}: ${line}`);
    }
    const unexercised = [];
    for (const name of network.router.namedAcls.keys()) {
      for (const entry of aclEntries(network.router, name)) {
        if (!used.has(`${name}: ${entry.text}`)) unexercised.push(`${name}: ${entry.text}`);
      }
    }
    expect(unexercised).toEqual([]);
  });
});

describe("parity with the lab's Python checker", () => {
  it("uses the same configs the reference was generated from", () => {
    expect(pythonReference.source_commit).toBe(LAB_COMMIT);
    expect(pythonReference.cases.map((item) => item.id)).toEqual(CASES.map((test) => test.id));
  });

  it.each(pythonReference.cases.map((item) => [item.id, item]))(
    "%s: same result, reasons, and deciding ACL lines as the Python version",
    (id, expected) => {
      const decision = network.evaluatePolicy(CASES.find((test) => test.id === id));
      expect({ action: decision.action, reasons: decision.reasons, matched: decision.matched }).toEqual({
        action: expected.action,
        reasons: expected.reasons,
        matched: expected.matched,
      });
    },
  );
});

describe("the router model", () => {
  it("reads R1's VLAN subinterfaces and ACL bindings from its config", () => {
    const subs = routerSubinterfaces(network.router);
    const routed = subs.filter((sub) => sub.address).map((sub) => [sub.vlan, sub.address.ip, sub.aclIn, sub.aclOut]);
    expect(routed).toEqual([
      [10, "10.10.10.1", null, null],
      [20, "10.10.20.1", "STUDENT-IN", null],
      [30, "10.10.30.1", null, "SERVERS-OUT"],
      [50, "10.10.50.1", null, null],
      [99, "10.10.99.1", null, null],
    ]);
    const native = subs.find((sub) => sub.native);
    expect(native).toMatchObject({ vlan: 999, address: null });
  });

  it("matches the ACL bindings written in the lab plan", () => {
    for (const [name, binding] of Object.entries(plan.router_acls)) {
      const sub = routerSubinterfaces(network.router).find((item) => item.name === name);
      expect(sub, name).toBeDefined();
      expect(sub.aclIn ?? undefined).toBe(binding.in);
      expect(sub.aclOut ?? undefined).toBe(binding.out);
    }
  });

  it("switches same-VLAN traffic without checking any ACL", () => {
    const decision = network.forward({ proto: "tcp", src: "10.10.20.21", dst: "10.10.20.22", dport: 21 });
    expect(decision.action).toBe("permit");
    expect(decision.steps).toEqual([{ type: "switched", vlan: 20 }]);
    expect(decision.matched).toEqual([]);
  });

  it("denies traffic from an address outside every lab VLAN", () => {
    const decision = network.forward({ proto: "icmp", src: "192.0.2.10", dst: "10.10.30.10", icmp: "echo" });
    expect(decision.action).toBe("deny");
    expect(decision.reasons).toEqual(["source is in no routed VLAN"]);
  });

  it("denies traffic to an address R1 has no route to, after the inbound ACL permits it", () => {
    const decision = network.forward({ proto: "tcp", src: "10.10.20.21", dst: "198.51.100.7", dport: 443 });
    expect(decision.action).toBe("deny");
    expect(decision.reasons).toEqual([
      "in on GigabitEthernet0/0/0.20: STUDENT-IN -> permit (permit ip 10.10.20.0 0.0.0.255 any)",
      "no route to destination",
    ]);
  });

  it("lets SERVERS-OUT's explicit final deny decide when no service line matches", () => {
    // UDP to the server on a port it doesn't offer, from faculty (no inbound ACL on VLAN 10).
    const decision = network.forward({ proto: "udp", src: "10.10.10.21", dst: "10.10.30.10", dport: 69 });
    expect(decision.action).toBe("deny");
    const last = decision.steps.at(-1);
    expect(last).toMatchObject({ type: "acl", acl: { name: "SERVERS-OUT" }, action: "deny" });
    // SERVERS-OUT ends with an explicit "deny ip any any", so that line decides, not the implicit deny.
    expect(last.acl.lines[last.matchedLine]).toBe("deny ip any any");
  });

  it("treats DHCP broadcasts as delivered to R1 on the sender's VLAN", () => {
    const decision = network.forward({ proto: "udp", src: "0.0.0.0", dst: BROADCAST, sport: 68, dport: 67 }, 10);
    expect(decision.action).toBe("permit");
    expect(decision.steps.map((step) => step.type)).toEqual(["ingress", "no-acl", "to-router"]);
  });

  it("finds network devices by address", () => {
    expect(network.deviceForAddress("10.10.20.1")).toBe("R1");
    expect(network.deviceForAddress("10.10.99.2")).toBe("CORE-SW1");
    expect(network.deviceForAddress("10.10.99.4")).toBe("ACC-SW2");
    expect(network.deviceForAddress("10.10.30.10")).toBeNull();
  });

  it("checks each device's real VTY access-class for SSH", () => {
    for (const device of plan.devices) {
      expect(network.sshAllowed(device.name, "10.10.99.50").action, device.name).toBe("permit");
      expect(network.sshAllowed(device.name, "10.10.10.21").action, device.name).toBe("deny");
    }
    const acl = aclDefinition(network.devices["CORE-SW1"], plan.management_acl);
    expect(acl).toMatchObject({ kind: "standard", numbered: true });
  });

  it("refuses SSH when a device's VTY lines don't allow SSH", () => {
    const devices = loadDevices();
    devices["ACC-SW1"] = parseConfig("line vty 0 15\n transport input telnet\n login local\n");
    const telnetOnly = new CampusNetwork(plan, devices);
    const decision = telnetOnly.sshAllowed("ACC-SW1", "10.10.99.50");
    expect(decision.action).toBe("deny");
    expect(decision.reasons).toEqual(["ACC-SW1: VTY does not accept SSH"]);
  });

  it("throws for an ACL that isn't defined", () => {
    expect(() => aclEntries(network.router, "NO-SUCH-ACL")).toThrow(/not defined/);
  });
});
