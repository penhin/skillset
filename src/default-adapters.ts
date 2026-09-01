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
    { id: "claude-code", skillDirectories: [path.join(homeDirectory, ".claude", "skills")] },
    { id: "gemini-cli", skillDirectories: [path.join(homeDirectory, ".gemini", "skills")] },
    { id: "github-copilot-cli", skillDirectories: [path.join(homeDirectory, ".copilot", "skills")] },
    { id: "cursor", skillDirectories: [path.join(homeDirectory, ".cursor", "skills")] },
    {
      id: "pi",
      skillDirectories: [path.join(homeDirectory, ".agents", "skills")],
    },
    { id: "opencode", skillDirectories: [path.join(homeDirectory, ".config", "opencode", "skills")] },
    { id: "cline", skillDirectories: [path.join(homeDirectory, ".cline", "skills")] },
    { id: "roo-code", skillDirectories: [path.join(homeDirectory, ".roo", "skills")] },
    { id: "windsurf", skillDirectories: [path.join(homeDirectory, ".codeium", "windsurf", "skills")] },
    { id: "hermes-agent", skillDirectories: [path.join(homeDirectory, ".hermes", "skills")] },
  ];
}
