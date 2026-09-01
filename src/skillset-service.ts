import { access, mkdir, readFile, writeFile } from "node:fs/promises";
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

interface LocalSkillsetConfiguration {
  version: 1;
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

  private async readConfiguration(): Promise<LocalSkillsetConfiguration> {
    const rawConfiguration = await readFile(this.configurationPath, "utf8");
    const configuration = JSON.parse(rawConfiguration) as Partial<LocalSkillsetConfiguration>;
    if (configuration.version !== 1) {
      throw new Error("Unsupported Skillset configuration version.");
    }

    return { version: 1 };
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
