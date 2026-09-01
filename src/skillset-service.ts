import { access, copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

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
  managedSourcePath: string;
}

export interface SkillDiscoveryAdapter {
  id: string;
  skillDirectories: readonly string[];
}

interface LocalSkillsetConfiguration {
  version: 1;
  selectedSkills: SelectedSkill[];
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
          const content = await readFile(skillFilePath, "utf8").catch(() => undefined);
          if (content === undefined) {
            continue;
          }

          candidates.push({
            identity: {
              name: entry.name,
              sourcePath,
              contentFingerprint: fingerprint(content),
            },
            skillFilePath,
          });
        }
      }
    }

    return candidates.sort((left, right) => identityKey(left.identity).localeCompare(identityKey(right.identity)));
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

      const managedSourcePath = path.join(
        this.options.stateRoot,
        "managed-sources",
        fingerprint(key),
        "SKILL.md",
      );
      await mkdir(path.dirname(managedSourcePath), { recursive: true });
      await copyFile(skill.skillFilePath, managedSourcePath);
      selectedByIdentity.set(key, { identity: skill.identity, managedSourcePath });
    }

    await this.writeConfiguration({
      version: 1,
      selectedSkills: [...selectedByIdentity.values()],
    });
  }

  public async selectedSkills(): Promise<SelectedSkill[]> {
    return (await this.readConfiguration()).selectedSkills;
  }

  public async removeSkills(identities: readonly SkillIdentity[]): Promise<void> {
    const identitiesToRemove = new Set(identities.map(identityKey));
    const configuration = await this.readConfiguration();
    await this.writeConfiguration({
      version: 1,
      selectedSkills: configuration.selectedSkills.filter(
        (skill) => !identitiesToRemove.has(identityKey(skill.identity)),
      ),
    });
  }

  private async readConfiguration(): Promise<LocalSkillsetConfiguration> {
    const rawConfiguration = await readFile(this.configurationPath, "utf8");
    const configuration = JSON.parse(rawConfiguration) as Partial<LocalSkillsetConfiguration>;
    if (configuration.version !== 1) {
      throw new Error("Unsupported Skillset configuration version.");
    }

    return {
      version: 1,
      selectedSkills: Array.isArray(configuration.selectedSkills)
        ? configuration.selectedSkills
        : [],
    };
  }

  private async writeConfiguration(configuration: LocalSkillsetConfiguration): Promise<void> {
    await writeFile(
      this.configurationPath,
      `${JSON.stringify(configuration, null, 2)}\n`,
      "utf8",
    );
  }
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

function identityKey(identity: SkillIdentity): string {
  return JSON.stringify(identity);
}
