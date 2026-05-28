export interface ParsedGitHubRepo {
  owner: string;
  name: string;
  fullName: string;
}

export interface GitHubClientOptions {
  token: string;
  fetchImpl?: GitHubFetch | undefined;
  apiBaseUrl?: string | undefined;
  userAgent?: string | undefined;
}

export interface GitHubClient {
  request<T>(method: GitHubMethod, path: string, body?: unknown): Promise<T>;
}

export type GitHubMethod = "GET" | "POST" | "PATCH";

export interface GitHubFetchInit {
  method: string;
  headers: Record<string, string>;
  body?: string | undefined;
}

export interface GitHubFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
}

export type GitHubFetch = (url: string, init: GitHubFetchInit) => Promise<GitHubFetchResponse>;

export interface GitHubAuthCheck {
  login: string;
}

export interface GitHubRepositoryAccess {
  fullName: string;
  private: boolean;
  permissions?: GitHubRepositoryPermissions | undefined;
}

export interface GitHubRepositoryPermissions {
  admin?: boolean | undefined;
  maintain?: boolean | undefined;
  push?: boolean | undefined;
  triage?: boolean | undefined;
  pull?: boolean | undefined;
}

export interface GitHubLabelOptions {
  repo: string;
  name: string;
  color: string;
  description?: string | undefined;
}

export interface GitHubLabelResult {
  name: string;
  url: string;
  action: "created" | "updated";
}

export interface GitHubIssueOptions {
  repo: string;
  title: string;
  body?: string | undefined;
  labels?: string[] | undefined;
}

export interface GitHubIssueLookupOptions {
  repo: string;
  title: string;
  label: string;
}

export interface GitHubIssueListOptions {
  repo: string;
  label: string;
  state?: "open" | "closed" | "all" | undefined;
}

export interface GitHubIssueCommentOptions {
  repo: string;
  issueNumber: number;
  body: string;
}

export interface GitHubPullRequestOptions {
  repo: string;
  title: string;
  head: string;
  base: string;
  body?: string | undefined;
  draft?: boolean | undefined;
}

export interface GitHubReference {
  number: number;
  url: string;
}

export interface GitHubIssueSummary extends GitHubReference {
  title: string;
  state: string;
  body: string;
  labels: string[];
}

export interface GitHubCommentSummary {
  url: string;
  body: string;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: unknown,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

const DEFAULT_API_BASE_URL = "https://api.github.com";
const DEFAULT_USER_AGENT = "vampyre-mvp";

export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const token = options.token.trim();
  if (token.length === 0) {
    throw new Error("GitHub token is required");
  }

  const fetchImpl = options.fetchImpl ?? defaultFetch();
  const apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  return {
    async request<T>(method: GitHubMethod, path: string, body?: unknown): Promise<T> {
      const headers: Record<string, string> = {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "user-agent": userAgent,
        "x-github-api-version": "2022-11-28",
      };
      const init: GitHubFetchInit = {
        method,
        headers,
      };

      if (body !== undefined) {
        headers["content-type"] = "application/json";
        init.body = JSON.stringify(body);
      }

      const response = await fetchImpl(`${apiBaseUrl}${path}`, init);
      const responseBody = await parseResponseBody(response);

      if (!response.ok) {
        throw new GitHubApiError(
          githubErrorMessage(method, path, response.status, response.statusText, responseBody),
          response.status,
          responseBody,
        );
      }

      return responseBody as T;
    },
  };
}

export async function checkGitHubAuth(client: GitHubClient): Promise<GitHubAuthCheck> {
  const user = await client.request<Record<string, unknown>>("GET", "/user");
  return {
    login: readString(user, "login", "GitHub user"),
  };
}

export async function checkGitHubRepoAccess(
  client: GitHubClient,
  repoName: string,
): Promise<GitHubRepositoryAccess> {
  const repo = parseGitHubRepo(repoName);
  const response = await client.request<Record<string, unknown>>("GET", repoPath(repo));
  const access: GitHubRepositoryAccess = {
    fullName: readString(response, "full_name", "GitHub repository"),
    private: readBoolean(response, "private", "GitHub repository"),
  };
  const permissions = readPermissions(response["permissions"]);
  if (permissions) {
    access.permissions = permissions;
  }

  return access;
}

export async function ensureGitHubLabel(
  client: GitHubClient,
  options: GitHubLabelOptions,
): Promise<GitHubLabelResult> {
  const repo = parseGitHubRepo(options.repo);
  validateLabelOptions(options);
  const labelPath = `${repoPath(repo)}/labels/${encodeURIComponent(options.name)}`;
  const payload = labelPayload(options);

  try {
    await client.request<Record<string, unknown>>("GET", labelPath);
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      const created = await client.request<Record<string, unknown>>("POST", `${repoPath(repo)}/labels`, payload);
      return labelResult(created, "created");
    }
    throw error;
  }

  const updated = await client.request<Record<string, unknown>>("PATCH", labelPath, payload);
  return labelResult(updated, "updated");
}

export async function createGitHubIssue(
  client: GitHubClient,
  options: GitHubIssueOptions,
): Promise<GitHubReference> {
  const repo = parseGitHubRepo(options.repo);
  if (options.title.trim().length === 0) {
    throw new Error("GitHub issue title is required");
  }

  const payload: Record<string, unknown> = {
    title: options.title,
  };
  if (options.body !== undefined) {
    payload["body"] = options.body;
  }
  if (options.labels && options.labels.length > 0) {
    payload["labels"] = options.labels;
  }

  const issue = await client.request<Record<string, unknown>>("POST", `${repoPath(repo)}/issues`, payload);
  return referenceFromIssueLike(issue, "GitHub issue");
}

export async function findOpenGitHubIssueByTitle(
  client: GitHubClient,
  options: GitHubIssueLookupOptions,
): Promise<GitHubReference | undefined> {
  const repo = parseGitHubRepo(options.repo);
  validateRequiredString(options.title, "GitHub issue title");
  validateRequiredString(options.label, "GitHub issue label");

  const query = new URLSearchParams({
    state: "open",
    labels: options.label,
    per_page: "50",
  });
  const issues = await client.request<unknown[]>("GET", `${repoPath(repo)}/issues?${query.toString()}`);

  for (const issue of issues) {
    if (!issue || typeof issue !== "object" || Array.isArray(issue)) {
      continue;
    }

    const issueObject = issue as Record<string, unknown>;
    if (issueObject["pull_request"] !== undefined) {
      continue;
    }

    if (readString(issueObject, "title", "GitHub issue") === options.title) {
      return referenceFromIssueLike(issueObject, "GitHub issue");
    }
  }

  return undefined;
}

export async function listGitHubIssuesByLabel(
  client: GitHubClient,
  options: GitHubIssueListOptions,
): Promise<GitHubIssueSummary[]> {
  const repo = parseGitHubRepo(options.repo);
  validateRequiredString(options.label, "GitHub issue label");

  const query = new URLSearchParams({
    state: options.state ?? "all",
    labels: options.label,
    per_page: "50",
  });
  const issues = await client.request<unknown[]>("GET", `${repoPath(repo)}/issues?${query.toString()}`);

  return issues.flatMap((issue) => {
    if (!issue || typeof issue !== "object" || Array.isArray(issue)) {
      return [];
    }

    const issueObject = issue as Record<string, unknown>;
    if (issueObject["pull_request"] !== undefined) {
      return [];
    }

    return [issueSummary(issueObject)];
  });
}

export async function createGitHubIssueComment(
  client: GitHubClient,
  options: GitHubIssueCommentOptions,
): Promise<GitHubReference> {
  const repo = parseGitHubRepo(options.repo);
  validatePositiveInteger(options.issueNumber, "GitHub issue number");
  if (options.body.trim().length === 0) {
    throw new Error("GitHub issue comment body is required");
  }

  const comment = await client.request<Record<string, unknown>>(
    "POST",
    `${repoPath(repo)}/issues/${options.issueNumber}/comments`,
    { body: options.body },
  );
  return {
    number: options.issueNumber,
    url: readString(comment, "html_url", "GitHub issue comment"),
  };
}

export async function listGitHubIssueComments(
  client: GitHubClient,
  options: {
    repo: string;
    issueNumber: number;
  },
): Promise<GitHubCommentSummary[]> {
  const repo = parseGitHubRepo(options.repo);
  validatePositiveInteger(options.issueNumber, "GitHub issue number");

  const comments = await client.request<unknown[]>(
    "GET",
    `${repoPath(repo)}/issues/${options.issueNumber}/comments?per_page=50`,
  );

  return comments.flatMap((comment) => {
    if (!comment || typeof comment !== "object" || Array.isArray(comment)) {
      return [];
    }

    const commentObject = comment as Record<string, unknown>;
    return [
      {
        url: readString(commentObject, "html_url", "GitHub issue comment"),
        body: readOptionalString(commentObject, "body") ?? "",
      },
    ];
  });
}

export async function createGitHubPullRequest(
  client: GitHubClient,
  options: GitHubPullRequestOptions,
): Promise<GitHubReference> {
  const repo = parseGitHubRepo(options.repo);
  validateRequiredString(options.title, "GitHub pull request title");
  validateRequiredString(options.head, "GitHub pull request head branch");
  validateRequiredString(options.base, "GitHub pull request base branch");

  const payload: Record<string, unknown> = {
    title: options.title,
    head: options.head,
    base: options.base,
  };
  if (options.body !== undefined) {
    payload["body"] = options.body;
  }
  if (options.draft !== undefined) {
    payload["draft"] = options.draft;
  }

  const pull = await client.request<Record<string, unknown>>("POST", `${repoPath(repo)}/pulls`, payload);
  return referenceFromIssueLike(pull, "GitHub pull request");
}

export function parseGitHubRepo(value: string): ParsedGitHubRepo {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) {
    throw new Error("GitHub repo must use owner/name format");
  }

  const [owner, name] = trimmed.split("/");
  if (!owner || !name) {
    throw new Error("GitHub repo must use owner/name format");
  }

  return {
    owner,
    name,
    fullName: `${owner}/${name}`,
  };
}

function defaultFetch(): GitHubFetch {
  if (typeof globalThis.fetch !== "function") {
    throw new Error("global fetch is not available for GitHub API calls");
  }

  return globalThis.fetch as unknown as GitHubFetch;
}

async function parseResponseBody(response: GitHubFetchResponse): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function githubErrorMessage(
  method: GitHubMethod,
  path: string,
  status: number,
  statusText: string,
  body: unknown,
): string {
  const message = readOptionalMessage(body) ?? statusText;
  return `GitHub ${method} ${path} failed with HTTP ${status}${message ? `: ${message}` : ""}`;
}

function readOptionalMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const message = (value as Record<string, unknown>)["message"];
  return typeof message === "string" && message.length > 0 ? message : undefined;
}

function repoPath(repo: ParsedGitHubRepo): string {
  return `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
}

function readString(object: Record<string, unknown>, key: string, source: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${source} response has invalid ${key}`);
  }

  return value;
}

function readBoolean(object: Record<string, unknown>, key: string, source: string): boolean {
  const value = object[key];
  if (typeof value !== "boolean") {
    throw new Error(`${source} response has invalid ${key}`);
  }

  return value;
}

function readOptionalString(object: Record<string, unknown>, key: string): string | undefined {
  const value = object[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(object: Record<string, unknown>, key: string, source: string): number {
  const value = object[key];
  if (typeof value !== "number") {
    throw new Error(`${source} response has invalid ${key}`);
  }

  return value;
}

function readLabels(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const labels: string[] = [];
  for (const label of value) {
    if (typeof label === "string" && label.length > 0) {
      labels.push(label);
      continue;
    }

    if (label && typeof label === "object" && !Array.isArray(label)) {
      const name = (label as Record<string, unknown>)["name"];
      if (typeof name === "string" && name.length > 0) {
        labels.push(name);
      }
    }
  }

  return labels;
}

function readPermissions(value: unknown): GitHubRepositoryPermissions | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const permissions: GitHubRepositoryPermissions = {};
  copyBooleanPermission(source, permissions, "admin");
  copyBooleanPermission(source, permissions, "maintain");
  copyBooleanPermission(source, permissions, "push");
  copyBooleanPermission(source, permissions, "triage");
  copyBooleanPermission(source, permissions, "pull");
  return Object.keys(permissions).length > 0 ? permissions : undefined;
}

function copyBooleanPermission(
  source: Record<string, unknown>,
  target: GitHubRepositoryPermissions,
  key: keyof GitHubRepositoryPermissions,
): void {
  const value = source[key];
  if (typeof value === "boolean") {
    target[key] = value;
  }
}

function validateLabelOptions(options: GitHubLabelOptions): void {
  validateRequiredString(options.name, "GitHub label name");
  if (!/^[0-9a-fA-F]{6}$/.test(options.color)) {
    throw new Error("GitHub label color must be a 6-character hex value without #");
  }
}

function labelPayload(options: GitHubLabelOptions): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: options.name,
    color: options.color,
  };
  if (options.description !== undefined) {
    payload["description"] = options.description;
  }
  return payload;
}

function labelResult(value: Record<string, unknown>, action: "created" | "updated"): GitHubLabelResult {
  return {
    name: readString(value, "name", "GitHub label"),
    url: readString(value, "url", "GitHub label"),
    action,
  };
}

function referenceFromIssueLike(value: Record<string, unknown>, source: string): GitHubReference {
  return {
    number: readNumber(value, "number", source),
    url: readString(value, "html_url", source),
  };
}

function issueSummary(value: Record<string, unknown>): GitHubIssueSummary {
  return {
    ...referenceFromIssueLike(value, "GitHub issue"),
    title: readString(value, "title", "GitHub issue"),
    state: readString(value, "state", "GitHub issue"),
    body: readOptionalString(value, "body") ?? "",
    labels: readLabels(value["labels"]),
  };
}

function validateRequiredString(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
}

function validatePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}
