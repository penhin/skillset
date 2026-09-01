import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { SkillsetService } from "../src/skillset-service.js";

const run = promisify(execFile);

test("configures a Remote Skills Repository through Git and selects its Skills", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "skillset-remote-test-"));
  const repository = path.join(workspace, "repository");
  const remoteRepository = path.join(workspace, "remote.git");
  const stateRoot = path.join(workspace, "state");
  try {
    await run("git", ["init", "--quiet", repository]);
    await run("git", ["config", "user.email", "test@example.com"], { cwd: repository });
    await run("git", ["config", "user.name", "Skillset test"], { cwd: repository });
    await mkdir(path.join(repository, "review"), { recursive: true });
    await writeFile(path.join(repository, "review", "SKILL.md"), "remote review", "utf8");
    await run("git", ["add", "."], { cwd: repository });
    await run("git", ["commit", "--quiet", "-m", "initial skills"], { cwd: repository });
    await run("git", ["init", "--bare", "--quiet", remoteRepository]);
    await run("git", ["remote", "add", "origin", remoteRepository], { cwd: repository });
    await run("git", ["push", "--quiet", "-u", "origin", "HEAD"], { cwd: repository });

    const service = new SkillsetService({ stateRoot, environment: "windows" });
    await service.initialize();
    const remote = await service.configureRemote(remoteRepository);

    assert.equal(remote.url, remoteRepository);
    assert.match(remote.revision, /^[0-9a-f]{40}$/);
    assert.equal((await service.selectedSkills()).length, 1);
    const shared = JSON.parse(await readFile(path.join(remote.sourcePath, "skillset.json"), "utf8"));
    assert.equal(shared.remote.sourcePath, ".");
    assert.equal(shared.selectedSkills[0].source, "remote");
    await assert.rejects(service.updateRemote(), /requires a review/i);
    assert.deepEqual(await service.previewRemoteUpdate(), {
      currentRevision: remote.revision,
      availableRevision: remote.revision,
      summary: [],
    });
    await unlink(path.join(stateRoot, "environments", "windows", "pending-remote-review.json"));
    await assert.rejects(service.updateRemote(), /requires a review/i);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("discovers Skills from a configured nested remote Skills path", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "skillset-remote-path-test-"));
  const repository = path.join(workspace, "repository");
  const remoteRepository = path.join(workspace, "remote.git");
  const stateRoot = path.join(workspace, "state");
  try {
    await run("git", ["init", "--quiet", repository]);
    await run("git", ["config", "user.email", "test@example.com"], { cwd: repository });
    await run("git", ["config", "user.name", "Skillset test"], { cwd: repository });
    await mkdir(path.join(repository, ".agents", "skills", "review"), { recursive: true });
    await writeFile(path.join(repository, ".agents", "skills", "review", "SKILL.md"), "nested remote review", "utf8");
    await run("git", ["add", "."], { cwd: repository });
    await run("git", ["commit", "--quiet", "-m", "nested skills"], { cwd: repository });
    await run("git", ["init", "--bare", "--quiet", remoteRepository]);
    await run("git", ["remote", "add", "origin", remoteRepository], { cwd: repository });
    await run("git", ["push", "--quiet", "-u", "origin", "HEAD"], { cwd: repository });
    const service = new SkillsetService({ stateRoot, environment: "windows" });
    await service.initialize();

    const remote = await service.configureRemote(remoteRepository, ".agents/skills");

    assert.equal(remote.skillsPath, ".agents/skills");
    assert.equal((await service.selectedSkills())[0].identity.name, "review");
    const secondDevice = new SkillsetService({ stateRoot: path.join(workspace, "second-device"), environment: "windows" });
    await secondDevice.initialize();
    await secondDevice.configureRemote(remoteRepository);
    assert.match((await secondDevice.selectedSkills())[0].identity.sourcePath, /\.agents[\\/]skills[\\/]review$/);
    const cliStateRoot = path.join(workspace, "cli-state");
    await run(process.execPath, ["--import", "tsx", "src/cli.ts", "init", "--state-root", cliStateRoot, "--environment", "windows"]);
    const configuredByCli = await run(process.execPath, ["--import", "tsx", "src/cli.ts", "remote", "configure", remoteRepository, "--skills-path", ".agents/skills", "--state-root", cliStateRoot, "--environment", "windows"]);
    assert.equal(JSON.parse(configuredByCli.stdout).skillsPath, ".agents/skills");
    const invalidPathService = new SkillsetService({ stateRoot: path.join(workspace, "invalid-path"), environment: "windows" });
    await invalidPathService.initialize();
    await assert.rejects(
      invalidPathService.configureRemote(remoteRepository, "../outside"),
      /relative path inside/i,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
