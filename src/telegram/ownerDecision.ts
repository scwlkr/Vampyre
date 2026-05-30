export function githubReviewDecisionLines(): string[] {
  return [
    "Owner options (GitHub):",
    "- Approve: comment `VAMPYRE_APPROVED: accepted` on the linked review record.",
    "- Deny: comment `VAMPYRE_DENIED: <reason or requested change>` on the linked review record.",
  ];
}

export function githubPullRequestDecisionLines(): string[] {
  return [
    "Owner options (GitHub):",
    "- Approve: approve and merge the PR if acceptable.",
    "- Deny: request changes on the PR or comment `VAMPYRE_DENIED: <reason>`.",
  ];
}
