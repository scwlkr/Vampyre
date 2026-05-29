import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { loadProjectRegistry, projectRegistryPath } from "../src/registry/projectRegistry.js";

test("project registry creates the two MVP project profiles when missing", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-registry-"));

  try {
    const loaded = await loadProjectRegistry(workspaceRoot);

    assert.equal(loaded.created, true);
    assert.equal(loaded.path, projectRegistryPath(workspaceRoot));
    assert.deepEqual(
      loaded.registry.projects.map((project) => project.id),
      ["palette-wow", "screenshot-tool"],
    );
    assert.equal(loaded.registry.projects[0]?.mode, "safe-watcher");
    assert.equal(loaded.registry.projects[0]?.githubRepo, "scwlkr/paletteWOW");
    assert.deepEqual(loaded.registry.projects[0]?.validationCommands, [
      "bundle exec rails test",
      "bundle exec rails zeitwerk:check",
      "bundle exec rails assets:precompile",
    ]);
    assert.equal(loaded.registry.projects[0]?.autoSafeTasks, undefined);
    assert.equal(loaded.registry.projects[1]?.mode, "builder");
    assert.equal(loaded.registry.projects[1]?.displayName, "Pinmark");
    assert.equal(loaded.registry.projects[1]?.githubRepo, "scwlkr/pinmark");
    assert.match(loaded.registry.projects[1]?.rawIdea ?? "", /macOS screenshot tool/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("project registry rejects duplicate project ids", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vampyre-registry-"));

  try {
    await mkdir(dirname(projectRegistryPath(workspaceRoot)), { recursive: true });
    await writeFile(
      projectRegistryPath(workspaceRoot),
      JSON.stringify({
        version: 1,
        projects: [
          {
            id: "same",
            displayName: "One",
            mode: "safe-watcher",
            githubRepo: "owner/one",
            cadence: "daily",
            autonomyPolicy: "auto-safe",
          },
          {
            id: "same",
            displayName: "Two",
            mode: "builder",
            rawIdea: "Build a thing.",
            cadence: "builder-loop",
            autonomyPolicy: "approval-required",
          },
        ],
      }),
    );

    await assert.rejects(loadProjectRegistry(workspaceRoot), /duplicate project id: same/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
