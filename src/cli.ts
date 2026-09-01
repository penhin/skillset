#!/usr/bin/env node

import os from "node:os";
import { execFileSync } from "node:child_process";
import path from "node:path";

import {
  SkillsetService,
  type ExecutionEnvironment,
} from "./skillset-service.js";

interface CommandOptions {
  command: "init" | "doctor";
  environment: ExecutionEnvironment;
  stateRoot: string;
}

function usage(): string {
  return [
    "Usage: skillset <init|doctor> [options]",
    "",
    "Options:",
    "  --environment <windows|wsl>  Execution environment to inspect.",
    "  --state-root <path>           Local Skillset state directory.",
  ].join("\n");
}

function defaultEnvironment(): ExecutionEnvironment {
  return process.env.WSL_DISTRO_NAME ? "wsl" : "windows";
}

function defaultStateRoot(environment: ExecutionEnvironment): string {
  if (process.env.SKILLSET_STATE_ROOT) {
    return process.env.SKILLSET_STATE_ROOT;
  }

  if (environment === "windows") {
    return path.join(process.env.LOCALAPPDATA ?? os.homedir(), "Skillset");
  }

  return path.posix.join(toWslPath(windowsLocalAppData()), "Skillset");
}

export function toWslPath(windowsPath: string): string {
  const match = /^([A-Za-z]):[\\/](.+)$/.exec(windowsPath.trim());
  if (!match) {
    throw new Error("Cannot map the Windows Skillset state directory into WSL.");
  }

  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
}

function windowsLocalAppData(): string {
  if (process.env.LOCALAPPDATA) {
    return process.env.LOCALAPPDATA;
  }

  try {
    const location = execFileSync("cmd.exe", ["/d", "/c", "echo", "%LOCALAPPDATA%"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
    if (location && location !== "%LOCALAPPDATA%") {
      return location;
    }
  } catch {
    // The actionable error below keeps WSL from silently creating a second Skillset.
  }

  throw new Error(
    "Cannot find the shared Windows state directory. Set SKILLSET_STATE_ROOT before using Skillset in WSL.",
  );
}

function parseOptions(arguments_: string[]): CommandOptions {
  const [command, ...flags] = arguments_;
  if (command !== "init" && command !== "doctor") {
    throw new Error(usage());
  }

  let environment = defaultEnvironment();
  let stateRoot = defaultStateRoot(environment);

  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    const value = flags[index + 1];
    if ((flag !== "--environment" && flag !== "--state-root") || !value) {
      throw new Error(usage());
    }

    if (flag === "--environment") {
      if (value !== "windows" && value !== "wsl") {
        throw new Error("--environment must be windows or wsl.");
      }
      environment = value;
      if (!flags.includes("--state-root")) {
        stateRoot = defaultStateRoot(environment);
      }
    } else {
      stateRoot = value;
    }
    index += 1;
  }

  return { command, environment, stateRoot };
}

export async function runCli(arguments_: string[]): Promise<void> {
  const options = parseOptions(arguments_);
  const service = new SkillsetService({
    stateRoot: options.stateRoot,
    environment: options.environment,
  });

  if (options.command === "init") {
    await service.initialize();
    process.stdout.write(`Initialized Skillset for ${options.environment}.\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(await service.doctor())}\n`);
}

if (process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("cli.js")) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
