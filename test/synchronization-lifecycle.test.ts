import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { SkillsetService, type SkillDiscoveryAdapter } from "../src/skillset-service.js";

test("synchronizes selected Skills recoverably and preserves Local Skills", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "skillset-sync-test-"));
  const stateRoot = path.join(workspace, "state");
  const sourceRoot = path.join(workspace, "source");
  const targetRoot = path.join(workspace, "target");
  await writeSkill(sourceRoot, "review", "managed review");
  await writeSkill(targetRoot, "review", "original review");
  await writeSkill(targetRoot, "local", "keep me");
  const service = new SkillsetService({ stateRoot, environment: "windows" });
  const source: SkillDiscoveryAdapter = { id: "source", skillDirectories: [sourceRoot] };
  const target: SkillDiscoveryAdapter = { id: "codex", skillDirectories: [targetRoot] };

  try {
    await service.initialize();
    await service.addSkills(await service.discoverSkills([source]));
    await service.setTargetAgents([target.id]);

    const preview = await service.synchronize([target], { dryRun: true });
    assert.equal(preview.dryRun, true);
    assert.equal(preview.targets[0].actions[0].kind, "replace");
    assert.equal(await readFile(path.join(targetRoot, "review", "SKILL.md"), "utf8"), "original review");

    const synchronized = await service.synchronize([target]);
    assert.equal(synchronized.targets[0].status, "synchronized");
    assert.equal(await readFile(path.join(targetRoot, "review", "SKILL.md"), "utf8"), "managed review");
    assert.equal(await readFile(path.join(targetRoot, "local", "SKILL.md"), "utf8"), "keep me");

    const managed = await service.status([target]);
    assert.deepEqual(managed.targets[0].skills.map((skill) => skill.state), ["local", "managed"]);

    await service.removeSkills((await service.selectedSkills()).map((skill) => skill.identity));
    await service.synchronize([target]);
    assert.equal(await readFile(path.join(targetRoot, "review", "SKILL.md"), "utf8"), "original review");
    assert.equal(await readFile(path.join(targetRoot, "local", "SKILL.md"), "utf8"), "keep me");

  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("reports drift, unavailable targets, and retains successful updates when a target fails", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "skillset-sync-test-"));
  const stateRoot = path.join(workspace, "state");
  const sourceRoot = path.join(workspace, "source");
  const goodRoot = path.join(workspace, "good");
  await writeSkill(sourceRoot, "review", "managed review");
  await mkdir(goodRoot, { recursive: true });
  const service = new SkillsetService({ stateRoot, environment: "windows" });
  const source: SkillDiscoveryAdapter = { id: "source", skillDirectories: [sourceRoot] };
  const good: SkillDiscoveryAdapter = { id: "codex", skillDirectories: [goodRoot] };
  const unavailable: SkillDiscoveryAdapter = { id: "claude-code", skillDirectories: [path.join(workspace, "absent")] };

  try {
    await service.initialize();
    await service.addSkills(await service.discoverSkills([source]));
    await service.setTargetAgents([good.id, unavailable.id]);
    const result = await service.synchronize([good, unavailable]);
    assert.equal(result.targets[0].status, "synchronized");
    assert.equal(result.targets[1].status, "unavailable");
    await writeSkill(goodRoot, "review", "changed locally");
    const status = await service.status([good, unavailable]);
    assert.equal(status.targets[0].skills.find((skill) => skill.name === "review")?.state, "drifted");
    assert.equal(status.targets[1].status, "unavailable");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

async function writeSkill(root: string, name: string, content: string): Promise<void> {
  const directory = path.join(root, name);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "SKILL.md"), content, "utf8");
}
