import Section from "../components/Section.jsx";
import SkillGroups from "../components/SkillGroups.jsx";
import { profile } from "../data/profile.js";

export default function Skills() {
  return (
    <Section
      id="skills"
      index="02"
      kicker="Loadout"
      title="Skills"
      intro="Grouped by area. Tags show where each skill was used: on the job at CSUF, in coursework, or in a project."
    >
      <SkillGroups groups={profile.skills} evidence={profile.evidence} />
    </Section>
  );
}
