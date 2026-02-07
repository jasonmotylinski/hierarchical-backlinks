import { describe, expect, it } from "vitest";
import { getFolderNoteChild } from "../folderNote";
import { TreeNode } from "../treeNode";

function makeNode(path: string, isLeaf: boolean, children: TreeNode[] = []): TreeNode {
    return new TreeNode(path, "", [], children, null, isLeaf);
}

describe("getFolderNoteChild", () => {
    it("returns the child when folder has a single leaf child with matching name", () => {
        const child = makeNode("Projects/Projects.md", true);
        const folder = makeNode("Projects", false, [child]);

        expect(getFolderNoteChild(folder)).toBe(child);
    });

    it("returns null when the child name does not match the folder name", () => {
        const child = makeNode("Projects/Other.md", true);
        const folder = makeNode("Projects", false, [child]);

        expect(getFolderNoteChild(folder)).toBeNull();
    });

    it("returns null when the folder has multiple children", () => {
        const child1 = makeNode("Projects/Projects.md", true);
        const child2 = makeNode("Projects/Other.md", true);
        const folder = makeNode("Projects", false, [child1, child2]);

        expect(getFolderNoteChild(folder)).toBeNull();
    });

    it("returns null when the node is a leaf", () => {
        const leaf = makeNode("Projects.md", true);

        expect(getFolderNoteChild(leaf)).toBeNull();
    });

    it("returns null when the single child is not a leaf", () => {
        const grandchild = makeNode("Projects/Sub/Sub.md", true);
        const child = makeNode("Projects/Sub", false, [grandchild]);
        const folder = makeNode("Projects", false, [child]);

        expect(getFolderNoteChild(folder)).toBeNull();
    });

    it("handles nested folder paths correctly", () => {
        const child = makeNode("Root/Sub/Projects/Projects.md", true);
        const folder = makeNode("Root/Sub/Projects", false, [child]);

        expect(getFolderNoteChild(folder)).toBe(child);
    });
});
