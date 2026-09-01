#!/usr/bin/env node

import os from "node:os";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { defaultSkillDiscoveryAdapters } from "./default-adapters.js";
import {
  SkillsetService,
  type ExecutionEnvironment,
} from "./skillset-service.js";

interface CommandOptions {
  command: "init" | "doctor" | "skills-list" | "skills-search" | "add" | "remove";
  values: string[];
  environment: ExecutionEnvironment;
  stateRoot: string;
}

function usage(): string {
  return [
    "Usage: skillset <init|doctor|skills|add|remove> [options]",
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
  const [topLevelCommand, ...rawArguments] = arguments_;
  if (!topLevelCommand) {
    throw new Error(usage());
  }

  let environment = defaultEnvironment();
  let stateRoot = defaultStateRoot(environment);

  const values: string[] = [];
  for (let index = 0; index < rawArguments.length; index += 1) {
    const argument = rawArguments[index];
    if (argument !== "--environment" && argument !== "--state-root") {
      values.push(argument);
      continue;
    }
    const value = rawArguments[index + 1];
    if (!value) {
      throw new Error(usage());
    }

    if (argument === "--environment") {
      if (value !== "windows" && value !== "wsl") {
        throw new Error("--environment must be windows or wsl.");
      }
      environment = value;
      if (!rawArguments.includes("--state-root")) {
        stateRoot = defaultStateRoot(environment);
      }
    } else {
      stateRoot = value;
    }
    index += 1;
  }

  const command = resolveCommand(topLevelCommand, values);
  return { command, values: command.startsWith("skills-") ? values.slice(1) : values, environment, stateRoot };
}

function resolveCommand(
  topLevelCommand: string,
  values: readonly string[],
): CommandOptions["command"] {
  if (topLevelCommand === "init" || topLevelCommand === "doctor" || topLevelCommand === "add" || topLevelCommand === "remove") {
    return topLevelCommand;
  }
  if (topLevelCommand === "skills" && values[0] === "list") return "skills-list";
  if (topLevelCommand === "skills" && values[0] === "search") return "skills-search";
  throw new Error(usage());
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

  if (options.command === "doctor") {
    process.stdout.write(`${JSON.stringify(await service.doctor())}\n`);
    return;
  }

  const adapters = defaultSkillDiscoveryAdapters();
  if (options.command === "skills-list") {
    process.stdout.write(`${JSON.stringify(await service.selectedSkills())}\n`);
    return;
  }

  const candidates = await service.discoverSkills(adapters);
  if (options.command === "skills-search") {
    const query = options.values.join(" ");
    if (!query) throw new Error("skills search requires a query.");
    process.stdout.write(`${JSON.stringify(service.searchSkills(candidates, query))}\n`);
    return;
  }

  if (options.values.length === 0) {
    throw new Error(`${options.command} requires one or more Skill names.`);
  }
  if (options.command === "add") {
    const skills = options.values.map((name) => uniqueSkillNamed(candidates, name));
    await service.addSkills(skills);
    process.stdout.write(`Added ${skills.length} Skill(s) to the Skillset.\n`);
    return;
  }

  const selected = await service.selectedSkills();
  const skills = options.values.map((name) => uniqueSkillNamed(selected, name));
  await service.removeSkills(skills.map((skill) => skill.identity));
  process.stdout.write(`Removed ${skills.length} Skill(s) from the Skillset.\n`);
}

function uniqueSkillNamed<T extends { identity: { name: string } }>(
  candidates: readonly T[],
  name: string,
): T {
  const matches = candidates.filter((candidate) => candidate.identity.name === name);
  if (matches.length === 0) throw new Error(`No discovered Skill named ${name}.`);
  if (matches.length > 1) throw new Error(`Skill name ${name} is ambiguous; use skills search to choose a source.`);
  return matches[0];
}

if (process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("cli.js")) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
