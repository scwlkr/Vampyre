import { inflateRawSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  downloadGitHubActionsArtifactZip,
  listGitHubWorkflowRunArtifacts,
  type GitHubActionsArtifactSummary,
  type GitHubClient,
} from "../github/client.js";
import type { VisualProofProfile } from "../registry/projectRegistry.js";
import { workspacePath } from "../remote/paths.js";

export interface VisualProofCaptureOptions {
  workspaceRoot: string;
  projectId: string;
  githubRepo: string;
  runJournalId: string;
  visualProof: VisualProofProfile;
  nativeValidation?: VisualProofNativeValidationSource | undefined;
  githubClient: GitHubClient;
}

export interface VisualProofNativeValidationSource {
  runId?: string | undefined;
  runUrl?: string | undefined;
}

export interface VisualProofCaptureReport {
  ready: boolean;
  required: boolean;
  provider: "github-actions-artifact";
  status: "captured" | "missing" | "failed";
  artifactName: string;
  blockers: string[];
  description: string;
  imageFilePattern?: string | undefined;
  sourceRunId?: string | undefined;
  sourceRunUrl?: string | undefined;
  artifactId?: string | undefined;
  artifactUrl?: string | undefined;
  imageFileName?: string | undefined;
  imagePath?: string | undefined;
  contentType?: string | undefined;
}

interface ZipImageEntry {
  fileName: string;
  content: Buffer;
}

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;

export async function captureVisualProof(
  options: VisualProofCaptureOptions,
): Promise<VisualProofCaptureReport> {
  const base = baseReport(options);
  const runId = options.nativeValidation?.runId;
  if (!runId) {
    return blocked(base, "Visual proof: native validation did not produce a GitHub Actions run id");
  }

  try {
    const artifacts = await listGitHubWorkflowRunArtifacts(options.githubClient, {
      repo: options.githubRepo,
      runId,
    });
    const artifact = artifacts.find((candidate) => candidate.name === options.visualProof.artifactName);
    if (!artifact) {
      return blocked(
        {
          ...base,
          sourceRunId: runId,
          ...(options.nativeValidation?.runUrl ? { sourceRunUrl: options.nativeValidation.runUrl } : {}),
        },
        `Visual proof: artifact ${options.visualProof.artifactName} is missing from GitHub Actions run ${runId}`,
      );
    }
    if (artifact.expired) {
      return blocked(withArtifact(base, runId, options.nativeValidation?.runUrl, artifact), "Visual proof: artifact is expired");
    }

    const zip = await downloadGitHubActionsArtifactZip(options.githubClient, {
      repo: options.githubRepo,
      artifactId: artifact.id,
    });
    const image = extractImageFromZip(zip, options.visualProof.imageFilePattern);
    if (!image) {
      return blocked(
        withArtifact(base, runId, options.nativeValidation?.runUrl, artifact),
        `Visual proof: artifact ${artifact.name} did not contain a matching product screenshot`,
      );
    }

    const reportDir = workspacePath(options.workspaceRoot, "reports", "visual-proof", options.projectId, options.runJournalId);
    await mkdir(reportDir, { recursive: true, mode: 0o700 });
    const imageFileName = safeImageFileName(image.fileName);
    const imagePath = join(reportDir, imageFileName);
    await writeFile(imagePath, image.content, { mode: 0o644 });

    return {
      ...withArtifact(base, runId, options.nativeValidation?.runUrl, artifact),
      ready: true,
      status: "captured",
      description: `Captured product screenshot ${image.fileName} from GitHub Actions artifact ${artifact.name}.`,
      imageFileName: image.fileName,
      imagePath,
      contentType: contentTypeForImage(image.fileName),
    };
  } catch (error) {
    return blocked(base, `Visual proof: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function baseReport(options: VisualProofCaptureOptions): VisualProofCaptureReport {
  const report: VisualProofCaptureReport = {
    ready: false,
    required: options.visualProof.required,
    provider: options.visualProof.provider,
    status: "missing",
    artifactName: options.visualProof.artifactName,
    blockers: [],
    description: "Product screenshot has not been captured.",
  };
  if (options.visualProof.imageFilePattern) {
    report.imageFilePattern = options.visualProof.imageFilePattern;
  }
  return report;
}

function withArtifact(
  report: VisualProofCaptureReport,
  runId: string,
  runUrl: string | undefined,
  artifact: GitHubActionsArtifactSummary,
): VisualProofCaptureReport {
  return {
    ...report,
    sourceRunId: runId,
    ...(runUrl ? { sourceRunUrl: runUrl } : {}),
    artifactId: artifact.id,
    ...(artifact.archiveDownloadUrl ? { artifactUrl: artifact.archiveDownloadUrl } : {}),
  };
}

function blocked(report: VisualProofCaptureReport, blocker: string): VisualProofCaptureReport {
  return {
    ...report,
    ready: false,
    status: "failed",
    blockers: report.required ? [blocker] : [],
    description: blocker,
  };
}

function extractImageFromZip(zip: Buffer, imageFilePattern: string | undefined): ZipImageEntry | undefined {
  const entries = listZipEntries(zip);
  const candidates = entries.filter((entry) => isImageFile(entry.fileName));
  if (imageFilePattern) {
    return candidates.find((entry) => matchesImageFilePattern(entry.fileName, imageFilePattern));
  }
  return candidates[0];
}

function listZipEntries(zip: Buffer): ZipImageEntry[] {
  const endOfCentralDirectoryOffset = findEndOfCentralDirectory(zip);
  if (endOfCentralDirectoryOffset < 0) {
    throw new Error("artifact ZIP is missing its central directory");
  }

  const entryCount = zip.readUInt16LE(endOfCentralDirectoryOffset + 10);
  const centralDirectoryOffset = zip.readUInt32LE(endOfCentralDirectoryOffset + 16);
  const entries: ZipImageEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("artifact ZIP central directory is invalid");
    }

    const compressionMethod = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const fileNameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localHeaderOffset = zip.readUInt32LE(offset + 42);
    const fileName = zip.toString("utf8", offset + 46, offset + 46 + fileNameLength);
    offset += 46 + fileNameLength + extraLength + commentLength;

    if (fileName.endsWith("/")) {
      continue;
    }

    entries.push({
      fileName,
      content: readZipEntryContent(zip, localHeaderOffset, compressedSize, compressionMethod),
    });
  }

  return entries;
}

function findEndOfCentralDirectory(zip: Buffer): number {
  const minimumOffset = Math.max(0, zip.length - 65_557);
  for (let offset = zip.length - 22; offset >= minimumOffset; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
}

function readZipEntryContent(
  zip: Buffer,
  localHeaderOffset: number,
  compressedSize: number,
  compressionMethod: number,
): Buffer {
  if (zip.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
    throw new Error("artifact ZIP local file header is invalid");
  }

  const fileNameLength = zip.readUInt16LE(localHeaderOffset + 26);
  const extraLength = zip.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressed = zip.subarray(dataStart, dataStart + compressedSize);

  if (compressionMethod === 0) {
    return Buffer.from(compressed);
  }
  if (compressionMethod === 8) {
    return inflateRawSync(compressed);
  }

  throw new Error(`artifact ZIP uses unsupported compression method ${compressionMethod}`);
}

function isImageFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function matchesImageFilePattern(fileName: string, pattern: string): boolean {
  return fileName === pattern || fileName.endsWith(`/${pattern}`) || fileName.includes(pattern);
}

function safeImageFileName(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? "visual-proof.png";
  const safe = baseName.replace(/[^A-Za-z0-9._-]/g, "-");
  return safe.length > 0 ? safe : "visual-proof.png";
}

function contentTypeForImage(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/png";
}
