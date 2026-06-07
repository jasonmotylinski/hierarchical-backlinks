// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { TreeNodeView } from "../treeNodeView";
import { TreeNode } from "../treeNode";
import type { ViewState, HierarchicalBacklinksSettings } from "../../types";

// `obsidian` is aliased to src/__mocks__/obsidian.ts via vitest.config.ts.

// Obsidian augments HTMLElement with createDiv/createEl/setAttr/setText/
// toggleClass; polyfill the minimal behaviour render() relies on under jsdom.
beforeAll(() => {
    function createChild(this: HTMLElement, tag: string, o?: { cls?: string; text?: string }) {
        const el = document.createElement(tag);
        if (o?.cls) el.className = o.cls;
        if (o?.text) el.textContent = o.text;
        this.appendChild(el);
        return el;
    }
    const proto = HTMLElement.prototype as any;
    proto.createDiv = function (o?: { cls?: string; text?: string }) {
        return createChild.call(this, "div", o);
    };
    proto.createEl = function (tag: string, o?: { cls?: string; text?: string }) {
        return createChild.call(this, tag, o);
    };
    proto.setAttr = function (name: string, value: string) {
        this.setAttribute(name, value);
    };
    proto.setText = function (text: string) {
        this.textContent = text;
    };
    proto.toggleClass = function (cls: string, on: boolean) {
        this.classList.toggle(cls, on);
    };
});

const settings: HierarchicalBacklinksSettings = {
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

function makeApp(openLinkText: ReturnType<typeof vi.fn>): App {
    return {
        vault: {
            getFileByPath: (path: string) =>
                path.endsWith(".md")
                    ? {
                          path,
                          name: path.split("/").pop(),
                          basename: path.split("/").pop()?.replace(/\.md$/, ""),
                      }
                    : null,
        },
        metadataCache: {
            getFirstLinkpathDest: () => null,
            getFileCache: () => null,
        },
        workspace: { openLinkText },
    } as unknown as App;
}

function renderInto(app: App, node: TreeNode, viewState: ViewState): HTMLElement {
    const parent = document.createElement("div");
    const view = new TreeNodeView(app, parent as HTMLDivElement, node, viewState, settings);
    view.render();
    return parent;
}

/**
 * Issue #155: Flatten Tree Clicking Is Different Than Hierarchy Clicking
 *
 * In hierarchy mode, merged folder-note rows navigate when any part of the row
 * is clicked. Leaf rows (which is all rows in flatten mode) only navigated on
 * the text. Whole-row clicks must navigate for leaves too.
 */
describe("TreeNodeView row clicks (issue #155)", () => {
    it("navigates when the row of a leaf node is clicked (flatten mode rows)", () => {
        const openLinkText = vi.fn();
        const parent = renderInto(makeApp(openLinkText), makeNode("Notes/note.md", true), makeViewState());

        const row = parent.querySelector(".tree-item-self") as HTMLElement;
        row.click();

        expect(openLinkText).toHaveBeenCalledTimes(1);
        expect(openLinkText).toHaveBeenCalledWith("note", "Notes/note.md");
    });

    it("still navigates when the leaf row text is clicked", () => {
        const openLinkText = vi.fn();
        const parent = renderInto(makeApp(openLinkText), makeNode("Notes/note.md", true), makeViewState());

        const inner = parent.querySelector(".tree-item-inner") as HTMLElement;
        inner.click();

        expect(openLinkText).toHaveBeenCalledTimes(1);
        expect(openLinkText).toHaveBeenCalledWith("note", "Notes/note.md");
    });

    it("navigates on whole-row click of a merged folder-note row (hierarchy mode)", () => {
        const openLinkText = vi.fn();
        const folderNote = makeNode("Projects/Projects.md", true);
        const folder = makeNode("Projects", false, [folderNote]);
        const parent = renderInto(makeApp(openLinkText), folder, makeViewState());

        const row = parent.querySelector(".tree-item-self") as HTMLElement;
        row.click();

        expect(openLinkText).toHaveBeenCalledTimes(1);
        expect(openLinkText).toHaveBeenCalledWith("Projects", "Projects/Projects.md");
    });

    it("toggles (not navigates) on row click of a plain folder", () => {
        const openLinkText = vi.fn();
        const leafA = makeNode("Folder/a.md", true);
        const leafB = makeNode("Folder/b.md", true);
        const folder = makeNode("Folder", false, [leafA, leafB]);
        const viewState = makeViewState();
        const parent = renderInto(makeApp(openLinkText), folder, viewState);

        const row = parent.querySelector(".tree-item-self") as HTMLElement;
        row.click();

        expect(openLinkText).not.toHaveBeenCalled();
        expect(viewState.nodeStates.get("Folder")?.isCollapsed).toBe(true);
    });
});
