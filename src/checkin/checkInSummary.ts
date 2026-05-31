import type {
  CodexBudgetUsageSummary,
  ExternalValidationRunRecord,
  OperationalStateReport,
  ProjectBlockerRecord,
  ProjectRuntimeStatus,
  SchedulerDecisionRecord,
  SchedulerRuntimeStatus,
  WorkPauseRuntimeStatus,
} from "../state/operationalState.js";
import { hasAutoRecoverableBlockerRepair } from "../blockers/recovery.js";
import { formatRuntimePolicySummary, type RuntimePolicy } from "../config/runtimePolicy.js";

export interface CheckInSummary {
  generatedAt: string;
  overallState: "ready";
  workspaceRoot: string;
  databasePath: string;
  registryPath: string;
  workPause: CheckInWorkPauseSummary;
  scheduler: CheckInSchedulerSummary;
  runtimePolicy?: RuntimePolicy;
  runtimePolicyPath?: string;
  projects: CheckInProjectSummary[];
  ownerAction: string;
  usefulLinks: string[];
}

export interface CheckInWorkPauseSummary {
  status: "active" | "inactive" | "expired";
  pausedUntil?: string;
  source?: string;
  createdAt?: string;
  reason?: string;
}

export interface CheckInSchedulerSummary {
  status: "ready" | "not-started";
  budget?: string;
  budgetMode?: string;
  activeBuildAgentLock?: "available" | "held";
  selectedProjectId?: string;
  lastTickAt?: string;
  codexUsage?: CodexBudgetUsageSummary;
  decisions: SchedulerDecisionRecord[];
}

export interface CheckInProjectSummary {
  id: string;
  displayName: string;
  mode: string;
  cadence: string;
  autonomyPolicy: string;
  paused: boolean;
  runJournalCount: number;
  openBlockerCount: number;
  openBlockers?: ProjectBlockerRecord[];
  latestRunJournalAt?: string;
  decision?: "selected" | "deferred";
  decisionReason?: string;
  githubRepo?: string;
  githubUrl?: string;
  rawIdea?: string;
  validationCommands: string[];
  autoSafeTasks: string[];
  nativeValidation?: ExternalValidationRunRecord;
  statusNextAction?: string;
}

export function buildCheckInSummary(options: {
  state: OperationalStateReport;
  now?: (() => Date) | undefined;
}): CheckInSummary {
  const generatedAt = (options.now?.() ?? new Date()).toISOString();
  const decisions = options.state.scheduler?.decisions ?? [];
  const projects = options.state.projects.map((project) => projectSummary(project, decisions));
  const scheduler = schedulerSummary(options.state.scheduler);
  const workPause = workPauseSummary(options.state.workPause);

  const summary: CheckInSummary = {
    generatedAt,
    overallState: "ready",
    workspaceRoot: options.state.workspaceRoot,
    databasePath: options.state.databasePath,
    registryPath: options.state.registryPath,
    workPause,
    scheduler,
    projects,
    ownerAction: ownerAction({ workPause, projects, scheduler }),
    usefulLinks: usefulLinks(projects),
  };
  if (options.state.runtimePolicy) {
    summary.runtimePolicy = options.state.runtimePolicy;
  }
  if (options.state.runtimePolicyPath) {
    summary.runtimePolicyPath = options.state.runtimePolicyPath;
  }
  return summary;
}

export function formatCliCheckInSummary(
  summary: CheckInSummary,
  options?: { host?: string | undefined; workspaceRoot?: string | undefined },
): string {
  const lines: string[] = ["Vampyre check-in"];
  if (options?.host) {
    lines.push(`Host: ${options.host}`);
  }
  lines.push(`Workspace Root: ${options?.workspaceRoot ?? summary.workspaceRoot}`);
  lines.push(`Database: ${summary.databasePath}`);
  lines.push(`Project Registry: ${summary.registryPath}`);
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Overall State: ${summary.overallState}`);
  lines.push("");
  lines.push("Work Pause:");
  lines.push(`  State: ${formatWorkPauseLine(summary.workPause)}`);

  if (summary.scheduler.status === "ready") {
    lines.push("");
    lines.push("Scheduler:");
    lines.push(`  Last Tick: ${summary.scheduler.lastTickAt ?? "unknown"}`);
    lines.push(`  Budget: ${summary.scheduler.budget ?? "unknown"}`);
    if (summary.scheduler.codexUsage) {
      lines.push(`  Codex Usage: ${formatCodexUsageLine(summary.scheduler.codexUsage)}`);
    }
    lines.push(`  Active Build Agent Lock: ${summary.scheduler.activeBuildAgentLock ?? "unknown"}`);
    lines.push(`  Selected Project: ${summary.scheduler.selectedProjectId ?? "none"}`);
    lines.push("");
    lines.push("Scheduler Decisions:");
    for (const decision of summary.scheduler.decisions) {
      lines.push(`- ${decision.displayName} (${decision.projectId}): ${decision.decision} (${decision.reason})`);
    }
  } else {
    lines.push("");
    lines.push("Scheduler: not started");
  }

  if (summary.runtimePolicy?.status.includeRuntimePolicySummary) {
    lines.push("");
    lines.push("Runtime Policy:");
    if (summary.runtimePolicyPath) {
      lines.push(`  Path: ${summary.runtimePolicyPath}`);
    }
    for (const item of formatRuntimePolicySummary(summary.runtimePolicy)) {
      lines.push(`  ${item}`);
    }
    if (summary.runtimePolicy.status.includeTelegramCommands) {
      lines.push(
        `  Telegram Commands: ${Object.values(summary.runtimePolicy.telegram.commands)
          .sort()
          .join(", ")}`,
      );
    }
  }

  lines.push("");
  lines.push("Projects:");
  for (const project of summary.projects) {
    lines.push(`- ${project.displayName} (${project.id})`);
    lines.push(`  Mode: ${project.mode}`);
    lines.push(`  Cadence: ${project.cadence}`);
    lines.push(`  Autonomy: ${project.autonomyPolicy}`);
    lines.push(`  Paused: ${project.paused ? "yes" : "no"}`);
    if (project.githubRepo) {
      lines.push(`  GitHub: ${project.githubRepo}`);
    }
    if (project.rawIdea) {
      lines.push(`  Raw Idea: ${project.rawIdea}`);
    }
    lines.push(`  Run Journals: ${project.runJournalCount}`);
    if (project.latestRunJournalAt) {
      lines.push(`  Latest Run Journal: ${project.latestRunJournalAt}`);
    }
    lines.push(`  Open Blockers: ${project.openBlockerCount}`);
    if (project.decision) {
      lines.push(`  Scheduler Decision: ${project.decision} (${project.decisionReason ?? "unknown"})`);
    }
    if (project.validationCommands.length > 0) {
      lines.push(`  Validation: ${project.validationCommands.join(" && ")}`);
    }
    if (project.nativeValidation) {
      lines.push(`  Native Validation: ${formatNativeValidationLine(project.nativeValidation)}`);
    }
    if (project.statusNextAction) {
      lines.push(`  Next action: ${project.statusNextAction}`);
    } else if (project.autoSafeTasks.length > 0) {
      lines.push(`  Next Auto-safe Task: ${project.autoSafeTasks[0]}`);
    }
  }

  lines.push("");
  lines.push("Owner Action:");
  lines.push(`- ${summary.ownerAction}`);

  if (summary.usefulLinks.length > 0) {
    lines.push("");
    lines.push("Useful Links:");
    for (const link of summary.usefulLinks) {
      lines.push(`- ${link}`);
    }
  }

  return lines.join("\n");
}

export function formatTelegramCheckInSummary(summary: CheckInSummary): string {
  const lines: string[] = [
    "Vampyre status",
    `State: ${summary.overallState}`,
    `Work Pause: ${formatCompactWorkPause(summary.workPause)}`,
  ];

  if (summary.scheduler.status === "ready") {
    lines.push(`Budget: ${summary.scheduler.budget ?? "unknown"}`);
    if (summary.scheduler.codexUsage) {
      lines.push(`Codex Usage: ${formatCompactCodexUsage(summary.scheduler.codexUsage)}`);
    }
    lines.push(`Active Agent: ${summary.scheduler.activeBuildAgentLock ?? "unknown"}`);
    lines.push(`Selected: ${summary.scheduler.selectedProjectId ?? "none"}`);
  } else {
    lines.push("Scheduler: not started");
  }

  if (summary.runtimePolicy?.status.includeRuntimePolicySummary) {
    lines.push(
      `Policy: loop ${summary.runtimePolicy.scheduler.directMainProductLoop.minimumIntervalByBudgetMode.normal}; unknown rate limit -> ${summary.runtimePolicy.budget.unknownRateLimitMode}`,
    );
  }

  lines.push("Projects:");
  for (const project of summary.projects) {
    const decision = project.decision ? `${project.decision} (${project.decisionReason ?? "unknown"})` : "no tick";
    lines.push(`- ${project.displayName}: ${decision}; blockers ${project.openBlockerCount}`);
  }

  lines.push(`Action: ${summary.ownerAction}`);

  return lines.join("\n");
}

export function formatTelegramDailyBrief(summary: CheckInSummary): string {
  const lines: string[] = [
    "Vampyre daily brief",
    `State: ${summary.overallState}`,
    `Work Pause: ${formatCompactWorkPause(summary.workPause)}`,
  ];

  if (summary.scheduler.status === "ready") {
    lines.push(`Budget: ${summary.scheduler.budget ?? "unknown"}`);
    lines.push(`Selected: ${summary.scheduler.selectedProjectId ?? "none"}`);
  } else {
    lines.push("Scheduler: not started");
  }

  lines.push("Projects:");
  for (const project of summary.projects) {
    const decision = project.decision ? `${project.decision} (${project.decisionReason ?? "unknown"})` : "no tick";
    const nextAction = project.statusNextAction ? `; next: ${project.statusNextAction}` : "";
    lines.push(`- ${project.displayName}: ${decision}; blockers ${project.openBlockerCount}${nextAction}`);
  }

  lines.push(`Action: ${summary.ownerAction}`);
  if (summary.usefulLinks.length > 0) {
    lines.push("Links:");
    for (const link of summary.usefulLinks.slice(0, 3)) {
      lines.push(`- ${link}`);
    }
  }

  return lines.join("\n");
}

function schedulerSummary(scheduler: SchedulerRuntimeStatus | undefined): CheckInSchedulerSummary {
  if (!scheduler) {
    return {
      status: "not-started",
      decisions: [],
    };
  }

  const summary: CheckInSchedulerSummary = {
    status: "ready",
    budget: `${scheduler.budgetProvider}/${scheduler.budgetMode}`,
    budgetMode: scheduler.budgetMode,
    activeBuildAgentLock: scheduler.activeBuildAgentLock,
    lastTickAt: scheduler.lastTickAt,
    decisions: scheduler.decisions,
  };

  if (scheduler.selectedProjectId) {
    summary.selectedProjectId = scheduler.selectedProjectId;
  }
  if (scheduler.codexUsage) {
    summary.codexUsage = scheduler.codexUsage;
  }

  return summary;
}

function formatCodexUsageLine(usage: CodexBudgetUsageSummary): string {
  const parts = [
    `${usage.totalTokens.toLocaleString("en-US")} tokens over ${usage.tokenEvents.toLocaleString("en-US")} items`,
    `${usage.filesScanned.toLocaleString("en-US")} files`,
  ];
  const limits = formatCodexRateLimits(usage);
  if (limits) {
    parts.push(limits);
  }
  return parts.join("; ");
}

function formatCompactCodexUsage(usage: CodexBudgetUsageSummary): string {
  return formatCodexRateLimits(usage) ?? `${usage.totalTokens.toLocaleString("en-US")} tokens`;
}

function formatCodexRateLimits(usage: CodexBudgetUsageSummary): string | undefined {
  const limits: string[] = [];
  if (typeof usage.primaryUsedPercent === "number") {
    limits.push(`5h ${usage.primaryUsedPercent.toFixed(0)}% used`);
  }
  if (typeof usage.secondaryUsedPercent === "number") {
    limits.push(`weekly ${usage.secondaryUsedPercent.toFixed(0)}% used`);
  }
  return limits.length > 0 ? limits.join(", ") : undefined;
}

function workPauseSummary(workPause: WorkPauseRuntimeStatus | undefined): CheckInWorkPauseSummary {
  if (!workPause || (!workPause.active && !workPause.expired)) {
    return { status: "inactive" };
  }

  const summary: CheckInWorkPauseSummary = {
    status: workPause.active ? "active" : "expired",
  };

  if (workPause.pausedUntil) {
    summary.pausedUntil = workPause.pausedUntil;
  }
  if (workPause.source) {
    summary.source = workPause.source;
  }
  if (workPause.createdAt) {
    summary.createdAt = workPause.createdAt;
  }
  if (workPause.reason) {
    summary.reason = workPause.reason;
  }

  return summary;
}

function projectSummary(
  project: ProjectRuntimeStatus,
  decisions: SchedulerDecisionRecord[],
): CheckInProjectSummary {
  const decision = decisions.find((candidate) => candidate.projectId === project.id);
  const summary: CheckInProjectSummary = {
    id: project.id,
    displayName: project.displayName,
    mode: project.modeLabel,
    cadence: project.cadence,
    autonomyPolicy: project.autonomyPolicy,
    paused: project.paused,
    runJournalCount: project.runJournalCount,
    openBlockerCount: project.openBlockerCount,
    validationCommands: project.validationCommands ?? [],
    autoSafeTasks: project.autoSafeTasks ?? [],
  };

  if (project.openBlockers) {
    summary.openBlockers = project.openBlockers;
  }
  if (project.latestRunJournalAt) {
    summary.latestRunJournalAt = project.latestRunJournalAt;
  }
  if (decision) {
    summary.decision = decision.decision;
    summary.decisionReason = decision.reason;
  }
  if (project.githubRepo) {
    summary.githubRepo = project.githubRepo;
    summary.githubUrl = `https://github.com/${project.githubRepo}`;
  }
  if (project.rawIdea) {
    summary.rawIdea = project.rawIdea;
  }
  if (project.statusNextAction) {
    summary.statusNextAction = project.statusNextAction;
  }
  if (project.latestExternalValidation) {
    summary.nativeValidation = project.latestExternalValidation;
  }

  return summary;
}

function ownerAction(options: {
  workPause: CheckInWorkPauseSummary;
  projects: CheckInProjectSummary[];
  scheduler: CheckInSchedulerSummary;
}): string {
  if (options.workPause.status === "active") {
    return `Work Pause is active until ${options.workPause.pausedUntil ?? "unknown"}; new project-changing runs are held.`;
  }

  const blocked = options.projects.filter(
    (project) => !project.paused && project.openBlockerCount > 0 && !hasAutoRecoverableBlockerRepair(project),
  );
  if (blocked.length > 0) {
    return `Owner action needed: review open blockers for ${blocked.map((project) => project.displayName).join(", ")}.`;
  }

  if (options.scheduler.selectedProjectId) {
    const selected = options.projects.find((project) => project.id === options.scheduler.selectedProjectId);
    return `No owner action needed; ${selected?.displayName ?? options.scheduler.selectedProjectId} is selected for the next Build Agent run.`;
  }

  return "No owner action recorded in Operational State.";
}

function usefulLinks(projects: CheckInProjectSummary[]): string[] {
  return projects
    .flatMap((project) => [project.githubUrl, project.nativeValidation?.providerUrl])
    .filter((link): link is string => typeof link === "string" && link.length > 0);
}

function formatNativeValidationLine(validation: ExternalValidationRunRecord): string {
  const parts = [
    `${validation.provider}/${validation.workflowId}`,
    `ref ${validation.ref}`,
    validation.conclusion ? `${validation.status}/${validation.conclusion}` : validation.status,
    `checked ${validation.checkedAt}`,
  ];
  if (validation.providerUrl) {
    parts.push(validation.providerUrl);
  }
  if (validation.errorSummary) {
    parts.push(validation.errorSummary);
  }
  return parts.join("; ");
}

function formatWorkPauseLine(workPause: CheckInWorkPauseSummary): string {
  if (workPause.status === "inactive") {
    return "not paused";
  }

  const parts = [
    workPause.status === "active" ? `active until ${workPause.pausedUntil ?? "unknown"}` : "expired",
  ];
  if (workPause.source) {
    parts.push(`source ${workPause.source}`);
  }
  if (workPause.reason) {
    parts.push(`reason ${workPause.reason}`);
  }
  return parts.join("; ");
}

function formatCompactWorkPause(workPause: CheckInWorkPauseSummary): string {
  if (workPause.status === "inactive") {
    return "not paused";
  }

  if (workPause.status === "active") {
    return `active until ${workPause.pausedUntil ?? "unknown"}`;
  }

  return "expired";
}
