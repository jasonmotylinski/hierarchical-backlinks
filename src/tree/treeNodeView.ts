import { dbgTNV } from "../utils/debugger";
import { App, setIcon } from "obsidian";
import { SearchResultFileMatchView } from "../view/searchResultFileMatchView";
import { ContentReference, ViewState, NodeViewState, NodeId, HierarchicalBacklinksSettings } from "../types";
import { TreeNode } from "./treeNode";
import { uiState } from "../ui/uiState";
import { getOrCreateNodeViewState } from "../view/state";
import { getFolderNoteChild } from "./folderNote";

export class TreeNodeView {
    private app: App;
    private parent: HTMLDivElement;
    private treeItem: HTMLDivElement;
    private treeItemSelf: HTMLDivElement;
    private treeItemIcon: HTMLDivElement;
    private treeNode: TreeNode;
    private treeNodeViewChildren: TreeNodeView[];
    private childrenContainer: HTMLDivElement | null = null;
    private matchBlock: HTMLDivElement | null = null;
    private viewState: ViewState;
    private settings: HierarchicalBacklinksSettings;

    constructor(
        app: App,
        parent: HTMLDivElement,
        treeNode: TreeNode,
        viewState: ViewState,
        settings: HierarchicalBacklinksSettings,
    ) {
        this.app = app;
        this.parent = parent;
        this.treeNode = treeNode;
        this.treeNodeViewChildren = [];
        this.viewState = viewState;
        this.settings = settings;
        dbgTNV("ctor path=", this.treeNode?.path);
        const kidsCount = this.treeNode?.children?.length ?? 0;
        dbgTNV("ctor children count=", kidsCount);
    }

    render() {
        this.treeItem = this.parent.createDiv({ cls: "tree-item" });
        this.treeItemSelf = this.treeItem.createDiv({ cls: "tree-item-self is-clickable backlink-item" });

        // Check for folder note merging
        const folderNoteChild = this.settings.hideFolderNote
            ? getFolderNoteChild(this.treeNode)
            : null;

        if (folderNoteChild) {
            // Merged folder note: render folder name but navigate to the child's file
            this.appendEndNode(this.treeItemSelf, this.treeNode, folderNoteChild.path);

            // Show the reference count from the child
            const treeItemFlair = this.treeItemSelf.createDiv({ cls: "tree-item-flair-outer" }).createEl("span", { cls: "tree-item-flair" });
            const total = folderNoteChild.references.reduce((accumulator: number, curr) => {
                return accumulator += curr.content.length + curr.properties.length;
            }, 0);
            treeItemFlair.setText(total.toString());

            // Render the child's references under this folder node
            this.appendReferences(this.treeItem, folderNoteChild, folderNoteChild.references);
        } else {
            this.appendEndNode(this.treeItemSelf, this.treeNode);

            const treeItemFlair = this.treeItemSelf.createDiv({ cls: "tree-item-flair-outer" }).createEl("span", { cls: "tree-item-flair" });
            if (this.treeNode.children.length > 0) {
                this.appendTreeItemChildren(this.treeItem, this.treeNode.children);

            } else {
                const total = this.treeNode.references.reduce((accumulator: number, curr) => {
                    return accumulator += curr.content.length + curr.properties.length;
                }, 0);
                treeItemFlair.setText(total.toString());
                this.appendReferences(this.treeItem, this.treeNode, this.treeNode.references);
            }
        }

        this.applyNodeViewStateToUI();
    }

    appendEndNode(parent: HTMLDivElement, treeNode: TreeNode, navigatePath?: string) {
        this.treeItemIcon = parent.createDiv({ cls: "tree-item-icon collapse-icon" });

        this.treeItemIcon.setAttr("tabindex", "-1");
        this.treeItemIcon.setAttr("aria-hidden", "true");

        // Prevent focus steal: handle down events first
        this.treeItemIcon.addEventListener(
            "pointerdown",
            (e) => { e.preventDefault(); e.stopPropagation(); },
            { capture: true }
        );

        let name = treeNode.title;
        if (treeNode.children && treeNode.children.length == 0) {
            const firstLink = this.app.metadataCache.getFirstLinkpathDest(treeNode.title, '');

            if (firstLink) {
                name = firstLink.basename;
            }

            if (this.settings.useFrontmatterTitle) {
                const fmValue = treeNode.frontmatter?.[this.settings.frontmatterTitleProperty];
                if (typeof fmValue === "string" && fmValue.length > 0) {
                    name = fmValue;
                }
            }
        }

        const treeItemInner = parent.createDiv({ cls: "tree-item-inner", text: name });

        treeItemInner.addEventListener(
            "mousedown",
            (e) => { e.stopPropagation(); },
            { capture: true }
        );

        setIcon(this.treeItemIcon, 'right-triangle');

        this.treeItemIcon.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.viewState?.isLocked) {
                return; // strict lock: ignore triangle clicks
            }
            this.toggle();
        });
        treeItemInner.addEventListener("click", (e) => {
            this.navigateTo(navigatePath ?? treeNode.path);
        });
    }

    appendTreeItemChildren(treeItem: HTMLDivElement, children: TreeNode[]) {
        this.childrenContainer = treeItem.createDiv({ cls: "tree-item-children" });
        children.forEach((c) => {
            dbgTNV("child-create parent=", this.treeNode?.path, "child=", c?.path);
            const treeNodeView = new TreeNodeView(
                this.app,
                this.childrenContainer!,
                c,
                this.viewState,
                this.settings
            );
            treeNodeView.render();
            this.treeNodeViewChildren.push(treeNodeView);
        });

    }

    navigateTo(path: string) {
        const firstLink = this.app.metadataCache.getFirstLinkpathDest(path, '');

        if (firstLink) {
            this.app.workspace.openLinkText(firstLink.name, firstLink.path);
        }
    }

    appendReferences(parent: HTMLDivElement, item: TreeNode, references: ContentReference[]) {
        this.matchBlock = parent.createDiv({ cls: "search-result-file-matches" });
        const matchView = new SearchResultFileMatchView(this.app, this.matchBlock, item.content, references);
        matchView.render();
    }

    listToggleOn() {
        // Always collapse the node when toggling on.
        // Collapse this node and all descendants; also mark the list as collapsed
        uiState.listCollapsed = true;
        const state = this.getOrCreateNodeViewState();
        state.isCollapsed = true;

        this.treeNodeViewChildren.forEach(child => child.listToggleOn());

        this.applyNodeViewStateToUI();

        dbgTNV("ListToggleOn", this.treeNode.title, "→ isCollapsed set to:", state.isCollapsed);
    }

    listToggleOff() {

        // Expand according to contentCollapsed for leaves; parents expand
        uiState.listCollapsed = false;
        const state = this.getOrCreateNodeViewState();

        if (this.treeNode.isLeaf) {
            state.isCollapsed = uiState.contentCollapsed;
        } else {
            state.isCollapsed = false;
        }

        this.treeNodeViewChildren.forEach(child => child.listToggleOff());

        this.applyNodeViewStateToUI();

        dbgTNV("ListToggleOff", this.treeNode.title, "| isLeaf:", this.treeNode.isLeaf, "| contentCollapsed:", uiState.contentCollapsed, "→ isCollapsed set to:", state.isCollapsed);
    }

    contentHiddenToggleOn() {

        // When content is hidden, collapse leaf nodes; keep parents as-is
        uiState.contentCollapsed = true;
        const state = this.getOrCreateNodeViewState();


        if (this.treeNode.isLeaf) {
            dbgTNV("ContentHiddenToggleOn", this.treeNode.title, "| isLeaf:", true, "→ Collapsing");
            state.isCollapsed = true;
        } else {
            dbgTNV("ContentHiddenToggleOn", this.treeNode.title, "| isLeaf:", false, "→ Skipping collapse");
        }

        this.treeNodeViewChildren.forEach(child => child.contentHiddenToggleOn());

        this.applyNodeViewStateToUI();

        dbgTNV("ContentHiddenToggleOn contentCollapsed set to true");
    }

    contentHiddenToggleOff() {

        uiState.contentCollapsed = false;
        const state = this.getOrCreateNodeViewState();


        if (this.treeNode.isLeaf) {
            const parent = this.treeNode.parent;
            const parentCollapsed = parent ? (this.viewState.nodeStates.get(parent.path)?.isCollapsed ?? false) : false;

            dbgTNV("ContentHiddenToggleOff", this.treeNode.title, "| isLeaf:", true, "| hasParent:", !!parent, "| parent.isCollapsed:", parentCollapsed);

            if (!parent || !parentCollapsed) {
                state.isCollapsed = false;
                dbgTNV("ContentHiddenToggleOff → Expanding leaf node:", this.treeNode.title);
            } else {
                dbgTNV("ContentHiddenToggleOff → Keeping leaf node collapsed due to collapsed parent:", this.treeNode.title);
            }
        }

        this.treeNodeViewChildren.forEach(child => child.contentHiddenToggleOff());

        this.applyNodeViewStateToUI();

        dbgTNV("ContentHiddenToggleOff contentCollapsed set to false");
    }

    toggle() {
        if (this.viewState?.isLocked) return; // strict lock: no expand/collapse
        const state = this.getOrCreateNodeViewState();
        state.isCollapsed = !state.isCollapsed;

        this.applyNodeViewStateToUI();
    }

    // Applies this node's view state to the UI, then recursively applies to all descendant nodes.
    applyNodeViewStateToUI() {
        dbgTNV("applyNodeViewStateToUI path=", this.treeNode?.path);
        const state = this.getOrCreateNodeViewState();
        dbgTNV("applyNodeViewStateToUI current state=", state);
        let isCollapsed = state.isCollapsed;

        // NEW: if the node is not visible, hide it and skip collapse logic
        if (!state.isVisible) {
            this.treeItem.style.display = "none";
            return;
        } else {
            this.treeItem.style.display = "";
        }

        // Apply visual state
        this.treeItemSelf.toggleClass("is-collapsed", isCollapsed);
        this.treeItemIcon.toggleClass("is-collapsed", isCollapsed);

        if (this.childrenContainer) {
            this.childrenContainer.style.setProperty("display", isCollapsed ? "none" : "block");
        }
        if (this.matchBlock) {
            this.matchBlock.style.setProperty("display", isCollapsed ? "none" : "block");
        }

        // Propagate to children
        this.treeNodeViewChildren.forEach(child => child.applyNodeViewStateToUI());
    }

    get isCollapsed(): boolean {
        return getOrCreateNodeViewState(this.viewState, this.treeNode.path).isCollapsed;
    }

    get TreeNode(): TreeNode {
        return this.treeNode;
    }

    private getOrCreateNodeViewState(): NodeViewState {
        return getOrCreateNodeViewState(this.viewState, this.treeNode.path);
    }

}
