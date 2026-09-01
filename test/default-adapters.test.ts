import assert from "node:assert/strict";
import test from "node:test";

import { defaultSkillDiscoveryAdapters } from "../src/default-adapters.js";

test("provides every v1 Supported Coding Agent as an explicit adapter", () => {
  assert.deepEqual(
    defaultSkillDiscoveryAdapters("/home/test").map((adapter) => adapter.id),
    ["codex", "claude-code", "gemini-cli", "github-copilot-cli", "cursor", "pi", "opencode", "cline", "roo-code", "windsurf", "hermes-agent"],
  );
});
