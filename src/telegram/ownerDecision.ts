export function githubReviewDecisionLines(targetUrl?: string | undefined): string[] {
  return [
    "Owner decision steps:",
    targetUrl ? `1. Open this GitHub issue/comment: ${targetUrl}` : "1. Use this GitHub issue/comment.",
    "2. Scroll to the comment box and paste one decision.",
    "3. Approve: `VAMPYRE_APPROVED: accepted`",
    "4. Deny/request changes: `VAMPYRE_DENIED: <what should change>`",
  ];
}

export function githubPullRequestDecisionLines(targetUrl?: string | undefined): string[] {
  return [
    "Owner decision steps:",
    targetUrl ? `1. Open this GitHub PR: ${targetUrl}` : "1. Use this GitHub PR.",
    "2. Approve: click Review changes, choose Approve, then merge if ready.",
    "3. Deny/request changes: click Review changes, choose Request changes, or comment `VAMPYRE_DENIED: <what should change>`.",
  ];
}
