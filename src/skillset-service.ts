import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const runProcess = promisify(execFile);

export type ExecutionEnvironment = "windows" | "wsl";

export interface SkillsetServiceOptions {
  stateRoot: string;
  environment: ExecutionEnvironment;
}

export interface DoctorResult {
  ready: boolean;
  environment: ExecutionEnvironment;
  hasSkillset: boolean;
  hasEnvironmentState: boolean;
  configurationPath: string;
  environmentStatePath: string;
}

export interface SkillIdentity {
  name: string;
  sourcePath: string;
  contentFingerprint: string;
}

export interface DiscoveredSkill {
  identity: SkillIdentity;
  skillFilePath: string;
}

export interface SelectedSkill {
  identity: SkillIdentity;
  source: "local" | "remote";
  managedSourceRelativePath?: string;
}

export interface SkillDiscoveryAdapter {
  id: string;
  skillDirectories: readonly string[];
}

export type SkillState = "managed" | "local" | "missing" | "drifted";

export interface TargetStatus {
  id: string;
  status: "available" | "unavailable";
  skills: Array<{ name: string; state: SkillState }>;
}

export interface SynchronizationResult {
  dryRun: boolean;
  targets: Array<{
    id: string;
    status: "synchronized" | "unavailable" | "failed" | "planned";
    actions: Array<{ kind: "install" | "replace" | "restore" | "remove"; name: string }>;
    diagnostic?: string;
  }>;
}

export interface RemoteStatus {
  url: string;
  revision: string;
  sourcePath: string;
}

interface LocalSkillsetConfiguration {
  version: 1;
  selectedSkills: SelectedSkill[];
  targetAgentIds: string[];
  remote?: RemoteStatus;
  missingSourceResolutions: Record<string, "remove" | "retain">;
}

interface SnapshotState {
  deployments: Record<string, Record<string, { hadOriginal: boolean; managedFingerprint: string }>>;
}

interface PendingRemoteReview {
  url: string;
  availableRevision: string;
}

export class SkillsetService {
  private readonly configurationPath: string;
  private readonly environmentStatePath: string;

  public constructor(private readonly options: SkillsetServiceOptions) {
    this.configurationPath = path.join(options.stateRoot, "skillset.json");
    this.environmentStatePath = path.join(
      options.stateRoot,
      "environments",
      options.environment,
    );
  }

  public async initialize(): Promise<void> {
    await mkdir(this.environmentStatePath, { recursive: true });

    try {
      await this.readConfiguration();
    } catch (error: unknown) {
      if (!isMissingFile(error)) {
        throw new Error("Invalid Skillset configuration.", { cause: error });
      }

      const configuration: LocalSkillsetConfiguration = {
        version: 1,
        selectedSkills: [],
        targetAgentIds: [],
        missingSourceResolutions: {},
      };
      await writeFile(
        this.configurationPath,
        `${JSON.stringify(configuration, null, 2)}\n`,
        "utf8",
      );
    }
  }

  public async doctor(): Promise<DoctorResult> {
    try {
      const configuration = await this.readConfiguration();
      const hasEnvironmentState = await canAccess(this.environmentStatePath);

      return {
        ready: configuration.version === 1 && hasEnvironmentState,
        environment: this.options.environment,
        hasSkillset: true,
        hasEnvironmentState,
        configurationPath: this.configurationPath,
        environmentStatePath: this.environmentStatePath,
      };
    } catch {
      return {
        ready: false,
        environment: this.options.environment,
        hasSkillset: false,
        hasEnvironmentState: false,
        configurationPath: this.configurationPath,
        environmentStatePath: this.environmentStatePath,
      };
    }
  }

  public async discoverSkills(
    adapters: readonly SkillDiscoveryAdapter[],
  ): Promise<DiscoveredSkill[]> {
    const candidates: DiscoveredSkill[] = [];

    for (const adapter of adapters) {
      for (const skillDirectory of adapter.skillDirectories) {
        const entries = await readSkillDirectories(skillDirectory);
        for (const entry of entries) {
          const sourcePath = path.join(skillDirectory, entry.name);
          const skillFilePath = path.join(sourcePath, "SKILL.md");
          const skillContent = await readFile(skillFilePath, "utf8").catch(() => undefined);
          if (skillContent === undefined) continue;
          const fingerprint = await fingerprintDirectory(sourcePath).catch(() => undefined);
          if (fingerprint === undefined) {
            continue;
          }

          candidates.push({
            identity: {
              name: entry.name,
              sourcePath,
              contentFingerprint: fingerprint,
            },
            skillFilePath,
          });
        }
      }
    }

    const distinctCandidates = new Map(
      candidates.map((candidate) => [identityKey(candidate.identity), candidate]),
    );
    return [...distinctCandidates.values()].sort((left, right) =>
      identityKey(left.identity).localeCompare(identityKey(right.identity)),
    );
  }

  public async addSkills(skills: readonly DiscoveredSkill[]): Promise<void> {
    const configuration = await this.readConfiguration();
    const selectedByIdentity = new Map(
      configuration.selectedSkills.map((skill) => [identityKey(skill.identity), skill]),
    );

    for (const skill of skills) {
      const key = identityKey(skill.identity);
      if (selectedByIdentity.has(key)) {
        continue;
      }

      const managedSourceRelativePath = path.posix.join(
        "managed-sources",
        fingerprint(key),
      );
      const managedSourcePath = path.join(
        this.options.stateRoot,
        ...managedSourceRelativePath.split("/"),
      );
      await mkdir(path.dirname(managedSourcePath), { recursive: true });
      await cp(skill.identity.sourcePath, managedSourcePath, { recursive: true });
      selectedByIdentity.set(key, { identity: skill.identity, source: "local", managedSourceRelativePath });
    }

    await this.writeConfiguration({
      ...configuration,
      selectedSkills: [...selectedByIdentity.values()],
    });
  }

  public searchSkills(
    skills: readonly DiscoveredSkill[],
    query: string,
  ): DiscoveredSkill[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return skills.filter((skill) =>
      [skill.identity.name, skill.identity.sourcePath].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      ),
    );
  }

  public async selectedSkills(): Promise<SelectedSkill[]> {
    return (await this.readConfiguration()).selectedSkills;
  }

  public async removeSkills(identities: readonly SkillIdentity[]): Promise<void> {
    const identitiesToRemove = new Set(identities.map(identityKey));
    const configuration = await this.readConfiguration();
    await this.writeConfiguration({
      ...configuration,
      selectedSkills: configuration.selectedSkills.filter(
        (skill) => !identitiesToRemove.has(identityKey(skill.identity)),
      ),
    });
  }

  public async setTargetAgents(agentIds: readonly string[]): Promise<void> {
    const configuration = await this.readConfiguration();
    await this.writeConfiguration({
      ...configuration,
      targetAgentIds: [...new Set(agentIds)].sort(),
    });
  }

  public async selectedTargetAgents(): Promise<string[]> {
    return (await this.readConfiguration()).targetAgentIds;
  }

  public async configureRemote(url: string): Promise<RemoteStatus> {
    const configuration = await this.readConfiguration();
    if (configuration.remote) throw new Error("A Remote Skills Repository is already configured. Reset it before configuring another.");
    const sourcePath = path.join(this.options.stateRoot, "remote-source");
    await runGit(["clone", "--quiet", url, sourcePath]);
    const revision = await gitRevision(sourcePath);
    const remote = { url, revision, sourcePath };
    const shared = await readConfigurationFile(path.join(sourcePath, "skillset.json")).catch((error: unknown) => isMissingFile(error) ? undefined : Promise.reject(error));
    const skills = await this.discoverSkills([{ id: "remote", skillDirectories: [sourcePath] }]);
    const selectedSkills = shared
      ? hydrateRemoteSkills(shared.selectedSkills, sourcePath)
      : skills.map((skill) => ({ identity: skill.identity, source: "remote" as const }));
    await this.writeConfiguration({ ...configuration, ...shared, selectedSkills, remote });
    const committedRemote = { ...remote, revision: await gitRevision(sourcePath) };
    await writeFile(this.configurationPath, `${JSON.stringify({ ...configuration, ...shared, selectedSkills, remote: committedRemote }, null, 2)}\n`, "utf8");
    return committedRemote;
  }

  public async remoteStatus(): Promise<RemoteStatus | undefined> {
    return (await this.readConfiguration()).remote;
  }

  public async previewRemoteUpdate(): Promise<{ currentRevision: string; availableRevision: string; summary: string[] }> {
    const remote = (await this.readConfiguration()).remote;
    if (!remote) throw new Error("No Remote Skills Repository is configured.");
    await runGit(["fetch", "--quiet", "origin"], remote.sourcePath);
    const availableRevision = await gitRevision(remote.sourcePath, "@{u}");
    const { stdout } = await runGit(["log", "--oneline", `${remote.revision}..${availableRevision}`], remote.sourcePath);
    await writeFile(path.join(this.environmentStatePath, "pending-remote-review.json"), `${JSON.stringify({ url: remote.url, availableRevision } satisfies PendingRemoteReview)}\n`, "utf8");
    return { currentRevision: remote.revision, availableRevision, summary: stdout.trim() ? stdout.trim().split("\n") : [] };
  }

  public async updateRemote(): Promise<RemoteStatus> {
    const configuration = await this.readConfiguration();
    if (!configuration.remote) throw new Error("No Remote Skills Repository is configured.");
    await runGit(["fetch", "--quiet", "origin"], configuration.remote.sourcePath);
    const availableRevision = await gitRevision(configuration.remote.sourcePath, "@{u}");
    const review = await this.readPendingRemoteReview();
    if (!review || review.url !== configuration.remote.url || review.availableRevision !== availableRevision) {
      throw new Error("Remote update requires a review of the current revision. Run `remote update` without --yes, review its summary, then confirm with --yes.");
    }
    await runGit(["reset", "--hard", availableRevision], configuration.remote.sourcePath);
    const candidates = await this.discoverSkills([{ id: "remote", skillDirectories: [configuration.remote.sourcePath] }]);
    const candidatesByName = new Map(candidates.map((candidate) => [candidate.identity.name, candidate]));
    const missing = configuration.selectedSkills.filter((skill) => skill.identity.sourcePath.startsWith(configuration.remote!.sourcePath) && !candidatesByName.has(skill.identity.name));
    const unresolved = missing.filter((skill) => !configuration.missingSourceResolutions[identityKey(skill.identity)]);
    if (unresolved.length > 0) throw new Error(`Selected remote Skills are missing: ${unresolved.map((skill) => skill.identity.name).join(", ")}. Record remove or retain decisions first.`);
    const retainedLocalSkills = configuration.selectedSkills.filter((skill) => skill.source === "local");
    const retainedRemoteSkills = configuration.selectedSkills.map((skill) => {
      if (skill.source !== "remote") return undefined;
      const replacement = candidatesByName.get(skill.identity.name);
      return replacement ? { identity: replacement.identity, source: "remote" as const } : skill;
    }).filter((skill): skill is SelectedSkill => skill !== undefined);
    const selectedSkills = [...retainedLocalSkills, ...retainedRemoteSkills];
    const remote = { ...configuration.remote, revision: availableRevision };
    await this.writeConfiguration({ ...configuration, remote, selectedSkills });
    const committedRemote = { ...remote, revision: await gitRevision(remote.sourcePath) };
    await writeFile(this.configurationPath, `${JSON.stringify({ ...configuration, selectedSkills, remote: committedRemote }, null, 2)}\n`, "utf8");
    return committedRemote;
  }

  public async resolveMissingRemoteSkill(identity: SkillIdentity, resolution: "remove" | "retain"): Promise<void> {
    const configuration = await this.readConfiguration();
    const key = identityKey(identity);
    const missingSourceResolutions = { ...configuration.missingSourceResolutions, [key]: resolution };
    await this.writeConfiguration({
      ...configuration,
      selectedSkills: resolution === "remove" ? configuration.selectedSkills.filter((skill) => identityKey(skill.identity) !== key) : configuration.selectedSkills,
      missingSourceResolutions,
    });
  }

  public async discoverAvailableTargetAgents(adapters: readonly SkillDiscoveryAdapter[]): Promise<string[]> {
    const available = await Promise.all(adapters.map(async (adapter) => ({
      id: adapter.id,
      available: (await Promise.all(adapter.skillDirectories.map((directory) => canAccess(directory)))).some(Boolean),
    })));
    return available.filter((adapter) => adapter.available).map((adapter) => adapter.id);
  }

  public async status(adapters: readonly SkillDiscoveryAdapter[]): Promise<{ targets: TargetStatus[] }> {
    const configuration = await this.readConfiguration();
    const selected = new Set(configuration.targetAgentIds);
    const snapshots = await this.readSnapshots();
    const targets: TargetStatus[] = [];
    for (const adapter of adapters.filter((candidate) => selected.has(candidate.id))) {
      const directory = adapter.skillDirectories[0];
      if (!directory || !(await canAccess(directory))) {
        targets.push({ id: adapter.id, status: "unavailable", skills: [] });
        continue;
      }
      const desired = new Map(configuration.selectedSkills.map((skill) => [skill.identity.name, skill]));
      const entries = await readSkillDirectories(directory);
      const states: Array<{ name: string; state: SkillState }> = [];
      for (const entry of entries) {
        const name = entry.name;
        const selectedSkill = desired.get(name);
        if (!selectedSkill) {
          states.push({ name, state: "local" });
          continue;
        }
        const current = await fingerprintDirectory(path.join(directory, name));
        states.push({ name, state: current === selectedSkill.identity.contentFingerprint ? "managed" : "drifted" });
      }
      for (const name of desired.keys()) {
        if (!entries.some((entry) => entry.name === name)) states.push({ name, state: "missing" });
      }
      targets.push({ id: adapter.id, status: "available", skills: states.sort((left, right) => left.name.localeCompare(right.name)) });
    }
    // Snapshots are deliberately retained per environment; reading them here validates their shape before restore.
    void snapshots;
    return { targets };
  }

  public async synchronize(
    adapters: readonly SkillDiscoveryAdapter[],
    options: { dryRun?: boolean } = {},
  ): Promise<SynchronizationResult> {
    const configuration = await this.readConfiguration();
    return this.synchronizeConfiguration(adapters, configuration, options);
  }

  private async synchronizeConfiguration(
    adapters: readonly SkillDiscoveryAdapter[],
    configuration: LocalSkillsetConfiguration,
    options: { dryRun?: boolean },
  ): Promise<SynchronizationResult> {
    const selected = new Set(configuration.targetAgentIds);
    const snapshots = await this.readSnapshots();
    const results: SynchronizationResult["targets"] = [];
    for (const adapter of adapters.filter((candidate) => selected.has(candidate.id))) {
      const directory = adapter.skillDirectories[0];
      if (!directory || !(await canAccess(directory))) {
        results.push({ id: adapter.id, status: "unavailable", actions: [], diagnostic: "Target Coding Agent is unavailable in this Execution environment." });
        continue;
      }
      try {
        const actions = await this.planTarget(adapter.id, directory, configuration, snapshots);
        if (!options.dryRun) await this.applyTarget(adapter.id, directory, configuration, snapshots, actions);
        results.push({ id: adapter.id, status: options.dryRun ? "planned" : "synchronized", actions });
      } catch (error) {
        results.push({ id: adapter.id, status: "failed", actions: [], diagnostic: error instanceof Error ? error.message : String(error) });
      }
    }
    if (!options.dryRun) await this.writeSnapshots(snapshots);
    return { dryRun: options.dryRun ?? false, targets: results };
  }

  public async reset(adapters: readonly SkillDiscoveryAdapter[], options: { dryRun?: boolean } = {}): Promise<SynchronizationResult> {
    const configuration = await this.readConfiguration();
    if (options.dryRun) return this.synchronizeConfiguration(adapters, { ...configuration, selectedSkills: [] }, options);
    const selected = new Set(configuration.targetAgentIds);
    const availableIds = new Set(await this.discoverAvailableTargetAgents(adapters));
    const unavailable = adapters.filter((adapter) => selected.has(adapter.id) && !availableIds.has(adapter.id));
    if (unavailable.length > 0) {
      throw new Error(`Cannot reset while Target Coding Agents are unavailable: ${unavailable.map((adapter) => adapter.id).join(", ")}. Their Original-state snapshots are preserved for restoration.`);
    }
    await this.writeConfiguration({ ...configuration, selectedSkills: [] });
    const result = await this.synchronize(adapters);
    if (result.targets.some((target) => target.status === "failed" || target.status === "unavailable")) {
      return result;
    }
    await rm(this.options.stateRoot, { recursive: true, force: true });
    return result;
  }

  private async planTarget(
    agentId: string,
    directory: string,
    configuration: LocalSkillsetConfiguration,
    snapshots: SnapshotState,
  ): Promise<SynchronizationResult["targets"][number]["actions"]> {
    const desired = new Map(configuration.selectedSkills.map((skill) => [skill.identity.name, skill]));
    if (desired.size !== configuration.selectedSkills.length) throw new Error("Cannot synchronize distinct selected Skills with the same name to one Coding Agent.");
    const previous = snapshots.deployments[agentId] ?? {};
    const actions: SynchronizationResult["targets"][number]["actions"] = [];
    for (const [name] of Object.entries(previous)) {
      if (!desired.has(name)) actions.push({ kind: previous[name].hadOriginal ? "restore" : "remove", name });
    }
    for (const [name] of desired) {
      const exists = await canAccess(path.join(directory, name));
      const state = previous[name];
      if (!state) actions.push({ kind: exists ? "replace" : "install", name });
      else {
        const current = await fingerprintDirectory(path.join(directory, name)).catch(() => undefined);
        if (current !== desired.get(name)?.identity.contentFingerprint) actions.push({ kind: exists ? "replace" : "install", name });
      }
    }
    return actions;
  }

  private async applyTarget(agentId: string, directory: string, configuration: LocalSkillsetConfiguration, snapshots: SnapshotState, actions: SynchronizationResult["targets"][number]["actions"]): Promise<void> {
    const desired = new Map(configuration.selectedSkills.map((skill) => [skill.identity.name, skill]));
    const deployments = (snapshots.deployments[agentId] ??= {});
    for (const action of actions) {
      const target = path.join(directory, action.name);
      const snapshot = path.join(this.environmentStatePath, "snapshots", agentId, action.name);
      if (action.kind === "restore") {
        if (!(await canAccess(path.join(snapshot, "SKILL.md")))) {
          throw new Error(`Original-state snapshot for ${action.name} is incomplete; restoration is blocked to preserve the Managed Skill.`);
        }
        await rm(target, { recursive: true, force: true });
        await cp(snapshot, target, { recursive: true });
        delete deployments[action.name];
      } else if (action.kind === "remove") {
        await rm(target, { recursive: true, force: true });
        delete deployments[action.name];
      } else {
        const hadOriginal = await canAccess(target);
        if (!deployments[action.name]) {
          deployments[action.name] = { hadOriginal, managedFingerprint: desired.get(action.name)?.identity.contentFingerprint ?? "" };
          if (hadOriginal) {
            await mkdir(path.dirname(snapshot), { recursive: true });
            await cp(target, snapshot, { recursive: true });
          }
        }
        await rm(target, { recursive: true, force: true });
        const selectedSkill = desired.get(action.name);
        if (!selectedSkill) throw new Error(`Selected Skill ${action.name} disappeared during synchronization.`);
        await cp(this.sourcePathFor(selectedSkill), target, { recursive: true });
        deployments[action.name].managedFingerprint = selectedSkill.identity.contentFingerprint;
      }
    }
  }

  private async readConfiguration(): Promise<LocalSkillsetConfiguration> {
    const rawConfiguration = await readFile(this.configurationPath, "utf8");
    const configuration = JSON.parse(rawConfiguration) as Partial<LocalSkillsetConfiguration>;
    if (configuration.version !== 1) {
      throw new Error("Unsupported Skillset configuration version.");
    }

    return {
      version: 1,
      selectedSkills: Array.isArray(configuration.selectedSkills) ? configuration.selectedSkills.map(normalizeSelectedSkill) : [],
      targetAgentIds: Array.isArray(configuration.targetAgentIds) ? configuration.targetAgentIds : [],
      remote: isRemoteStatus(configuration.remote) ? configuration.remote : undefined,
      missingSourceResolutions: typeof configuration.missingSourceResolutions === "object" && configuration.missingSourceResolutions !== null ? configuration.missingSourceResolutions : {},
    };
  }

  private async writeConfiguration(configuration: LocalSkillsetConfiguration): Promise<void> {
    const serialized = `${JSON.stringify(configuration, null, 2)}\n`;
    await writeFile(
      this.configurationPath,
      serialized,
      "utf8",
    );
    if (configuration.remote) {
      const shared: LocalSkillsetConfiguration = {
        ...configuration,
        remote: { ...configuration.remote, sourcePath: "." },
        selectedSkills: configuration.selectedSkills.map((skill) => skill.source === "remote" ? { ...skill, identity: { ...skill.identity, sourcePath: skill.identity.name } } : skill),
      };
      await writeFile(path.join(configuration.remote.sourcePath, "skillset.json"), `${JSON.stringify(shared, null, 2)}\n`, "utf8");
      await commitSharedConfiguration(configuration.remote.sourcePath);
    }
  }

  private sourcePathFor(skill: SelectedSkill): string {
    if (skill.source === "remote") return skill.identity.sourcePath;
    if (!skill.managedSourceRelativePath) throw new Error(`Local managed source for ${skill.identity.name} is missing.`);
    return path.join(this.options.stateRoot, ...skill.managedSourceRelativePath.split("/"));
  }

  private async readSnapshots(): Promise<SnapshotState> {
    try {
      const raw = await readFile(path.join(this.environmentStatePath, "snapshots.json"), "utf8");
      const parsed = JSON.parse(raw) as Partial<SnapshotState>;
      return { deployments: parsed.deployments ?? {} };
    } catch (error) {
      if (isMissingFile(error)) return { deployments: {} };
      throw new Error("Invalid local Original-state snapshot.", { cause: error });
    }
  }

  private async writeSnapshots(snapshots: SnapshotState): Promise<void> {
    await writeFile(path.join(this.environmentStatePath, "snapshots.json"), `${JSON.stringify(snapshots, null, 2)}\n`, "utf8");
  }

  private async readPendingRemoteReview(): Promise<PendingRemoteReview | undefined> {
    try {
      return JSON.parse(await readFile(path.join(this.environmentStatePath, "pending-remote-review.json"), "utf8")) as PendingRemoteReview;
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      throw new Error("Invalid pending Remote Skills Repository review.", { cause: error });
    }
  }
}

async function runGit(arguments_: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  try {
    return await runProcess("git", arguments_, { cwd, windowsHide: true });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Git could not complete the Remote Skills Repository operation: ${detail}`, { cause: error });
  }
}

async function gitRevision(directory: string, ref = "HEAD"): Promise<string> {
  return (await runGit(["rev-parse", ref], directory)).stdout.trim();
}

async function commitSharedConfiguration(directory: string): Promise<void> {
  await runGit(["add", "skillset.json"], directory);
  const { stdout } = await runGit(["status", "--porcelain"], directory);
  if (!stdout.trim()) return;
  await runGit(["-c", "user.name=Skillset", "-c", "user.email=skillset@local", "commit", "--quiet", "-m", "chore: update shared Skillset configuration"], directory);
  await runGit(["push", "origin", "HEAD"], directory);
}

async function readConfigurationFile(filePath: string): Promise<LocalSkillsetConfiguration> {
  const raw = await readFile(filePath, "utf8");
  const configuration = JSON.parse(raw) as Partial<LocalSkillsetConfiguration>;
  if (configuration.version !== 1) throw new Error("Unsupported Skillset configuration version.");
  return {
    version: 1,
    selectedSkills: Array.isArray(configuration.selectedSkills) ? configuration.selectedSkills.map(normalizeSelectedSkill) : [],
    targetAgentIds: Array.isArray(configuration.targetAgentIds) ? configuration.targetAgentIds : [],
    remote: isRemoteStatus(configuration.remote) ? configuration.remote : undefined,
    missingSourceResolutions: typeof configuration.missingSourceResolutions === "object" && configuration.missingSourceResolutions !== null ? configuration.missingSourceResolutions : {},
  };
}

function normalizeSelectedSkill(skill: SelectedSkill): SelectedSkill {
  return { ...skill, source: skill.source === "remote" ? "remote" : "local" };
}

function hydrateRemoteSkills(skills: SelectedSkill[], sourcePath: string): SelectedSkill[] {
  return skills.map((skill) => skill.source === "remote"
    ? { ...skill, source: "remote", identity: { ...skill.identity, sourcePath: path.join(sourcePath, skill.identity.name) } }
    : skill);
}

function isRemoteStatus(value: unknown): value is RemoteStatus {
  return typeof value === "object" && value !== null && "url" in value && "revision" in value && "sourcePath" in value;
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function canAccess(location: string): Promise<boolean> {
  try {
    await access(location);
    return true;
  } catch {
    return false;
  }
}

async function readSkillDirectories(directory: string) {
  try {
    return (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  } catch {
    return [];
  }
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function fingerprintDirectory(directory: string): Promise<string> {
  const files: string[] = [];
  async function visit(currentDirectory: string, relativeDirectory: string): Promise<void> {
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const fullPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) await visit(fullPath, relativePath);
      else if (entry.isFile()) files.push(`${relativePath}\n${await readFile(fullPath, "utf8")}`);
    }
  }
  await visit(directory, "");
  return fingerprint(files.join("\n\0\n"));
}

function identityKey(identity: SkillIdentity): string {
  return JSON.stringify(identity);
}
