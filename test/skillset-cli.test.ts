import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);

test("initializes and diagnoses a local Skillset through the CLI", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "skillset-cli-test-"));

  try {
    const init = await run(process.execPath, [
      "--import",
      "tsx",
      "src/cli.ts",
      "init",
      "--state-root",
      stateRoot,
      "--environment",
      "windows",
    ]);
    assert.match(init.stdout, /Initialized Skillset for windows\./);

    const doctor = await run(process.execPath, [
      "--import",
      "tsx",
      "src/cli.ts",
      "doctor",
      "--state-root",
      stateRoot,
      "--environment",
      "windows",
    ]);
    assert.deepEqual(JSON.parse(doctor.stdout), {
      ready: true,
      environment: "windows",
      hasSkillset: true,
      hasEnvironmentState: true,
      configurationPath: path.join(stateRoot, "skillset.json"),
      environmentStatePath: path.join(stateRoot, "environments", "windows"),
    });
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("adds and removes several discovered Skills through the CLI without changing source files", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "skillset-cli-test-"));
  const stateRoot = path.join(workspace, "state");
  const skillDirectory = path.join(workspace, "home", ".agents", "skills", "review");
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(path.join(skillDirectory, "SKILL.md"), "review workflow", "utf8");
  const environment = { ...process.env, SKILLSET_HOME: path.join(workspace, "home") };
  const command = (arguments_: string[]) =>
    run(process.execPath, ["--import", "tsx", "src/cli.ts", ...arguments_], { env: environment });

  try {
    await command(["init", "--state-root", stateRoot, "--environment", "windows"]);
    const added = await command(["add", "review", "--state-root", stateRoot, "--environment", "windows"]);
    assert.match(added.stdout, /Added 1 Skill/);

    const listed = await command(["skills", "list", "--state-root", stateRoot, "--environment", "windows"]);
    assert.equal(JSON.parse(listed.stdout)[0].selected, true);

    await command(["remove", "review", "--state-root", stateRoot, "--environment", "windows"]);
    const afterRemoval = await command(["skills", "list", "--state-root", stateRoot, "--environment", "windows"]);
    assert.equal(JSON.parse(afterRemoval.stdout)[0].selected, false);
    assert.equal(await readFile(path.join(skillDirectory, "SKILL.md"), "utf8"), "review workflow");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
