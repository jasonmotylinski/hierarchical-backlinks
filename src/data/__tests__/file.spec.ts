import { describe, expect, it, beforeEach } from "vitest";

import { File } from "../file";
import type { App, TFile, MetadataCache } from "obsidian";
import type { BacklinkReference } from "../../types";

describe("File.getReferences", () => {
  it("preserves full frontmatter key paths", async () => {
    const file = new File({} as App, {} as TFile);

    const references = await file.getReferences("note.md", [
      {
        key: "test.children",
        original: "[[testme8]]",
        position: undefined as any,
      } as BacklinkReference,
    ]);

    expect(references).toHaveLength(1);
    const property = references[0].properties[0];
    expect(property.key).toBe("test.children");
    expect(property.subkey).toEqual(["children"]);
  });
});

/**
 * Test for Issue #112: Folder Notes in Path with No Backlinks Aren't Clickable
 * 
 * Scenario:
 * - Project/Project.md exists (folder note with NO direct backlinks)
 * - Project/tasks/task1.md exists (HAS backlinks from other.md)
 * 
 * Expected behavior:
 * - The hierarchy should include Project/Project.md even though it has no backlinks
 * - This makes it clickable in the tree view
 * 
 * Current bug:
 * - getBacklinksHierarchy() only includes files with backlinks
 * - If Project/Project.md has no backlinks, it never gets added to the tree
 * - Therefore it's not clickable, breaking the "Hide folder notes" feature
 */
describe("File.getBacklinksHierarchy - Issue #112: Folder Notes Clickability", () => {
  let mockApp: any;
  let mockFile: any;
  let file: File;

  beforeEach(() => {
    mockFile = {
      path: "other.md",
      vault: { path: "/" },
    } as TFile;

    mockApp = {
      vault: {
        getFileByPath: (path: string) => {
          const mockFiles: Record<string, any> = {
            "Project/tasks/task1.md": {
              path: "Project/tasks/task1.md",
              name: "task1.md",
            },
            "Project/Project.md": {
              path: "Project/Project.md",
              name: "Project.md",
            },
          };
          return mockFiles[path] || null;
        },
        cachedRead: async (file: TFile) => `Content of ${file.path}`,
      },
      metadataCache: {
        getBacklinksForFile: () => ({
          data: new Map([
            // Only task1.md has backlinks (from other.md)
            [
              "Project/tasks/task1.md",
              [
                {
                  key: "link",
                  original: "[[task1]]",
                  position: { start: { offset: 0 }, end: { offset: 10 } },
                } as BacklinkReference,
              ],
            ],
            // Note: Project/Project.md is NOT in the backlinks
            // This is the bug - even though it's a parent of task1.md,
            // it should still be in the tree if it exists
          ]),
        }),
        getFileCache: () => ({
          frontmatter: {},
          tags: [],
        }),
      } as MetadataCache,
    } as App;

    file = new File(mockApp, mockFile);
  });

  it("should include parent folder notes in hierarchy even if they have no direct backlinks", async () => {
    const hierarchy = await file.getBacklinksHierarchy();

    // Find the Project node in the hierarchy
    const projectNode = hierarchy.find((node) => node.path === "Project");

    expect(projectNode).toBeDefined();
    expect(projectNode?.isLeaf).toBe(false);
    expect(projectNode?.children).toBeDefined();

    // The Project/Project.md node should be a child of Project
    // and should represent the folder note
    const projectFolderNote = projectNode?.children?.find(
      (child) => child.path === "Project/Project.md"
    );

    expect(projectFolderNote).toBeDefined();
    expect(projectFolderNote?.isLeaf).toBe(true);
    expect(projectFolderNote?.title).toBe("Project");
  });

  it("should maintain the full hierarchy with intermediate folder notes", async () => {
    const hierarchy = await file.getBacklinksHierarchy();

    // The hierarchy should be:
    // Project (folder)
    //   ├── Project.md (folder note - clickable!)
    //   └── tasks (folder)
    //       └── task1.md (file with backlinks)

    const projectNode = hierarchy.find((node) => node.path === "Project");
    expect(projectNode).toBeDefined();

    // Should have both the folder note and the tasks subfolder
    const projectChildren = projectNode?.children || [];
    expect(projectChildren.length).toBeGreaterThanOrEqual(2);

    const tasksNode = projectChildren.find((n) => n.path === "Project/tasks");
    expect(tasksNode).toBeDefined();

    const task1Node = tasksNode?.children.find(
      (n) => n.path === "Project/tasks/task1.md"
    );
    expect(task1Node).toBeDefined();
  });
});
