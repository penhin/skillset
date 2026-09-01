#!/usr/bin/env node

import os from "node:os";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import path from "node:path";

import { defaultSkillDiscoveryAdapters } from "./default-adapters.js";
import {
  SkillsetService,
  type ExecutionEnvironment,
} from "./skillset-service.js";

interface CommandOptions {
  command: "init" | "doctor" | "skills-list" | "skills-search" | "add" | "remove" | "agents-list" | "agents-add" | "agents-remove" | "remote-configure" | "remote-list" | "remote-update" | "remote-resolve" | "status" | "sync" | "reset";
  values: string[];
  environment: ExecutionEnvironment;
  stateRoot: string;
  dryRun: boolean;
  yes: boolean;
}

function usage(): string {
  return [
    "Usage: skillset <init|doctor|agents|skills|add|remove|remote|status|sync|reset> [options]",
    "",
    "Options:",
    "  --environment <windows|wsl>  Execution environment to inspect.",
    "  --state-root <path>           Local Skillset state directory.",
    "  --dry-run                     Show synchronization actions without writing.",
    "  --yes                         Confirm a destructive operation.",
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
  let dryRun = false;
  let yes = false;

  const values: string[] = [];
  for (let index = 0; index < rawArguments.length; index += 1) {
    const argument = rawArguments[index];
    if (argument === "--dry-run") { dryRun = true; continue; }
    if (argument === "--yes") { yes = true; continue; }
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
  return { command, values: command.startsWith("skills-") || command.startsWith("agents-") || command.startsWith("remote-") ? values.slice(1) : values, environment, stateRoot, dryRun, yes };
}

function resolveCommand(
  topLevelCommand: string,
  values: readonly string[],
): CommandOptions["command"] {
  if (topLevelCommand === "init" || topLevelCommand === "doctor" || topLevelCommand === "add" || topLevelCommand === "remove" || topLevelCommand === "status" || topLevelCommand === "sync" || topLevelCommand === "reset") {
    return topLevelCommand;
  }
  if (topLevelCommand === "skills" && values[0] === "list") return "skills-list";
  if (topLevelCommand === "skills" && values[0] === "search") return "skills-search";
  if (topLevelCommand === "agents" && values[0] === "list") return "agents-list";
  if (topLevelCommand === "agents" && values[0] === "add") return "agents-add";
  if (topLevelCommand === "agents" && values[0] === "remove") return "agents-remove";
  if (topLevelCommand === "remote" && values[0] === "configure") return "remote-configure";
  if (topLevelCommand === "remote" && values[0] === "list") return "remote-list";
  if (topLevelCommand === "remote" && values[0] === "update") return "remote-update";
  if (topLevelCommand === "remote" && values[0] === "resolve") return "remote-resolve";
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
  if (options.command === "remote-configure") {
    if (options.values.length !== 1) throw new Error("remote configure requires one repository URL or path.");
    process.stdout.write(`${JSON.stringify(await service.configureRemote(options.values[0]))}\n`);
    return;
  }
  if (options.command === "remote-list") {
    process.stdout.write(`${JSON.stringify(await service.remoteStatus())}\n`);
    return;
  }
  if (options.command === "remote-update") {
    const preview = await service.previewRemoteUpdate();
    if (!options.yes) { process.stdout.write(`${JSON.stringify(preview)}\n`); return; }
    process.stdout.write(`${JSON.stringify(await service.updateRemote())}\n`);
    return;
  }
  if (options.command === "remote-resolve") {
    const [name, resolution] = options.values;
    if (!name || (resolution !== "remove" && resolution !== "retain")) throw new Error("remote resolve requires <Skill name> <remove|retain>.");
    const skill = uniqueSkillNamed(await service.selectedSkills(), name);
    await service.resolveMissingRemoteSkill(skill.identity, resolution);
    process.stdout.write(`Recorded ${resolution} decision for ${name}.\n`);
    return;
  }
  if (options.command === "agents-list") {
    const selected = new Set(await service.selectedTargetAgents());
    const available = new Set(await service.discoverAvailableTargetAgents(adapters));
    process.stdout.write(`${JSON.stringify(adapters.filter((adapter) => available.has(adapter.id) || selected.has(adapter.id)).map((adapter) => ({ id: adapter.id, selected: selected.has(adapter.id), available: available.has(adapter.id) })))}\n`);
    return;
  }
  if (options.command === "agents-add" || options.command === "agents-remove") {
    if (options.values.length === 0) throw new Error(`agents ${options.command === "agents-add" ? "add" : "remove"} requires one or more agent IDs.`);
    const validIds = new Set(adapters.map((adapter) => adapter.id));
    const availableIds = new Set(await service.discoverAvailableTargetAgents(adapters));
    for (const id of options.values) {
      if (!validIds.has(id)) throw new Error(`Unsupported Coding Agent: ${id}.`);
      if (options.command === "agents-add" && !availableIds.has(id)) throw new Error(`Coding Agent ${id} is not discovered in this Execution environment.`);
    }
    const selected = new Set(await service.selectedTargetAgents());
    for (const id of options.values) options.command === "agents-add" ? selected.add(id) : selected.delete(id);
    await service.setTargetAgents([...selected]);
    process.stdout.write(`${options.command === "agents-add" ? "Selected" : "Removed"} ${options.values.length} Target Coding Agent(s).\n`);
    return;
  }
  if (options.command === "status") {
    process.stdout.write(`${JSON.stringify(await service.status(adapters))}\n`);
    return;
  }
  if (options.command === "sync" || options.command === "reset") {
    const preview = options.command === "reset" ? await service.reset(adapters, { dryRun: true }) : await service.synchronize(adapters, { dryRun: true });
    if (options.dryRun) { process.stdout.write(`${JSON.stringify(preview)}\n`); return; }
    if (!options.yes && !(await confirm("Apply this synchronization plan? [y/N] "))) {
      process.stdout.write("Synchronization cancelled.\n");
      return;
    }
    const result = options.command === "reset" ? await service.reset(adapters) : await service.synchronize(adapters);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (options.command === "skills-list") {
    const selectedKeys = new Set(
      (await service.selectedSkills()).map((skill) => JSON.stringify(skill.identity)),
    );
    const candidates = await service.discoverSkills(adapters);
    process.stdout.write(
      `${JSON.stringify(candidates.map((skill) => ({ ...skill, selected: selectedKeys.has(JSON.stringify(skill.identity)) })))}\n`,
    );
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

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await prompt.question(question)).trim().toLocaleLowerCase() === "y"; }
  finally { prompt.close(); }
}

function uniqueSkillNamed<T extends { identity: { name: string; sourcePath: string } }>(
  candidates: readonly T[],
  name: string,
): T {
  const [skillName, sourcePath] = name.split("@", 2);
  const matches = candidates.filter(
    (candidate) =>
      candidate.identity.name === skillName &&
      (sourcePath === undefined || candidate.identity.sourcePath === sourcePath),
  );
  if (matches.length === 0) throw new Error(`No discovered Skill named ${name}.`);
  if (matches.length > 1) throw new Error(`Skill name ${name} is ambiguous; use name@sourcePath from skills search.`);
  return matches[0];
}

if (process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("cli.js")) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
