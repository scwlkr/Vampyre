export function extractStatusNextAction(markdown: string): string | undefined {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => /^##\s+Next action\s*$/i.test(line.trim()));
  if (headingIndex === -1) {
    return undefined;
  }

  const body: string[] = [];
  for (const line of lines.slice(headingIndex + 1)) {
    if (/^##\s+/.test(line.trim())) {
      break;
    }

    const normalized = line.trim().replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");
    if (normalized.length > 0) {
      body.push(normalized);
    }
  }

  return body.length > 0 ? body.join(" ") : undefined;
}
