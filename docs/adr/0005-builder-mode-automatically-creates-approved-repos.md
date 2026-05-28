# Builder Mode automatically creates approved repos

Builder Mode will automatically create the selected new project's GitHub repository after the Owner approves a Vision Option and approves a Repo Plan. This keeps Builder Mode hands-off enough to match Vampyre's purpose, while preventing repositories from being created for unchosen ideas or with surprise settings.

## Consequences

- Automatic repo creation is part of the MVP and requires the GitHub token boundary to support controlled repository creation.
- Builder-created repos default to private until the Initial Baseline is real and a Launch Visibility Gate approves public visibility.
- The Repo Plan must include repo name, visibility, description, topics, license, enabled GitHub features, default branch, and initial files or docs.
