import { describe, expect, it } from "vitest";

import { buildFlattenedHierarchy } from "../treeUtils";
import { TreeNode } from "../../tree/treeNode";
import type { ContentReference } from "../../types";

function makeNode(
    path: string,
    isLeaf: boolean,
    children: TreeNode[] = [],
    references: ContentReference[] = [],
): TreeNode {
    return new TreeNode(path, "", references, children, null, isLeaf);
}

function makeReference(path: string): ContentReference {
    return { path, content: [[0, 10]], properties: [] };
}

describe("buildFlattenedHierarchy", () => {
    it("collects leaf nodes from a nested hierarchy", () => {
        const leafA = makeNode("Folder/a.md", true, [], [makeReference("Folder/a.md")]);
        const leafB = makeNode("Folder/Sub/b.md", true, [], [makeReference("Folder/Sub/b.md")]);
        const sub = makeNode("Folder/Sub", false, [leafB]);
        const folder = makeNode("Folder", false, [leafA, sub]);

        const flat = buildFlattenedHierarchy([folder]);

        expect(flat.map((n) => n.path)).toEqual(["Folder/a.md", "Folder/Sub/b.md"]);
        // flattened nodes are rendered as root leaves
        expect(flat.every((n) => n.children.length === 0)).toBe(true);
    });

    /**
     * Issue #154: Flatten Tree Should Not Show More Than Direct Parent Folder Notes
     *
     * Folder notes injected by File.insertFolderNotesIntoNode exist only to make
     * folder rows clickable in hierarchy mode; they have no backlinks of their
     * own. Flatten mode must not surface them as standalone rows.
     */
    it("excludes injected folder notes (issue #154)", () => {
        // Mirrors the reporter's vault:
        // Untitled/
        //   Overview.md            <- injected folder note (no backlinks)
        //   Untitled 2/
        //     Overview.md          <- the actual backlink
        const injected = makeNode("Untitled/Overview.md", true);
        injected.isInjectedFolderNote = true;
        const realBacklink = makeNode(
            "Untitled/Untitled 2/Overview.md",
            true,
            [],
            [makeReference("Untitled/Untitled 2/Overview.md")],
        );
        const inner = makeNode("Untitled/Untitled 2", false, [realBacklink]);
        const outer = makeNode("Untitled", false, [injected, inner]);

        const flat = buildFlattenedHierarchy([outer]);

        expect(flat.map((n) => n.path)).toEqual(["Untitled/Untitled 2/Overview.md"]);
    });

    it("keeps folder notes that are themselves real backlinks", () => {
        // A folder note that actually links to the active note is a legitimate
        // backlink and must survive flattening.
        const folderNoteBacklink = makeNode(
            "Folder/Folder.md",
            true,
            [],
            [makeReference("Folder/Folder.md")],
        );
        const folder = makeNode("Folder", false, [folderNoteBacklink]);

        const flat = buildFlattenedHierarchy([folder]);

        expect(flat.map((n) => n.path)).toEqual(["Folder/Folder.md"]);
    });
});
