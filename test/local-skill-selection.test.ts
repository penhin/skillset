import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  SkillsetService,
  type SkillDiscoveryAdapter,
} from "../src/skillset-service.js";

test("keeps same-named discovered Skills distinct and materializes selected Skills locally", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "skillset-selection-test-"));
  const stateRoot = path.join(workspace, "state");
  const codexSkills = path.join(workspace, "codex", "skills");
  const claudeSkills = path.join(workspace, "claude", "skills");
  await writeSkill(codexSkills, "review", "Codex review workflow");
  await writeSkill(claudeSkills, "review", "Claude review workflow");
  const service = new SkillsetService({ stateRoot, environment: "windows" });
  const adapters: SkillDiscoveryAdapter[] = [
    { id: "codex", skillDirectories: [codexSkills] },
    { id: "claude-code", skillDirectories: [claudeSkills] },
  ];

  try {
    await service.initialize();
    const candidates = await service.discoverSkills(adapters);

    assert.equal(candidates.length, 2);
    assert.equal(candidates[0].identity.name, "review");
    assert.notEqual(
      candidates[0].identity.contentFingerprint,
      candidates[1].identity.contentFingerprint,
    );

    await service.addSkills(candidates);

    const selected = await service.selectedSkills();
    assert.deepEqual(
      selected.map((skill) => skill.identity),
      candidates.map((skill) => skill.identity),
    );
    assert.equal(
      await readFile(selected[0].managedSourcePath, "utf8"),
      await readFile(candidates[0].skillFilePath, "utf8"),
    );

    await service.removeSkills([candidates[0].identity]);

    assert.deepEqual(
      (await service.selectedSkills()).map((skill) => skill.identity),
      [candidates[1].identity],
    );
    assert.equal(
      await readFile(path.join(codexSkills, "review", "SKILL.md"), "utf8"),
      "Codex review workflow",
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

async function writeSkill(root: string, name: string, content: string): Promise<void> {
  const skillDirectory = path.join(root, name);
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(path.join(skillDirectory, "SKILL.md"), content, "utf8");
}
