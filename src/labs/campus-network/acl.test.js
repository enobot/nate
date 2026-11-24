import { describe, expect, it } from "vitest";
import { ANY, addressMatches, evaluate, ipToInt, isIPv4, parseAcl, parseEntry } from "./acl.js";

const packet = (fields) => ({ proto: "tcp", src: "10.10.20.21", dst: "10.10.30.10", sport: null, dport: null, icmp: null, ...fields });

describe("IPv4 parsing", () => {
  it("converts dotted addresses to unsigned integers", () => {
    expect(ipToInt("0.0.0.0")).toBe(0);
    expect(ipToInt("10.10.20.21")).toBe(168432661);
    expect(ipToInt("255.255.255.255")).toBe(4294967295);
  });

  it.each(["10.10.20", "10.10.20.21.5", "256.1.1.1", "010.1.1.1", "10.10.20.-1", "a.b.c.d", "", " 10.1.1.1"])(
    "rejects %j",
    (value) => {
      expect(isIPv4(value)).toBe(false);
      expect(() => ipToInt(value)).toThrow(/not an IPv4 address/);
    },
  );
});

describe("wildcard matching", () => {
  it("matches a /24 written as address + wildcard", () => {
    const match = { address: ipToInt("10.10.20.0"), wildcard: ipToInt("0.0.0.255") };
    expect(addressMatches(match, "10.10.20.0")).toBe(true);
    expect(addressMatches(match, "10.10.20.255")).toBe(true);
    expect(addressMatches(match, "10.10.21.0")).toBe(false);
  });

  it("matches everything with any and exactly one address with host", () => {
    expect(addressMatches(ANY, "203.0.113.9")).toBe(true);
    const host = parseEntry("permit ip host 10.10.30.10 any", "extended").src;
    expect(addressMatches(host, "10.10.30.10")).toBe(true);
    expect(addressMatches(host, "10.10.30.11")).toBe(false);
  });

  it("handles wildcards with the top bit set", () => {
    const match = { address: ipToInt("128.0.0.0"), wildcard: ipToInt("127.255.255.255") };
    expect(addressMatches(match, "200.1.2.3")).toBe(true);
    expect(addressMatches(match, "10.1.2.3")).toBe(false);
  });
});

describe("parsing ACL entries", () => {
  it("returns null for remarks", () => {
    expect(parseEntry("remark Campus web", "extended")).toBeNull();
  });

  it("parses ports by number and by IOS name, and ICMP types", () => {
    expect(parseEntry("permit udp any eq bootpc any eq bootps", "extended")).toMatchObject({ sport: 68, dport: 67 });
    expect(parseEntry("permit tcp any host 10.10.30.10 eq www", "extended")).toMatchObject({ dport: 80 });
    expect(parseEntry("permit tcp any host 10.10.30.10 eq 443", "extended")).toMatchObject({ dport: 443 });
    expect(parseEntry("permit icmp any 10.10.30.0 0.0.0.255 echo-reply", "extended")).toMatchObject({ icmp: "echo-reply" });
  });

  it("treats a standard ACL line as a source match on any protocol", () => {
    expect(parseEntry("permit 10.10.99.0 0.0.0.255", "standard")).toMatchObject({ proto: "ip", dst: ANY });
  });

  it.each([
    ["an unknown action", "allow ip any any", /Unexpected ACL action/],
    ["an unsupported protocol", "permit gre any any", /Unsupported protocol/],
    ["an unsupported port operator", "permit tcp any any gt 1023", /not supported/],
    ["an unknown port name", "permit tcp any any eq gopher", /Unknown port/],
    ["leftover words", "permit tcp any any eq 80 log", /Unparsed words/],
    ["a missing address", "permit tcp any", /Missing address/],
  ])("rejects %s", (_label, line, error) => {
    expect(() => parseEntry(line, "extended")).toThrow(error);
  });

  it("remembers each entry's line in the original list, remarks included", () => {
    const entries = parseAcl(["remark first", "permit ip any any", "remark second", "deny ip any any"], "extended");
    expect(entries.map((entry) => entry.line)).toEqual([1, 3]);
  });
});

describe("evaluating an ACL", () => {
  const acl = parseAcl(
    [
      "permit tcp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 80",
      "deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255",
      "permit ip 10.10.20.0 0.0.0.255 any",
    ],
    "extended",
  );

  it("uses the first matching line", () => {
    expect(evaluate(acl, packet({ dport: 80 })).entry.line).toBe(0);
    expect(evaluate(acl, packet({ dport: 21 })).entry.line).toBe(1);
    expect(evaluate(acl, packet({ dport: 21 })).action).toBe("deny");
    expect(evaluate(acl, packet({ dst: "10.10.10.21", dport: 21 })).entry.line).toBe(2);
  });

  it("denies with no entry (the implicit deny) when nothing matches", () => {
    expect(evaluate(acl, packet({ src: "10.10.10.21" }))).toEqual({ action: "deny", entry: null });
  });

  it("requires the protocol, ports, and ICMP type to match when the line names them", () => {
    const [udpDns] = parseAcl(["permit udp any host 10.10.30.10 eq 53"], "extended");
    expect(evaluate([udpDns], packet({ proto: "udp", dport: 53 })).action).toBe("permit");
    expect(evaluate([udpDns], packet({ proto: "tcp", dport: 53 })).action).toBe("deny");
    const [echo] = parseAcl(["permit icmp any any echo"], "extended");
    expect(evaluate([echo], packet({ proto: "icmp", icmp: "echo" })).action).toBe("permit");
    expect(evaluate([echo], packet({ proto: "icmp", icmp: "echo-reply" })).action).toBe("deny");
  });
});
