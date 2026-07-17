import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  createProject,
  deleteProject,
  duplicateProject,
  loadProjectById,
  loadProjectLibrary,
  renameProject,
  saveProject,
} from "./persistence";
import { createDefaultProject } from "./types";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function recordKeys(storage: Storage) {
  return Array.from({ length: storage.length }, (_, index) =>
    storage.key(index),
  ).filter((key): key is string =>
    Boolean(key?.startsWith("dranimo-project-record-v1:")),
  );
}

describe("project persistence", () => {
  test("initializes one default project and restores the active project", () => {
    const storage = new MemoryStorage();
    const initial = loadProjectLibrary(storage);

    assert.equal(initial.projects.length, 1);
    assert.equal(initial.projects[0].name, "untitled animation");
    assert.equal(initial.activeProjectId, initial.projects[0].id);
    assert.equal(initial.project.canvas.backgroundColor, "#ffffff");

    const restored = loadProjectLibrary(storage);
    assert.deepEqual(restored.project, initial.project);
    assert.equal(restored.activeProjectId, initial.activeProjectId);
  });

  test("migrates the legacy single-project record", () => {
    const storage = new MemoryStorage();
    const legacy = createDefaultProject();
    legacy.canvas.backgroundColor = "#123456";
    storage.setItem("dranimo-project-v1", JSON.stringify(legacy));

    const migrated = loadProjectLibrary(storage);

    assert.equal(migrated.project.canvas.backgroundColor, "#123456");
    assert.equal(migrated.projects[0].name, "untitled animation");
    assert.equal(storage.getItem("dranimo-project-v1"), null);
    assert.equal(recordKeys(storage).length, 1);
  });

  test("supports create, rename, duplicate, save, and isolated loading", () => {
    const storage = new MemoryStorage();
    const first = loadProjectLibrary(storage);
    const created = createProject(storage);
    assert.notEqual(created.activeProjectId, first.activeProjectId);

    const projectWithStroke = {
      ...created.project,
      strokes: [
        {
          id: "stroke-1",
          points: [{ x: 1, y: 2, pressure: 0.5, t: 0 }],
          brush: { ...created.project.brush },
          createdAt: 1,
        },
      ],
    };
    saveProject(created.activeProjectId, projectWithStroke, storage);
    renameProject(created.activeProjectId, "  手绘作品  ", storage);

    const duplicate = duplicateProject(created.activeProjectId, storage);
    assert.equal(duplicate.project.strokes.length, 1);
    assert.equal(
      duplicate.projects.find(
        (project) => project.id === duplicate.activeProjectId,
      )?.name,
      "手绘作品 副本",
    );
    assert.notEqual(duplicate.project, projectWithStroke);

    const original = loadProjectById(created.activeProjectId, storage);
    assert.equal(original.project.strokes.length, 1);
    assert.equal(original.project.strokes[0].id, "stroke-1");
    assert.equal(
      original.projects.find(
        (project) => project.id === original.activeProjectId,
      )?.name,
      "手绘作品",
    );
  });

  test("rebuilds a corrupt index from project records", () => {
    const storage = new MemoryStorage();
    const initial = loadProjectLibrary(storage);
    storage.setItem("dranimo-project-index-v1", "not-json");

    const recovered = loadProjectLibrary(storage);

    assert.equal(recovered.activeProjectId, initial.activeProjectId);
    assert.equal(recovered.projects.length, 1);
    assert.match(recovered.error ?? "", /索引已重建/);
  });

  test("skips corrupt records without preventing a replacement project", () => {
    const storage = new MemoryStorage();
    loadProjectLibrary(storage);
    const key = recordKeys(storage)[0];
    storage.setItem(key, "broken-record");

    const recovered = loadProjectLibrary(storage);

    assert.equal(recovered.projects.length, 1);
    assert.match(recovered.error ?? "", /跳过 1 个损坏项目/);
    assert.equal(recordKeys(storage).length, 2);
  });

  test("deleting the last project creates a new blank project", () => {
    const storage = new MemoryStorage();
    const initial = loadProjectLibrary(storage);
    const result = deleteProject(initial.activeProjectId, storage);

    assert.equal(result.projects.length, 1);
    assert.notEqual(result.activeProjectId, initial.activeProjectId);
    assert.equal(result.project.strokes.length, 0);
  });
});
