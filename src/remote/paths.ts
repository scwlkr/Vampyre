import { homedir } from "node:os";
import { join } from "node:path";

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

export function workspaceRootPrelude(value: string): string {
  return `root=${shellQuote(value)}
case "$root" in
  "~") root="$HOME" ;;
  "~/"*) root="$HOME/\${root#\\~/}" ;;
esac`;
}

export function validateWorkspaceRoot(value: string): void {
  if (!/^[A-Za-z0-9_./~-]+$/.test(value)) {
    throw new Error("workspace root contains unsupported characters");
  }
}

export function resolveLocalWorkspaceRoot(value: string): string {
  validateWorkspaceRoot(value);

  if (value === "~") {
    return homedir();
  }

  if (value.startsWith("~/")) {
    return join(homedir(), value.slice(2));
  }

  return value;
}

export function workspacePath(workspaceRoot: string, ...parts: string[]): string {
  return join(resolveLocalWorkspaceRoot(workspaceRoot), ...parts);
}
