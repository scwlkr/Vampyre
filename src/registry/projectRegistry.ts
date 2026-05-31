import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { workspacePath } from "../remote/paths.js";

export const PROJECT_MODES = ["safe-watcher", "builder"] as const;

export type ProjectMode = (typeof PROJECT_MODES)[number];

export interface ProjectProfile {
  id: string;
  displayName: string;
  mode: ProjectMode;
  cadence: string;
  autonomyPolicy: string;
  paused: boolean;
  validationCommands?: string[];
  autoSafeTasks?: string[];
  nativeValidation?: NativeValidationProfile;
  visualProof?: VisualProofProfile;
  githubRepo?: string;
  rawIdea?: string;
}

export interface NativeValidationProfile {
  provider: "github-actions";
  workflowId: string;
  runnerLabel: string;
  requiredConclusion: string;
  timeoutSeconds: number;
}

export interface VisualProofProfile {
  provider: "github-actions-artifact";
  required: boolean;
  artifactName: string;
  imageFilePattern?: string;
}

export interface ProjectRegistry {
  version: 1;
  projects: ProjectProfile[];
}

export const DEFAULT_PROJECT_REGISTRY: ProjectRegistry = {
  version: 1,
  projects: [
    {
      id: "palette-wow",
      displayName: "paletteWOW",
      mode: "safe-watcher",
      githubRepo: "scwlkr/paletteWOW",
      cadence: "daily-forward-motion",
      autonomyPolicy: "auto-safe-work-ends-in-owner-reviewed-pr",
      paused: false,
      validationCommands: [
        "bundle exec rails test",
        "bundle exec rails zeitwerk:check",
        "bundle exec rails assets:precompile",
      ],
    },
    {
      id: "screenshot-tool",
      displayName: "Pinmark",
      mode: "builder",
      githubRepo: "scwlkr/pinmark",
      rawIdea: "A real macOS screenshot tool with quick markup features similar in spirit to ShareX.",
      cadence: "builder-loop-after-owner-approval",
      autonomyPolicy: "continuous-product-loop-direct-main",
      paused: true,
      validationCommands: ["git diff --check"],
      nativeValidation: {
        provider: "github-actions",
        workflowId: "macos-validation.yml",
        runnerLabel: "macos-15",
        requiredConclusion: "success",
        timeoutSeconds: 1800,
      },
      visualProof: {
        provider: "github-actions-artifact",
        required: true,
        artifactName: "pinmark-visual-proof",
        imageFilePattern: "pinmark-product.png",
      },
    },
    {
      id: "minimark",
      displayName: "MiniMark",
      mode: "builder",
      githubRepo: "scwlkr/minimark",
      rawIdea:
        "A no-permission macOS markdown scratchpad with a split editor/preview, auto-save, .md export, recent documents, and deterministic screenshot-friendly UI.",
      cadence: "builder-loop-after-owner-approval",
      autonomyPolicy: "continuous-product-loop-direct-main",
      paused: false,
      validationCommands: ["git diff --check"],
      nativeValidation: {
        provider: "github-actions",
        workflowId: "macos-validation.yml",
        runnerLabel: "macos-15",
        requiredConclusion: "success",
        timeoutSeconds: 1800,
      },
      visualProof: {
        provider: "github-actions-artifact",
        required: false,
        artifactName: "minimark-visual-proof",
        imageFilePattern: "minimark-product.png",
      },
    },
    {
      id: "keepingus",
      displayName: "KeepingUs",
      mode: "builder",
      githubRepo: "scwlkr/keepingus",
      rawIdea:
        "A small private photo-sharing web app for close friends and family with private circles, optional captions, profiles, and Nice/Vice reactions that keep the feed mostly chronological while letting group judgment influence visibility.",
      cadence: "builder-loop-after-owner-approval",
      autonomyPolicy: "continuous-product-loop-direct-main",
      paused: false,
      validationCommands: ["pnpm test", "pnpm build"],
      nativeValidation: {
        provider: "github-actions",
        workflowId: "web-validation.yml",
        runnerLabel: "ubuntu-latest",
        requiredConclusion: "success",
        timeoutSeconds: 900,
      },
    },
  ],
};

export interface LoadedProjectRegistry {
  path: string;
  registry: ProjectRegistry;
  created: boolean;
}

export async function loadProjectRegistry(workspaceRoot: string): Promise<LoadedProjectRegistry> {
  const registryPath = projectRegistryPath(workspaceRoot);

  try {
    const content = await readFile(registryPath, "utf8");
    return {
      path: registryPath,
      registry: parseProjectRegistry(JSON.parse(content), registryPath),
      created: false,
    };
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  await mkdir(dirname(registryPath), { recursive: true, mode: 0o700 });
  await writeFile(registryPath, `${JSON.stringify(DEFAULT_PROJECT_REGISTRY, null, 2)}\n`, {
    mode: 0o644,
  });

  return {
    path: registryPath,
    registry: DEFAULT_PROJECT_REGISTRY,
    created: true,
  };
}

export function projectRegistryPath(workspaceRoot: string): string {
  return workspacePath(workspaceRoot, "config", "project-registry.json");
}

export function formatProjectMode(mode: ProjectMode): string {
  if (mode === "safe-watcher") {
    return "Safe/Watcher";
  }

  return "Builder";
}

function parseProjectRegistry(value: unknown, source: string): ProjectRegistry {
  const object = readObject(value, source);
  const version = object["version"];
  if (version !== 1) {
    throw new Error(`${source} must use Project Registry version 1`);
  }

  const projects = object["projects"];
  if (!Array.isArray(projects) || projects.length === 0) {
    throw new Error(`${source} must define at least one project profile`);
  }

  const parsedProjects = projects.map((project, index) => parseProjectProfile(project, `${source} projects[${index}]`));
  const seen = new Set<string>();
  for (const project of parsedProjects) {
    if (seen.has(project.id)) {
      throw new Error(`${source} has duplicate project id: ${project.id}`);
    }
    seen.add(project.id);
  }

  return {
    version: 1,
    projects: parsedProjects,
  };
}

function parseProjectProfile(value: unknown, source: string): ProjectProfile {
  const object = readObject(value, source);
  const id = readRequiredString(object, "id", source);
  const displayName = readRequiredString(object, "displayName", source);
  const mode = readProjectMode(readRequiredString(object, "mode", source), source);
  const cadence = readRequiredString(object, "cadence", source);
  const autonomyPolicy = readRequiredString(object, "autonomyPolicy", source);
  const pausedValue = object["paused"];
  const paused = pausedValue === undefined ? false : readBoolean(pausedValue, "paused", source);
  const validationCommands = readOptionalStringArray(object, "validationCommands", source);
  const autoSafeTasks = readOptionalStringArray(object, "autoSafeTasks", source);
  const nativeValidation = readOptionalNativeValidation(object, source);
  const visualProof = readOptionalVisualProof(object, source);
  const githubRepo = readOptionalString(object, "githubRepo", source);
  const rawIdea = readOptionalString(object, "rawIdea", source);

  if (mode === "safe-watcher" && !githubRepo) {
    throw new Error(`${source} safe-watcher profile requires githubRepo`);
  }

  if (mode === "builder" && !rawIdea) {
    throw new Error(`${source} builder profile requires rawIdea`);
  }

  const profile: ProjectProfile = {
    id,
    displayName,
    mode,
    cadence,
    autonomyPolicy,
    paused,
  };

  if (validationCommands) {
    profile.validationCommands = validationCommands;
  }

  if (autoSafeTasks) {
    profile.autoSafeTasks = autoSafeTasks;
  }

  if (nativeValidation) {
    profile.nativeValidation = nativeValidation;
  }

  if (visualProof) {
    profile.visualProof = visualProof;
  }

  if (githubRepo) {
    profile.githubRepo = githubRepo;
  }

  if (rawIdea) {
    profile.rawIdea = rawIdea;
  }

  return profile;
}

function readObject(value: unknown, source: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${source} must be a JSON object`);
  }

  return value as Record<string, unknown>;
}

function readRequiredString(object: Record<string, unknown>, key: string, source: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${source} requires non-empty string field ${key}`);
  }

  return value;
}

function readOptionalString(object: Record<string, unknown>, key: string, source: string): string | undefined {
  const value = object[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${source} optional field ${key} must be a non-empty string when set`);
  }

  return value;
}

function readOptionalStringArray(object: Record<string, unknown>, key: string, source: string): string[] | undefined {
  const value = object[key];
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${source} optional field ${key} must be an array of non-empty strings when set`);
  }

  const strings = value.map((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`${source} optional field ${key}[${index}] must be a non-empty string`);
    }
    return item.trim();
  });

  if (strings.length === 0) {
    throw new Error(`${source} optional field ${key} must not be empty when set`);
  }

  return strings;
}

function readOptionalNativeValidation(
  object: Record<string, unknown>,
  source: string,
): NativeValidationProfile | undefined {
  const value = object["nativeValidation"];
  if (value === undefined) {
    return undefined;
  }

  const validation = readObject(value, `${source} nativeValidation`);
  const provider = readRequiredString(validation, "provider", `${source} nativeValidation`);
  if (provider !== "github-actions") {
    throw new Error(`${source} nativeValidation has unsupported provider: ${provider}`);
  }

  const timeoutSeconds = readPositiveInteger(
    validation["timeoutSeconds"],
    "timeoutSeconds",
    `${source} nativeValidation`,
  );

  return {
    provider,
    workflowId: readRequiredString(validation, "workflowId", `${source} nativeValidation`),
    runnerLabel: readRequiredString(validation, "runnerLabel", `${source} nativeValidation`),
    requiredConclusion: readRequiredString(validation, "requiredConclusion", `${source} nativeValidation`),
    timeoutSeconds,
  };
}

function readOptionalVisualProof(
  object: Record<string, unknown>,
  source: string,
): VisualProofProfile | undefined {
  const value = object["visualProof"];
  if (value === undefined) {
    return undefined;
  }

  const proof = readObject(value, `${source} visualProof`);
  const provider = readRequiredString(proof, "provider", `${source} visualProof`);
  if (provider !== "github-actions-artifact") {
    throw new Error(`${source} visualProof has unsupported provider: ${provider}`);
  }

  const profile: VisualProofProfile = {
    provider,
    required: readBoolean(proof["required"], "required", `${source} visualProof`),
    artifactName: readRequiredString(proof, "artifactName", `${source} visualProof`),
  };
  const imageFilePattern = readOptionalString(proof, "imageFilePattern", `${source} visualProof`);
  if (imageFilePattern) {
    profile.imageFilePattern = imageFilePattern;
  }
  return profile;
}

function readProjectMode(value: string, source: string): ProjectMode {
  if (PROJECT_MODES.some((mode) => mode === value)) {
    return value as ProjectMode;
  }

  throw new Error(`${source} has unsupported mode: ${value}`);
}

function readBoolean(value: unknown, key: string, source: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${source} field ${key} must be a boolean`);
  }

  return value;
}

function readPositiveInteger(value: unknown, key: string, source: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${source} field ${key} must be a positive integer`);
  }

  return value;
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as NodeJS.ErrnoException).code === "string" &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
