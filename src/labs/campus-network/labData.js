// The campus network lab's real design plan and device configs, copied from
// the campus-network-lab repository at the commit in data/SOURCE_COMMIT.
// Only the policy explorer imports this file, so the configs are loaded on
// the Campus Network Lab page and nowhere else.

import plan from "./data/lab-plan.json";
import sourceCommit from "./data/SOURCE_COMMIT?raw";
import accSw1 from "./data/configs/ACC-SW1.txt?raw";
import accSw2 from "./data/configs/ACC-SW2.txt?raw";
import coreSw1 from "./data/configs/CORE-SW1.txt?raw";
import r1 from "./data/configs/R1.txt?raw";
import { parseConfig } from "./iosConfig.js";
import { CampusNetwork } from "./network.js";

export const CONFIG_FILES = {
  "configs/R1.txt": r1,
  "configs/CORE-SW1.txt": coreSw1,
  "configs/ACC-SW1.txt": accSw1,
  "configs/ACC-SW2.txt": accSw2,
};

export const LAB_REPO = "https://github.com/enobot/campus-network-lab";
export const LAB_COMMIT = sourceCommit.trim();

export { plan };

/** Parse every device's config named in the plan. */
export function loadDevices(labPlan = plan, files = CONFIG_FILES) {
  const devices = {};
  for (const device of labPlan.devices) {
    const text = files[device.config];
    if (text === undefined) throw new Error(`Missing config file ${device.config} for ${device.name}`);
    devices[device.name] = parseConfig(text);
  }
  return devices;
}

let network = null;

/** The lab network, parsed once and reused. */
export function getNetwork() {
  if (network === null) network = new CampusNetwork(plan, loadDevices());
  return network;
}
