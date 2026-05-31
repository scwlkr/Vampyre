import type { ExternalValidationRunRecord, ProjectBlockerRecord } from "../state/operationalState.js";

export const MAX_AUTO_RECOVERY_OPEN_BLOCKERS = 3;

const AUTO_RECOVERABLE_BLOCKER_SUMMARIES = new Set([
  "Build Agent validation-failure",
  "Native validation failure",
  "Native validation timeout",
  "Visual Proof failure",
]);

export interface AutoRecoveryProject {
  openBlockerCount: number;
  openBlockers?: ProjectBlockerRecord[];
  latestExternalValidation?: ExternalValidationRunRecord;
}

export function isAutoRecoverableBlocker(blocker: Pick<ProjectBlockerRecord, "summary">): boolean {
  return AUTO_RECOVERABLE_BLOCKER_SUMMARIES.has(blocker.summary);
}

export function autoRecoverableBlockers(project: AutoRecoveryProject): ProjectBlockerRecord[] {
  return (project.openBlockers ?? []).filter(isAutoRecoverableBlocker);
}

export function hasAutoRecoverableBlockerRepair(project: AutoRecoveryProject): boolean {
  if (project.openBlockerCount <= 0) {
    return false;
  }

  const openBlockers = project.openBlockers ?? [];
  if (openBlockers.length === 0) {
    return false;
  }

  return openBlockers.every(isAutoRecoverableBlocker) && openBlockers.length < MAX_AUTO_RECOVERY_OPEN_BLOCKERS;
}

export function blockerDeferReason(project: AutoRecoveryProject): string | undefined {
  if (project.openBlockerCount <= 0) {
    return undefined;
  }

  const openBlockers = project.openBlockers ?? [];
  if (openBlockers.length === 0 || openBlockers.some((blocker) => !isAutoRecoverableBlocker(blocker))) {
    return "project-blocked";
  }

  return openBlockers.length >= MAX_AUTO_RECOVERY_OPEN_BLOCKERS
    ? "project-blocked-recovery-exhausted"
    : undefined;
}

export function autoRecoveryTask(project: AutoRecoveryProject): string | undefined {
  if (!hasAutoRecoverableBlockerRepair(project)) {
    return undefined;
  }

  const blockerLines = autoRecoverableBlockers(project).map((blocker) => {
    const details = blocker.details ? ` Details: ${blocker.details}` : "";
    return `- ${blocker.summary}: ${blocker.id}.${details}`;
  });
  const validation = project.latestExternalValidation;
  const validationLines = validation
    ? [
        "",
        "Latest native validation:",
        `- Status: ${validation.status}${validation.conclusion ? `/${validation.conclusion}` : ""}`,
        validation.providerUrl ? `- Run URL: ${validation.providerUrl}` : undefined,
        validation.errorSummary ? `- Error: ${validation.errorSummary}` : undefined,
      ].filter((line): line is string => typeof line === "string")
    : [];

  return [
    "Repair the recoverable blocker before doing product work.",
    "",
    "Open recoverable blocker(s):",
    ...blockerLines,
    ...validationLines,
    "",
    "Make the smallest code, test, workflow, or configuration change that resolves the blocker. Update the repo status with proof and the next product action. Do not add unrelated product scope.",
  ].join("\n");
}
