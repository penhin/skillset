import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
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
