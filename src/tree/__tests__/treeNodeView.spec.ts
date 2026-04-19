import { describe, expect, it, vi } from "vitest";
import { TreeNodeView } from "../treeNodeView";
import { TreeNode } from "../treeNode";
import type { ViewState, HierarchicalBacklinksSettings } from "../../types";

vi.mock("obsidian", () => ({
    setIcon: vi.fn(),
    App: class {},
}));

const defaultSettings: HierarchicalBacklinksSettings = {
    toggleLeafNodes: false,
    boldFileNames: false,
    useFrontmatterTitle: false,
    frontmatterTitleProperty: "",
    hideFolderNote: true,
    folderNoteIndexName: "",
};

function makeViewState(): ViewState {
    return { nodeStates: new Map(), isLocked: false };
}

function makeNode(path: string, isLeaf: boolean, children: TreeNode[] = []): TreeNode {
    return new TreeNode(path, "", [], children, null, isLeaf);
}

function makeView(node: TreeNode, viewState: ViewState): TreeNodeView {
    const view = new TreeNodeView({} as any, {} as any, node, viewState, defaultSettings);
    vi.spyOn(view as any, "applyNodeViewStateToUI").mockImplementation(() => {});
    return view;
}

describe("TreeNodeView.contentHiddenToggleOn", () => {
    it("collapses a regular leaf node", () => {
        const leaf = makeNode("Notes/note.md", true);
        const viewState = makeViewState();
        const view = makeView(leaf, viewState);

        (view as any).contentHiddenToggleOn();

        expect(viewState.nodeStates.get("Notes/note.md")?.isCollapsed).toBe(true);
    });

    it("collapses a folder note node (non-leaf whose references are shown inline)", () => {
        const folderNoteChild = makeNode("Projects/Projects.md", true);
        const folderNode = makeNode("Projects", false, [folderNoteChild]);
        const viewState = makeViewState();
        const view = makeView(folderNode, viewState);

        // Simulate what render() does when hideFolderNote is enabled
        (view as any).folderNoteChild = folderNoteChild;

        (view as any).contentHiddenToggleOn();

        expect(viewState.nodeStates.get("Projects")?.isCollapsed).toBe(true);
    });
});

describe("TreeNodeView.contentHiddenToggleOff", () => {
    it("expands a regular leaf node", () => {
        const leaf = makeNode("Notes/note.md", true);
        const viewState = makeViewState();
        viewState.nodeStates.set("Notes/note.md", { isCollapsed: true, isVisible: true });
        const view = makeView(leaf, viewState);

        (view as any).contentHiddenToggleOff();

        expect(viewState.nodeStates.get("Notes/note.md")?.isCollapsed).toBe(false);
    });

    it("expands a folder note node", () => {
        const folderNoteChild = makeNode("Projects/Projects.md", true);
        const folderNode = makeNode("Projects", false, [folderNoteChild]);
        const viewState = makeViewState();
        viewState.nodeStates.set("Projects", { isCollapsed: true, isVisible: true });
        const view = makeView(folderNode, viewState);

        (view as any).folderNoteChild = folderNoteChild;

        (view as any).contentHiddenToggleOff();

        expect(viewState.nodeStates.get("Projects")?.isCollapsed).toBe(false);
    });
});
