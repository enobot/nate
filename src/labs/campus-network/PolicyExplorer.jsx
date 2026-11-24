import { useId, useMemo, useRef, useState } from "react";
import { CircleCheck, CircleX, ExternalLink, Info, ListChecks } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { LAB_COMMIT, LAB_REPO, getNetwork, plan } from "./labData.js";
import {
  CUSTOM,
  END_DEVICES,
  NETWORK_DEVICES,
  SERVICES,
  buildScenario,
  describePacket,
  formForCase,
  serviceById,
} from "./scenarios.js";

const CASES = plan.policy_tests;
const DEFAULT_CASE_ID = "P03";
const VLAN_NAMES = new Map(plan.vlans.map((vlan) => [vlan.id, vlan.name]));

const vlanLabel = (id) => (VLAN_NAMES.has(id) ? `VLAN ${id} (${VLAN_NAMES.get(id)})` : `VLAN ${id}`);
const verdictWord = (action) => (action === "permit" ? "Allowed" : "Blocked");
const directionWord = (direction) => (direction === "in" ? "inbound" : "outbound");
const matchedText = (step) => (step.matchedLine === null ? null : step.acl.lines[step.matchedLine]);

/** One plain-language sentence explaining the verdict. */
export function summarize(decision) {
  const { steps } = decision;
  const last = steps[steps.length - 1];
  const vty = steps.find((step) => step.type === "vty");

  if (last.type === "switched") {
    return `Both ends are in ${vlanLabel(last.vlan)}, so the switches deliver it directly. It never reaches R1, so R1's access lists don't apply.`;
  }
  if (last.type === "no-source-vlan") {
    return "The source address isn't in any of the lab's VLANs, so R1 has no interface it could arrive on.";
  }
  if (last.type === "no-route") {
    return "R1 has no route to that address. The lab network has no internet connection, so only its own VLANs are reachable.";
  }
  if (vty) {
    if (vty.problem === "no-vty") return `${vty.device} has no VTY lines, so it can't accept remote logins.`;
    if (vty.problem === "no-ssh") return `${vty.device}'s VTY lines don't accept SSH.`;
    if (decision.action === "permit") {
      return vty.acl
        ? `${vty.device} accepts the SSH session: its VTY lines allow SSH, and access list ${vty.acl.name} permits the source address.`
        : `${vty.device} accepts the SSH session: its VTY lines allow SSH from any address.`;
    }
    const line = matchedText(vty);
    return line
      ? `The network delivers it, but ${vty.device} refuses the SSH session: "${line}" in VTY access list ${vty.acl.name}.`
      : `The network delivers it, but ${vty.device} refuses the SSH session: no line in VTY access list ${vty.acl.name} matches the source, so the implicit deny applies.`;
  }
  const blocking = decision.action === "deny" ? steps.find((step) => step.type === "acl" && step.action === "deny") : null;
  if (blocking) {
    const line = matchedText(blocking);
    const where = `${directionWord(blocking.direction)} on R1's ${vlanLabel(blocking.vlan)} gateway`;
    return line
      ? `Access list ${blocking.acl.name} (${where}) blocks it with "${line}".`
      : `Access list ${blocking.acl.name} (${where}) blocks it: no line matches, so the implicit deny at the end applies.`;
  }
  if (last.type === "to-router") {
    return last.broadcast
      ? "R1 accepts the broadcast, so the request reaches the router's DHCP server."
      : "R1 accepts it on its own address.";
  }
  if (last.type === "delivered") return `R1 routes it into ${vlanLabel(last.vlan)}, and every access list on the way permits it.`;
  return `${verdictWord(decision.action)}.`;
}

function AclListing({ acl, matchedLine, action }) {
  const entryLines = new Set(acl.entries.map((entry) => entry.line));
  const prefix = acl.numbered ? `access-list ${acl.name} ` : " ";
  const matchTone = action === "permit" ? "border-online bg-online/10" : "border-blocked bg-blocked/10";
  const tagTone = action === "permit" ? "bg-online/20 text-online" : "bg-blocked/20 text-blocked";
  const tag = (
    <span className={cn("ml-3 rounded px-1.5 py-0.5 font-sans text-[0.65rem] font-semibold uppercase", tagTone)}>
      First match<span className="sr-only">: this line decides the result</span>
    </span>
  );

  return (
    // `relative` keeps the absolutely positioned screen-reader text inside this
    // scroll box; without it, that text would widen the whole page on phones.
    // tabIndex lets keyboard users scroll long lines sideways.
    <div
      role="region"
      aria-label={`${acl.name} as written in the config`}
      tabIndex={0}
      className="relative mt-3 overflow-x-auto rounded-lg border border-electric-soft/15 bg-navy-950/80 py-2"
    >
      {!acl.numbered ? (
        <p className="px-3 font-mono text-xs whitespace-pre text-ink sm:text-[0.8rem]">
          ip access-list {acl.kind} {acl.name}
        </p>
      ) : null}
      <ol aria-label={`Access list ${acl.name}`} className="min-w-max font-mono text-xs leading-relaxed sm:text-[0.8rem]">
        {acl.lines.map((text, index) => {
          const remark = !entryLines.has(index);
          const match = index === matchedLine;
          const checked = !remark && !match && (matchedLine === null || index < matchedLine);
          return (
            <li
              key={`${index}-${text}`}
              className={cn(
                "border-l-2 px-3 whitespace-pre",
                match
                  ? cn(matchTone, "text-white")
                  : remark
                    ? "border-transparent text-ink-dim italic"
                    : checked
                      ? "border-transparent text-ink-muted"
                      : "border-transparent text-ink-dim",
              )}
            >
              {prefix}
              {text}
              {match ? <>{" "}{tag}</> : null}
              {checked ? <>{" "}<span className="sr-only">(checked, no match)</span></> : null}
              {!remark && !match && !checked ? <>{" "}<span className="sr-only">(not checked)</span></> : null}
            </li>
          );
        })}
        <li
          className={cn(
            "border-l-2 px-3 whitespace-pre",
            matchedLine === null ? cn(matchTone, "text-white") : "border-transparent text-ink-dim",
          )}
        >
          {acl.numbered ? "(implicit) deny any" : " (implicit) deny any"}
          {matchedLine === null ? <>{" "}{tag}</> : <>{" "}<span className="sr-only">(not checked)</span></>}
        </li>
      </ol>
    </div>
  );
}

function StepItem({ number, title, detail, action, children }) {
  return (
    <li className="min-w-0 rounded-xl border border-electric-soft/12 bg-navy-900/40 p-4">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span
          aria-hidden="true"
          className="grid size-6 shrink-0 place-items-center rounded-full border border-cyan/40 font-mono text-xs text-cyan-soft"
        >
          {number}
        </span>
        <p className="min-w-0 flex-1 font-semibold text-white">{title}</p>
        {action ? (
          <span
            className={cn(
              "hud-label rounded-full border px-2 py-0.5 text-[0.65rem]",
              action === "permit" ? "border-online/40 text-online" : "border-blocked/40 text-blocked",
            )}
          >
            {action}
          </span>
        ) : null}
      </div>
      {detail ? <p className="mt-1.5 pl-9 text-sm text-ink-muted">{detail}</p> : null}
      {children ? <div className="sm:pl-9">{children}</div> : null}
    </li>
  );
}

function Step({ step, number }) {
  switch (step.type) {
    case "ingress":
      return <StepItem number={number} title={`Arrives at R1 on ${step.interface}`} detail={`R1's gateway for ${vlanLabel(step.vlan)}.`} />;
    case "no-acl":
      return (
        <StepItem
          number={number}
          title={`No ${directionWord(step.direction)} access list on ${step.interface}`}
          detail="Nothing to check here, so it continues."
        />
      );
    case "acl":
      return (
        <StepItem
          number={number}
          title={`${step.direction === "in" ? "Inbound" : "Outbound"} access list ${step.acl.name} on ${step.interface}`}
          action={step.action}
        >
          <AclListing acl={step.acl} matchedLine={step.matchedLine} action={step.action} />
        </StepItem>
      );
    case "egress":
      return <StepItem number={number} title={`R1 routes it out ${step.interface}`} detail={`Toward ${vlanLabel(step.vlan)}.`} />;
    case "delivered":
      return <StepItem number={number} title={`Delivered into ${vlanLabel(step.vlan)}`} />;
    case "to-router":
      return (
        <StepItem
          number={number}
          title={step.broadcast ? "R1 accepts the broadcast" : "R1 accepts it on its own address"}
          detail={step.broadcast ? "R1 runs the lab's DHCP server, so this is where the request needs to go." : null}
        />
      );
    case "switched":
      return (
        <StepItem
          number={number}
          title={`Switched inside ${vlanLabel(step.vlan)}`}
          detail="Same VLAN, so the switches forward it without sending it to R1."
        />
      );
    case "no-source-vlan":
      return <StepItem number={number} title="No VLAN for the source address" detail="R1 only routes the lab's VLAN subnets." />;
    case "no-route":
      return <StepItem number={number} title="No route to the destination" detail="R1 only knows the lab's VLAN subnets." />;
    case "not-a-device":
      return <StepItem number={number} title="Not a network device" detail="Only R1 and the switches accept SSH management sessions." />;
    case "vty":
      return (
        <StepItem
          number={number}
          title={`${step.device} remote login lines${step.lines ? ` (line ${step.lines})` : ""}`}
          action={step.action}
          detail={
            step.problem === "no-vty"
              ? "No VTY lines are configured."
              : step.problem === "no-ssh"
                ? "The lines don't have transport input ssh."
                : step.acl
                  ? `"transport input ssh" accepts SSH, and "access-class ${step.acl.name} in" decides who may log in.`
                  : `"transport input ssh" accepts SSH, and there's no access-class.`
          }
        >
          {step.acl ? <AclListing acl={step.acl} matchedLine={step.matchedLine} action={step.action} /> : null}
        </StepItem>
      );
    default:
      return null;
  }
}

const fieldClass =
  "min-h-11 w-full min-w-0 max-w-full rounded-lg border border-electric-soft/25 bg-navy-950 px-3 text-sm text-ink [color-scheme:dark] transition-colors hover:border-cyan/50 focus-visible:border-cyan disabled:cursor-not-allowed disabled:opacity-60";

function AddressField({ label, value, custom, onChange, onCustomChange, groups, error, disabled, hint }) {
  const id = useId();
  const customId = `${id}-custom`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="hud-label text-[0.7rem] text-ink-dim">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={value === CUSTOM ? undefined : describedBy}
        className={cn(fieldClass, "mt-1.5")}
      >
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} · {item.ip}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={CUSTOM}>Another address…</option>
      </select>
      {value === CUSTOM && !disabled ? (
        <>
          <label htmlFor={customId} className="sr-only">
            {label}: IPv4 address
          </label>
          <input
            id={customId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder="10.10.20.30"
            value={custom}
            onChange={(event) => onCustomChange(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(fieldClass, "mt-2 font-mono")}
          />
        </>
      ) : null}
      {hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-ink-dim">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm text-blocked">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function LabCases({ network, onLoad }) {
  const [results, setResults] = useState(null);
  const headingId = useId();
  const passed = results?.filter((result) => result.pass).length ?? 0;

  const run = () =>
    setResults(
      CASES.map((test) => {
        const decision = network.evaluatePolicy(test);
        return { test, action: decision.action, pass: decision.action === test.expect };
      }),
    );

  return (
    <section aria-labelledby={headingId} className="mt-8 border-t border-electric-soft/10 pt-6">
      <h3 id={headingId} className="flex items-center gap-2 font-display text-base font-bold tracking-wide text-white">
        <ListChecks aria-hidden="true" className="size-5 text-cyan" />
        The lab's {CASES.length} test cases
      </h3>
      <p className="mt-2 max-w-3xl text-sm text-ink-muted sm:text-base">
        These are the allowed and blocked cases from the lab's verification checklist, with the result each one should
        have. Running them here uses the same configs and the same code as the explorer above.
      </p>
      <button
        type="button"
        onClick={run}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-cyan/35 bg-cyan/8 px-4 text-sm font-semibold text-cyan-soft transition-colors hover:border-cyan/70 hover:text-white"
      >
        {results ? "Run them again" : `Run all ${CASES.length} cases`}
      </button>
      <p role="status" className="mt-3 text-sm font-semibold text-white">
        {results ? `${passed} of ${results.length} cases match the expected result.` : ""}
      </p>
      {results ? (
        <div
          role="region"
          aria-label="Lab test case results"
          tabIndex={0}
          className="relative mt-3 overflow-x-auto rounded-xl border border-electric-soft/12"
        >
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Results of the lab's policy test cases</caption>
            <thead className="bg-navy-900/60 text-ink-dim">
              <tr>
                <th scope="col" className="hud-label px-3 py-2 text-[0.68rem]">Case</th>
                <th scope="col" className="hud-label px-3 py-2 text-[0.68rem]">Scenario</th>
                <th scope="col" className="hud-label px-3 py-2 text-[0.68rem]">Expected</th>
                <th scope="col" className="hud-label px-3 py-2 text-[0.68rem]">Result</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Load</span></th>
              </tr>
            </thead>
            <tbody>
              {results.map(({ test, action, pass }) => (
                <tr key={test.id} className="border-t border-electric-soft/10">
                  <th scope="row" className="px-3 py-2 font-mono text-cyan-soft">{test.id}</th>
                  <td className="px-3 py-2 text-ink-muted">{test.desc}</td>
                  <td className="px-3 py-2 text-ink">{verdictWord(test.expect)}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-flex items-center gap-1.5", pass ? "text-online" : "text-blocked")}>
                      {pass ? <CircleCheck aria-hidden="true" className="size-4" /> : <CircleX aria-hidden="true" className="size-4" />}
                      {verdictWord(action)}{" "}
                      <span className="sr-only">{pass ? "(matches)" : "(does not match)"}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onLoad(test)}
                      className="inline-flex min-h-11 items-center rounded-md px-2 text-cyan-soft underline-offset-4 hover:text-white hover:underline"
                    >
                      Load{" "}<span className="sr-only">{test.id} into the explorer</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Interactive explorer for the campus network lab's traffic policy. Pick a
 * source, destination, and kind of traffic; it shows whether the lab's real
 * router and switch configs allow it, and which access list line decided.
 */
export default function PolicyExplorer() {
  const network = useMemo(() => getNetwork(), []);
  const defaultCase = CASES.find((test) => test.id === DEFAULT_CASE_ID) ?? CASES[0];
  const [form, setForm] = useState(() => formForCase(defaultCase));
  const [caseId, setCaseId] = useState(defaultCase.id);
  const caseSelectRef = useRef(null);
  const ids = { case: useId(), service: useId(), port: useId(), portError: useId(), result: useId() };

  const scenario = useMemo(() => buildScenario(form, network), [form, network]);
  const decision = useMemo(() => (scenario.ok ? network.evaluatePolicy(scenario.test) : null), [scenario, network]);
  const loadedCase = caseId ? CASES.find((test) => test.id === caseId) : null;
  const service = serviceById(form.serviceId);
  const errors = scenario.errors ?? {};

  const update = (changes) => {
    setForm((current) => ({ ...current, ...changes }));
    setCaseId("");
  };
  const loadCase = (test) => {
    setForm(formForCase(test));
    setCaseId(test.id);
  };

  const sourceGroups = [{ label: "End devices", items: END_DEVICES }];
  const destinationGroups = [
    { label: "End devices", items: END_DEVICES },
    { label: "Network devices", items: NETWORK_DEVICES },
  ];

  return (
    <div>
      <p className="max-w-3xl text-base text-ink-muted sm:text-lg">
        Pick where traffic starts, where it's going, and what kind it is. The explorer reads the lab's real router and
        switch configuration files and checks the traffic the way Cisco IOS does: each access list is read top to bottom,
        the first line that matches decides, and traffic that matches no line is denied.
      </p>
      <p className="mt-4 flex max-w-3xl gap-3 rounded-xl border border-electric-soft/15 bg-navy-900/40 p-3 text-sm text-ink-muted">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-cyan" />
        <span>
          It checks Layer 3 access lists and SSH access only. It isn't a Packet Tracer simulation, so it doesn't test
          cabling, trunks, spanning tree, or whether DHCP actually hands out an address.
        </span>
      </p>

      <form onSubmit={(event) => event.preventDefault()} className="mt-6 grid gap-5" aria-label="Traffic to check">
        <div className="min-w-0 max-w-xl">
          <label htmlFor={ids.case} className="hud-label text-[0.7rem] text-ink-dim">
            Start from a lab test case (optional)
          </label>
          <select
            id={ids.case}
            ref={caseSelectRef}
            value={caseId}
            onChange={(event) => {
              const test = CASES.find((item) => item.id === event.target.value);
              if (test) loadCase(test);
              else setCaseId("");
            }}
            className={cn(fieldClass, "mt-1.5")}
          >
            <option value="">Your own scenario</option>
            {CASES.map((test) => (
              <option key={test.id} value={test.id}>
                {test.id} · {test.desc}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <AddressField
            label="From"
            value={form.sourceId}
            custom={form.sourceCustom}
            onChange={(sourceId) => update({ sourceId })}
            onCustomChange={(sourceCustom) => update({ sourceCustom })}
            groups={sourceGroups}
            error={errors.source}
          />
          <AddressField
            label="To"
            value={form.destinationId}
            custom={form.destinationCustom}
            onChange={(destinationId) => update({ destinationId })}
            onCustomChange={(destinationCustom) => update({ destinationCustom })}
            groups={destinationGroups}
            error={service?.dhcp ? undefined : errors.destination}
            disabled={Boolean(service?.dhcp)}
            hint={service?.dhcp ? "A DHCP request is a broadcast to 255.255.255.255, so R1 receives it on the sender's VLAN." : undefined}
          />
          <div className="min-w-0">
            <label htmlFor={ids.service} className="hud-label text-[0.7rem] text-ink-dim">
              Traffic
            </label>
            <select
              id={ids.service}
              value={form.serviceId}
              onChange={(event) => update({ serviceId: event.target.value })}
              className={cn(fieldClass, "mt-1.5")}
            >
              {SERVICES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            {service?.custom ? (
              <>
                <label htmlFor={ids.port} className="sr-only">
                  Destination port number
                </label>
                <input
                  id={ids.port}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Port, e.g. 3389"
                  value={form.customPort}
                  onChange={(event) => update({ customPort: event.target.value })}
                  aria-invalid={errors.port ? true : undefined}
                  aria-describedby={errors.port ? ids.portError : undefined}
                  className={cn(fieldClass, "mt-2 font-mono")}
                />
                {errors.port ? (
                  <p id={ids.portError} className="mt-1.5 text-sm text-blocked">
                    {errors.port}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </form>

      <section aria-labelledby={ids.result} className="mt-6">
        <h3 id={ids.result} className="sr-only">
          Result
        </h3>
        <div aria-live="polite" aria-atomic="true">
          {decision ? (
            <div
              className={cn(
                "rounded-xl border p-4 sm:p-5",
                decision.action === "permit" ? "border-online/40 bg-online/8" : "border-blocked/40 bg-blocked/8",
              )}
            >
              <p
                className={cn(
                  "flex items-center gap-2 font-display text-xl font-bold tracking-wide",
                  decision.action === "permit" ? "text-online" : "text-blocked",
                )}
              >
                {decision.action === "permit" ? (
                  <CircleCheck aria-hidden="true" className="size-6" />
                ) : (
                  <CircleX aria-hidden="true" className="size-6" />
                )}
                {verdictWord(decision.action)}
              </p>
              <p className="mt-2 text-ink">{summarize(decision)}</p>
            </div>
          ) : scenario.notApplicable ? (
            <p className="rounded-xl border border-amber/35 bg-amber/8 p-4 text-ink">{scenario.notApplicable}</p>
          ) : (
            <p className="rounded-xl border border-electric-soft/15 p-4 text-ink-muted">
              Fix the highlighted field to see a result.
            </p>
          )}
        </div>

        {decision ? (
          <>
            <p className="mt-3 font-mono text-xs break-words text-ink-dim sm:text-sm">
              <span className="sr-only">Packet:</span>{" "}
              {describePacket(scenario.test)}
            </p>
            {loadedCase ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
                {decision.action === loadedCase.expect ? (
                  <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-online" />
                ) : (
                  <CircleX aria-hidden="true" className="size-4 shrink-0 text-blocked" />
                )}
                <span>
                  Lab test {loadedCase.id} expects <strong className="text-white">{verdictWord(loadedCase.expect)}</strong>
                  {decision.action === loadedCase.expect ? ", and the configs agree." : ", but the configs disagree."}
                </span>
              </p>
            ) : null}
            <ol aria-label="How the network handles it" className="mt-4 grid gap-3">
              {decision.steps.map((step, index) => (
                <Step key={`${step.type}-${index}`} step={step} number={index + 1} />
              ))}
            </ol>
            {decision.steps.some((step) => step.acl) ? (
              <p className="mt-3 text-xs text-ink-dim sm:text-sm">
                In each list, the highlighted line is the first one that matches. Lines above it were checked and didn't
                match; lines below it were never checked.
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      <LabCases
        network={network}
        onLoad={(test) => {
          loadCase(test);
          caseSelectRef.current?.focus();
        }}
      />

      <p className="mt-8 border-t border-electric-soft/10 pt-4 text-xs text-ink-dim sm:text-sm">
        Uses R1.txt, CORE-SW1.txt, ACC-SW1.txt, and ACC-SW2.txt from the campus-network-lab repository at commit{" "}
        <span className="font-mono">{LAB_COMMIT.slice(0, 7)}</span>.{" "}
        <a
          href={`${LAB_REPO}/tree/${LAB_COMMIT}/configs`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-cyan-soft underline-offset-4 hover:text-white hover:underline"
        >
          View the configs
          <ExternalLink aria-hidden="true" className="size-3.5" />{" "}
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </p>
    </div>
  );
}
