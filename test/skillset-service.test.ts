import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { SkillsetService } from "../src/skillset-service.js";

test("initializes one local Skillset and reports a ready doctor result", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "skillset-test-"));
  const service = new SkillsetService({ stateRoot, environment: "windows" });

  try {
    await service.initialize();

    const doctor = await service.doctor();

    assert.equal(doctor.ready, true);
    assert.equal(doctor.environment, "windows");
    assert.equal(doctor.hasSkillset, true);
    assert.equal(doctor.hasEnvironmentState, true);
    assert.equal(doctor.configurationPath, path.join(stateRoot, "skillset.json"));
    assert.equal(doctor.environmentStatePath, path.join(stateRoot, "environments", "windows"));
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("shares Skillset configuration while separating Windows and WSL state", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "skillset-test-"));
  const windows = new SkillsetService({ stateRoot, environment: "windows" });
  const wsl = new SkillsetService({ stateRoot, environment: "wsl" });

  try {
    await windows.initialize();

    assert.equal((await windows.doctor()).ready, true);
    assert.deepEqual(await wsl.doctor(), {
      ready: false,
      environment: "wsl",
      hasSkillset: true,
      hasEnvironmentState: false,
      configurationPath: path.join(stateRoot, "skillset.json"),
      environmentStatePath: path.join(stateRoot, "environments", "wsl"),
    });
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("refuses to initialize over a malformed local Skillset configuration", async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "skillset-test-"));
  const service = new SkillsetService({ stateRoot, environment: "windows" });

  try {
    await writeFile(path.join(stateRoot, "skillset.json"), "not json", "utf8");

    await assert.rejects(service.initialize(), /invalid Skillset configuration/i);
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});
