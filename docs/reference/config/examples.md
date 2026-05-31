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

## Runtime Policy

This file is created at `~/vampyre/config/runtime-policy.json` when missing.

```json
{
  "version": 1,
  "runtime": {
    "heartbeatInterval": "30s"
  },
  "budget": {
    "provider": "codex",
    "unknownRateLimitMode": "normal",
    "unavailableMode": "conservative",
    "thresholds": {
      "exhaustedAtOrBelowRemainingPercent": 0,
      "criticalAtOrBelowRemainingPercent": 10,
      "conservativeAtOrBelowRemainingPercent": 30
    },
    "codex": {
      "codexHome": null,
      "lookbackDays": 1,
      "maxFiles": 24
    }
  },
  "scheduler": {
    "selectionStrategy": "registry-order",
    "budgetModeBehavior": {
      "normal": "allow",
      "conservative": "allow",
      "critical": "defer",
      "exhausted": "defer"
    },
    "cadenceIntervals": {
      "daily-forward-motion": "24h",
      "builder-loop-after-owner-approval": "24h"
    },
    "directMainProductLoop": {
      "minimumIntervalByBudgetMode": {
        "normal": "3h",
        "conservative": "3h",
        "critical": "3h",
        "exhausted": "3h"
      },
      "allowImmediateRunWithoutRunJournal": true
    }
  },
  "buildAgent": {
    "autoRunSelectedProjects": true,
    "worker": {
      "model": "gpt-5.5",
      "reasoningEffort": "xhigh"
    }
  },
  "telegram": {
    "dailyBrief": {
      "enabled": true,
      "hourUtc": 14
    },
    "unauthorizedAlerts": {
      "threshold": 3,
      "window": "10m",
      "suppression": "1h",
      "materialChangeCount": 3
    },
    "commands": {
      "status": "/status",
      "policy": "/policy",
      "pause1min": "/pause1min",
      "pause1hour": "/pause1hour",
      "pause1day": "/pause1day",
      "resume": "/resume"
    },
    "pauseDurations": {
      "pause1min": "1m",
      "pause1hour": "1h",
      "pause1day": "1d"
    }
  },
  "status": {
    "includeRuntimePolicySummary": true,
    "includeTelegramCommands": true
  }
}
```
