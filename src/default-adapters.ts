import os from "node:os";
import path from "node:path";

import type { SkillDiscoveryAdapter } from "./skillset-service.js";

export function defaultSkillDiscoveryAdapters(
  homeDirectory = process.env.SKILLSET_HOME ?? os.homedir(),
): SkillDiscoveryAdapter[] {
  return [
    {
      id: "codex",
      skillDirectories: [path.join(homeDirectory, ".agents", "skills")],
    },
    {
      id: "pi",
      skillDirectories: [path.join(homeDirectory, ".agents", "skills")],
    },
    {
      id: "claude-code",
      skillDirectories: [path.join(homeDirectory, ".claude", "skills")],
    },
  ];
}
