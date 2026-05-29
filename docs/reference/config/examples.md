# Configuration Examples

## Minimal Registry

```json
{
  "version": 1,
  "projects": [
    {
      "id": "palette-wow",
      "displayName": "paletteWOW",
      "mode": "safe-watcher",
      "githubRepo": "scwlkr/paletteWOW",
      "cadence": "daily-forward-motion",
      "autonomyPolicy": "auto-safe-work-ends-in-owner-reviewed-pr",
      "paused": false,
      "validationCommands": [
        "bundle exec rails test",
        "bundle exec rails zeitwerk:check",
        "bundle exec rails assets:precompile"
      ]
    }
  ]
}
```

## Native Validation Block

```json
{
  "nativeValidation": {
    "provider": "github-actions",
    "workflowId": "macos-validation.yml",
    "runnerLabel": "macos-15",
    "requiredConclusion": "success",
    "timeoutSeconds": 1800
  }
}
```
