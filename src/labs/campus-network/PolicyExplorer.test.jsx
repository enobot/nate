import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import PolicyExplorer from "./PolicyExplorer.jsx";

const caseSelect = () => screen.getByRole("combobox", { name: /Start from a lab test case/ });
// The verdict is the only paragraph whose own text is just "Allowed" or "Blocked".
const verdict = () => screen.getByText(/^(Allowed|Blocked)$/, { selector: "p" });
const aclList = (name) => screen.getByRole("list", { name: `Access list ${name}` });
const firstMatch = (name) =>
  within(aclList(name))
    .getAllByRole("listitem")
    .find((item) => item.textContent.includes("First match"));

async function choose(user, label, optionText) {
  const select = screen.getByRole("combobox", { name: label });
  const option = within(select).getAllByRole("option").find((item) => item.textContent.startsWith(optionText));
  if (!option) throw new Error(`No option starting with "${optionText}" in ${label}`);
  await user.selectOptions(select, option);
}

describe("policy explorer", () => {
  it("starts on a lab case and shows both ACLs the packet passes through", () => {
    render(<PolicyExplorer />);
    expect(caseSelect()).toHaveValue("P03");
    expect(verdict()).toHaveTextContent("Allowed");
    expect(firstMatch("STUDENT-IN")).toHaveTextContent("permit tcp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 80");
    expect(firstMatch("SERVERS-OUT")).toHaveTextContent("permit tcp any host 10.10.30.10 eq 80");
    expect(screen.getByText(/Lab test P03 expects/)).toHaveTextContent("Lab test P03 expects Allowed, and the configs agree.");
  });

  it("explains which line blocks a lab case", async () => {
    const user = userEvent.setup();
    render(<PolicyExplorer />);
    await user.selectOptions(caseSelect(), "P07");
    expect(verdict()).toHaveTextContent("Blocked");
    expect(screen.getByText(/blocks it with/)).toHaveTextContent(
      'Access list STUDENT-IN (inbound on R1\'s VLAN 20 (STUDENTS) gateway) blocks it with "deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255".',
    );
    expect(firstMatch("STUDENT-IN")).toHaveTextContent("deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255");
    // The packet never reaches the server VLAN, so SERVERS-OUT isn't shown.
    expect(screen.queryByRole("list", { name: "Access list SERVERS-OUT" })).toBeNull();
    expect(screen.getByText("TCP 10.10.20.21 → 10.10.30.10, to port 21")).toBeInTheDocument();
  });

  it("marks lines above the match as checked and lines below it as not checked", async () => {
    const user = userEvent.setup();
    render(<PolicyExplorer />);
    await user.selectOptions(caseSelect(), "P07");
    const items = within(aclList("STUDENT-IN")).getAllByRole("listitem");
    const matchIndex = items.findIndex((item) => item.textContent.includes("First match"));
    expect(items[matchIndex - 1]).toHaveTextContent("deny ip 10.10.20.0 0.0.0.255 10.10.10.0 0.0.0.255 (checked, no match)");
    expect(items[matchIndex + 1]).toHaveTextContent("deny ip 10.10.20.0 0.0.0.255 10.10.50.0 0.0.0.255 (not checked)");
    expect(items.at(-1)).toHaveTextContent("(implicit) deny any (not checked)");
  });

  it("re-evaluates as soon as a choice changes, and leaves the lab case", async () => {
    const user = userEvent.setup();
    render(<PolicyExplorer />);
    await choose(user, "Traffic", "FTP");
    expect(caseSelect()).toHaveValue("");
    expect(verdict()).toHaveTextContent("Blocked");
    expect(screen.queryByText(/Lab test P03 expects/)).toBeNull();
    await choose(user, "From", "IT admin PC");
    expect(verdict()).toHaveTextContent("Allowed");
    expect(firstMatch("SERVERS-OUT")).toHaveTextContent("permit ip 10.10.99.0 0.0.0.255 10.10.30.0 0.0.0.255");
  });

  it("checks SSH to a switch against the switch's own VTY access list", async () => {
    const user = userEvent.setup();
    render(<PolicyExplorer />);
    await choose(user, "To", "CORE-SW1");
    await choose(user, "Traffic", "SSH");
    await choose(user, "From", "IT admin PC");
    expect(verdict()).toHaveTextContent("Allowed");
    expect(screen.getByText(/CORE-SW1 remote login lines/)).toBeInTheDocument();
    expect(firstMatch("10")).toHaveTextContent("access-list 10 permit 10.10.99.0 0.0.0.255");

    await choose(user, "From", "Faculty PC");
    expect(verdict()).toHaveTextContent("Blocked");
    expect(screen.getByText(/refuses the SSH session/)).toHaveTextContent(
      "The network delivers it, but CORE-SW1 refuses the SSH session: no line in VTY access list 10 matches the source, so the implicit deny applies.",
    );
  });

  it("explains same-VLAN traffic that never reaches the router", async () => {
    const user = userEvent.setup();
    render(<PolicyExplorer />);
    await user.selectOptions(caseSelect(), "P21");
    expect(verdict()).toHaveTextContent("Allowed");
    expect(screen.getByText("Switched inside VLAN 10 (FACULTY)")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /^Access list/ })).toBeNull();
  });

  it("accepts a typed address and port, and explains invalid input", async () => {
    const user = userEvent.setup();
    render(<PolicyExplorer />);
    await choose(user, "To", "Another address");
    const address = screen.getByRole("textbox", { name: "To: IPv4 address" });
    await user.type(address, "10.10.30");
    expect(address).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/Enter an IPv4 address/)).toBeInTheDocument();
    expect(screen.getByText("Fix the highlighted field to see a result.")).toBeInTheDocument();

    await user.type(address, ".10");
    await choose(user, "Traffic", "Other TCP port");
    await user.type(screen.getByRole("textbox", { name: "Destination port number" }), "3389");
    expect(verdict()).toHaveTextContent("Blocked");
    expect(screen.getByText("TCP 10.10.20.21 → 10.10.30.10, to port 3389")).toBeInTheDocument();
  });

  it("only lets DHCP clients send a DHCP request", async () => {
    const user = userEvent.setup();
    render(<PolicyExplorer />);
    await choose(user, "Traffic", "DHCP request");
    expect(screen.getByRole("combobox", { name: "To" })).toBeDisabled();
    expect(verdict()).toHaveTextContent("Allowed");
    expect(screen.getByText(/reaches the router's DHCP server/)).toBeInTheDocument();
    await choose(user, "From", "Campus web and DNS server");
    expect(screen.getByText(/Only DHCP clients send DHCP requests/)).toBeInTheDocument();
    expect(screen.queryByText(/^(Allowed|Blocked)$/, { selector: "p" })).toBeNull();
  });

  it("runs all 32 lab cases and loads one back into the explorer", async () => {
    const user = userEvent.setup();
    render(<PolicyExplorer />);
    await user.click(screen.getByRole("button", { name: "Run all 32 cases" }));
    expect(screen.getByRole("status")).toHaveTextContent("32 of 32 cases match the expected result.");
    const table = screen.getByRole("table", { name: "Results of the lab's policy test cases" });
    expect(within(table).getAllByRole("row")).toHaveLength(33);
    expect(within(table).getAllByText("(matches)")).toHaveLength(32);

    await user.click(within(table).getByRole("button", { name: "Load P14 into the explorer" }));
    expect(caseSelect()).toHaveValue("P14");
    expect(caseSelect()).toHaveFocus();
    expect(verdict()).toHaveTextContent("Blocked");
    expect(screen.getByText(/R1 refuses the SSH session/)).toBeInTheDocument();
  });

  it("links to the exact configs it uses", () => {
    render(<PolicyExplorer />);
    expect(screen.getByRole("link", { name: /View the configs/ })).toHaveAttribute(
      "href",
      "https://github.com/enobot/campus-network-lab/tree/93dcae70c53b96e01838e583c439fdad8cb98569/configs",
    );
  });
});
