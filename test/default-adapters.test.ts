import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { defaultSkillDiscoveryAdapters } from "../src/default-adapters.js";

test("provides every v1 Supported Coding Agent as an explicit adapter", () => {
  assert.deepEqual(defaultSkillDiscoveryAdapters("/home/test").map((adapter) => [adapter.id, adapter.skillDirectories[0]]), [
    ["codex", path.join("/home/test", ".agents", "skills")], ["claude-code", path.join("/home/test", ".claude", "skills")], ["gemini-cli", path.join("/home/test", ".gemini", "skills")], ["github-copilot-cli", path.join("/home/test", ".copilot", "skills")], ["cursor", path.join("/home/test", ".cursor", "skills")], ["pi", path.join("/home/test", ".agents", "skills")], ["opencode", path.join("/home/test", ".config", "opencode", "skills")], ["cline", path.join("/home/test", ".cline", "skills")], ["roo-code", path.join("/home/test", ".roo", "skills")], ["windsurf", path.join("/home/test", ".codeium", "windsurf", "skills")], ["hermes-agent", path.join("/home/test", ".hermes", "skills")],
  ]);
});
