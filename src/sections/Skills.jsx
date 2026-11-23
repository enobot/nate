import Reveal from "../components/Reveal.jsx";
import Section from "../components/Section.jsx";
import SkillsLoadout from "../components/SkillsLoadout.jsx";
import { profile } from "../data/profile.js";

export default function Skills() {
  return (
    <Section
      id="skills"
      index="02"
      kicker="Loadout"
      title="Skills"
      intro="Pick a category to see its skills. Tags show where each skill was used: on the job, in coursework, or in a project."
    >
      <Reveal>
        <SkillsLoadout categories={profile.skills} evidence={profile.evidence} />
      </Reveal>
    </Section>
  );
}
