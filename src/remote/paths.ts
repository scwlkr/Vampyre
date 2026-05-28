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
