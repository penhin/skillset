import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { SkillsetService } from "../src/skillset-service.js";

const run = promisify(execFile);

test("configures a Remote Skills Repository through Git and selects its Skills", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "skillset-remote-test-"));
  const repository = path.join(workspace, "repository");
  const stateRoot = path.join(workspace, "state");
  try {
    await run("git", ["init", "--quiet", repository]);
    await run("git", ["config", "user.email", "test@example.com"], { cwd: repository });
    await run("git", ["config", "user.name", "Skillset test"], { cwd: repository });
    await mkdir(path.join(repository, "review"), { recursive: true });
    await writeFile(path.join(repository, "review", "SKILL.md"), "remote review", "utf8");
    await run("git", ["add", "."], { cwd: repository });
    await run("git", ["commit", "--quiet", "-m", "initial skills"], { cwd: repository });

    const service = new SkillsetService({ stateRoot, environment: "windows" });
    await service.initialize();
    const remote = await service.configureRemote(repository);

    assert.equal(remote.url, repository);
    assert.match(remote.revision, /^[0-9a-f]{40}$/);
    assert.equal((await service.selectedSkills()).length, 1);
    assert.equal(JSON.parse(await readFile(path.join(remote.sourcePath, "skillset.json"), "utf8")).remote.revision, remote.revision);
    assert.deepEqual(await service.previewRemoteUpdate(), {
      currentRevision: remote.revision,
      availableRevision: remote.revision,
      summary: [],
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
