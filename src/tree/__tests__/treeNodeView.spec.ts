import { afterEach, describe, expect, it, vi } from "vitest";
import { TreeNodeView } from "../treeNodeView";
import { TreeNode } from "../treeNode";
import { uiState } from "../../ui/uiState";
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

/**
 * Issue #145: `Collapse Tree` should only target folders, not results.
 *
 * "Collapse tree" and "Collapse results" are separate buttons. Collapsing the
 * tree must collapse folder rows only; leaf rows (whose collapse state hides
 * the result match block) keep following the "Collapse results" toggle.
 */
describe("TreeNodeView.listToggleOn (issue #145)", () => {
    afterEach(() => {
        uiState.listCollapsed = false;
        uiState.contentCollapsed = false;
    });

    it("collapses folder nodes", () => {
        const leaf = makeNode("Folder/note.md", true);
        const folder = makeNode("Folder", false, [leaf]);
        const viewState = makeViewState();
        const view = makeView(folder, viewState);

        view.listToggleOn();

        expect(viewState.nodeStates.get("Folder")?.isCollapsed).toBe(true);
    });

    it("leaves results expanded when 'Collapse results' is off", () => {
        uiState.contentCollapsed = false;
        const leaf = makeNode("Folder/note.md", true);
        const folder = makeNode("Folder", false, [leaf]);
        const viewState = makeViewState();
        const folderView = makeView(folder, viewState);
        const leafView = makeView(leaf, viewState);
        (folderView as any).treeNodeViewChildren = [leafView];

        folderView.listToggleOn();

        // Folder collapses, but the leaf (its results) does not
        expect(viewState.nodeStates.get("Folder")?.isCollapsed).toBe(true);
        expect(viewState.nodeStates.get("Folder/note.md")?.isCollapsed).toBe(false);
    });

    it("collapses results when 'Collapse results' is on", () => {
        uiState.contentCollapsed = true;
        const leaf = makeNode("Folder/note.md", true);
        const viewState = makeViewState();
        const view = makeView(leaf, viewState);

        view.listToggleOn();

        expect(viewState.nodeStates.get("Folder/note.md")?.isCollapsed).toBe(true);
    });

    it("does nothing to flattened leaves when 'Collapse results' is off", () => {
        // In flatten mode every row is a leaf; "Collapse tree" must not hide
        // their match blocks (the reporter's flatten-mode scenario).
        uiState.contentCollapsed = false;
        const leaf = makeNode("Folder/note.md", true);
        const viewState = makeViewState();
        const view = makeView(leaf, viewState);

        view.listToggleOn();

        expect(viewState.nodeStates.get("Folder/note.md")?.isCollapsed).toBe(false);
    });

    it("stays symmetric with listToggleOff", () => {
        uiState.contentCollapsed = false;
        const leaf = makeNode("Folder/note.md", true);
        const folder = makeNode("Folder", false, [leaf]);
        const viewState = makeViewState();
        const folderView = makeView(folder, viewState);
        const leafView = makeView(leaf, viewState);
        (folderView as any).treeNodeViewChildren = [leafView];

        folderView.listToggleOn();
        folderView.listToggleOff();

        expect(viewState.nodeStates.get("Folder")?.isCollapsed).toBe(false);
        expect(viewState.nodeStates.get("Folder/note.md")?.isCollapsed).toBe(false);
    });
});

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

    it("expands a leaf even when its parent folder is collapsed (issue #147)", () => {
        const leaf = makeNode("Folder/note.md", true);
        const folder = makeNode("Folder", false, [leaf]);
        const viewState = makeViewState();
        viewState.nodeStates.set("Folder", { isCollapsed: true, isVisible: true });
        viewState.nodeStates.set("Folder/note.md", { isCollapsed: true, isVisible: true });
        const view = makeView(leaf, viewState);

        (view as any).contentHiddenToggleOff();

        expect(viewState.nodeStates.get("Folder/note.md")?.isCollapsed).toBe(false);
    });

    it("expands a flattened leaf whose original folder-note parent is collapsed (issue #146)", () => {
        // Reproduces: 1) Collapse Results (collapses folder-note + leaf)
        //             2) Flatten Tree (rebuilds with leaves as roots; parent ref persists)
        //             3) Toggle Collapse Results off — leaf must expand
        const folderNoteFile = makeNode("Folder/Folder.md", true);
        const folder = makeNode("Folder", false, [folderNoteFile]);
        const viewState = makeViewState();
        // After step 1, the folder-note display node is marked collapsed
        viewState.nodeStates.set("Folder", { isCollapsed: true, isVisible: true });
        viewState.nodeStates.set("Folder/Folder.md", { isCollapsed: true, isVisible: true });
        // Flattened render keeps `parent` reference but does not include the folder view
        const view = makeView(folderNoteFile, viewState);

        (view as any).contentHiddenToggleOff();

        expect(viewState.nodeStates.get("Folder/Folder.md")?.isCollapsed).toBe(false);
    });
});
