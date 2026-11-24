import { describe, expect, it } from "vitest";
import { CONFIG_FILES, loadDevices, plan } from "./labData.js";
import { expandInterfaceRange, normalizeInterface, parseConfig } from "./iosConfig.js";

describe("interface names", () => {
  it("expands IOS abbreviations", () => {
    expect(normalizeInterface("gi0/1")).toBe("GigabitEthernet0/1");
    expect(normalizeInterface("Fa0/24")).toBe("FastEthernet0/24");
    expect(normalizeInterface("GigabitEthernet0/0/0.20")).toBe("GigabitEthernet0/0/0.20");
    expect(normalizeInterface("vlan 99")).toBe("Vlan99");
  });

  it("rejects names it doesn't know", () => {
    expect(() => normalizeInterface("Serial0/0/0")).toThrow(/interface type/);
    expect(() => normalizeInterface("not an interface")).toThrow(/interface name/);
  });

  it("expands interface ranges", () => {
    expect(expandInterfaceRange("FastEthernet0/3 - 5, GigabitEthernet0/2")).toEqual([
      "FastEthernet0/3",
      "FastEthernet0/4",
      "FastEthernet0/5",
      "GigabitEthernet0/2",
    ]);
    expect(() => expandInterfaceRange("Fa0/9 - 3")).toThrow(/Backwards/);
  });
});

describe("parsing a config", () => {
  const sample = [
    "! comment",
    "enable",
    "configure terminal",
    "hostname SW-TEST",
    "vlan 10",
    " name FACULTY",
    "interface range Fa0/1 - 2",
    " switchport access vlan 10",
    "ip access-list extended WEB",
    " remark web only",
    " permit tcp any any eq 80",
    "access-list 10 permit 10.10.99.0 0.0.0.255",
    "line vty 0 4",
    " transport input ssh",
    "end",
  ].join("\r\n");

  it("reads blocks, ranges, ACLs, and lines (with Windows line endings)", () => {
    const config = parseConfig(sample);
    expect(config.hostname).toBe("SW-TEST");
    expect(config.vlans.get(10)).toBe("FACULTY");
    expect(config.interfaces.get("FastEthernet0/1")).toEqual(["switchport access vlan 10"]);
    expect(config.interfaces.get("FastEthernet0/2")).toEqual(["switchport access vlan 10"]);
    expect(config.namedAcls.get("WEB")).toEqual({ kind: "extended", lines: ["remark web only", "permit tcp any any eq 80"] });
    expect(config.numberedAcls.get("10")).toEqual(["permit 10.10.99.0 0.0.0.255"]);
    expect(config.lines.get("vty 0 4")).toEqual(["transport input ssh"]);
    expect(config.globalLines).toEqual(["hostname SW-TEST"]);
  });

  it("rejects an indented command outside any block", () => {
    expect(() => parseConfig(" switchport mode access")).toThrow(/outside any block/);
  });
});

describe("the lab's real configs", () => {
  it("parses every device's config with the hostname the plan expects", () => {
    const devices = loadDevices();
    for (const device of plan.devices) {
      expect(devices[device.name].hostname, device.config).toBe(device.name);
    }
  });

  it("finds R1's two named ACLs and the management ACL on every device", () => {
    const devices = loadDevices();
    expect([...devices.R1.namedAcls.keys()]).toEqual(["STUDENT-IN", "SERVERS-OUT"]);
    for (const device of plan.devices) {
      expect(devices[device.name].numberedAcls.has(plan.management_acl), device.name).toBe(true);
    }
  });

  it("bundles a config for every device in the plan and nothing else", () => {
    expect(Object.keys(CONFIG_FILES).sort()).toEqual(plan.devices.map((device) => device.config).sort());
  });
});
