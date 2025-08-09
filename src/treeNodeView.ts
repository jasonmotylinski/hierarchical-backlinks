import { App, setIcon } from "obsidian";
import { SearchResultFileMatchView } from "./searchResultFileMatchView";
import { ContentReference, ViewState, NodeViewState, NodeId } from "./types";
import { TreeNodeModel } from "./treeNodeModel";
import { Logger } from "./utils/logger";
import { uiState } from "./ui/uiState";

const ENABLE_LOG_TOGGLE = false; // Set to true to enable toggle logging
const ENABLE_LOG_CREATE = false; // Set to true to enable node creation logging

export class TreeNodeView {
    private app: App;
    private static contentHidden: boolean = false;
    private parent: HTMLDivElement;
    private treeItem: HTMLDivElement;
    private treeItemSelf: HTMLDivElement;
    private treeItemIcon: HTMLDivElement;
    private treeNode: TreeNodeModel;
    private treeNodeViewChildren: TreeNodeView[];
    private childrenContainer: HTMLDivElement | null = null;
    private matchBlock: HTMLDivElement | null = null;
    private viewState: ViewState;
    private allViews?: TreeNodeView[];

    constructor(
        app: App,
        parent: HTMLDivElement,
        treeNode: TreeNodeModel,
        viewState: ViewState,
        allViews?: TreeNodeView[],
    ) {
        this.app = app;
        this.parent = parent;
        this.treeNode = treeNode;
        this.treeNodeViewChildren = [];
        this.viewState = viewState;
        this.allViews = allViews;
        this.allViews?.push(this);             // ← add self to shared array
        Logger.debug(ENABLE_LOG_CREATE, "[TNV:ctor] path=", this.treeNode?.path);
        const kidsCount = this.treeNode?.children?.length ?? 0;
        Logger.debug(ENABLE_LOG_CREATE, "[TNV:ctor] children count=", kidsCount);
    }

    render() {
        this.treeItem = this.parent.createDiv({ cls: "tree-item" });
        this.treeItemSelf = this.treeItem.createDiv({ cls: "tree-item-self is-clickable backlink-item" });

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

        // Apply current collapsed state (hide/show children or matches)
        this.updateCollapsedState();
    }

    appendEndNode(parent: HTMLDivElement, treeNode: TreeNodeModel) {
        this.treeItemIcon = parent.createDiv({ cls: "tree-item-icon collapse-icon" });

        let name = treeNode.title;
        if (treeNode.children && treeNode.children.length == 0) {
            const firstLink = this.app.metadataCache.getFirstLinkpathDest(treeNode.title, '');

            if (firstLink) {
                name = firstLink.basename;
            }
        }

        const treeItemInner = parent.createDiv({ cls: "tree-item-inner", text: name });
        setIcon(this.treeItemIcon, 'right-triangle');

        this.treeItemIcon.addEventListener("click", (e) => {

            this.toggle();
        });
        treeItemInner.addEventListener("click", (e) => {
            this.navigateTo(treeNode.path);
        });
    }

    appendTreeItemChildren(treeItem: HTMLDivElement, children: TreeNodeModel[]) {
        this.childrenContainer = treeItem.createDiv({ cls: "tree-item-children" });
        children.forEach((c) => {
            Logger.debug(ENABLE_LOG_CREATE, "[TNV:child-create] parent=", this.treeNode?.path, "child=", c?.path);
            const treeNodeView = new TreeNodeView(
                this.app,
                this.childrenContainer!,
                c,
                this.viewState,
                this.allViews
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

    appendReferences(parent: HTMLDivElement, item: TreeNodeModel, references: ContentReference[]) {
        this.matchBlock = parent.createDiv({ cls: "search-result-file-matches" });
        const matchView = new SearchResultFileMatchView(this.app, this.matchBlock, item.content, references);
        matchView.render();
    }

    listToggleOn() {
        // Always collapse the node when toggling on.
        // Collapse this node and all descendants; also mark the list as collapsed
        uiState.listCollapsed = true;
        const state = this.ensureNodeViewState();
        state.isCollapsed = true;

        this.treeNodeViewChildren.forEach(child => child.listToggleOn());

        this.updateCollapsedState();

        Logger.debug(ENABLE_LOG_TOGGLE, "[ListToggleOn]", this.treeNode.title, "→ isCollapsed set to:", state.isCollapsed);
    }

    listToggleOff() {

        // Expand according to contentCollapsed for leaves; parents expand
        uiState.listCollapsed = false;
        const state = this.ensureNodeViewState();

        if (this.treeNode.isLeaf) {
            state.isCollapsed = uiState.contentCollapsed;
        } else {
            state.isCollapsed = false;
        }

        this.treeNodeViewChildren.forEach(child => child.listToggleOff());

        this.updateCollapsedState();

        Logger.debug(ENABLE_LOG_TOGGLE, "[ListToggleOff]", this.treeNode.title, "| isLeaf:", this.treeNode.isLeaf, "| contentCollapsed:", uiState.contentCollapsed, "→ isCollapsed set to:", state.isCollapsed);
    }

    contentHiddenToggleOn() {

        // When content is hidden, collapse leaf nodes; keep parents as-is
        uiState.contentCollapsed = true;
        const state = this.ensureNodeViewState();


        if (this.treeNode.isLeaf) {
            Logger.debug(ENABLE_LOG_TOGGLE, "[ContentHiddenToggleOn]", this.treeNode.title, "| isLeaf:", true, "→ Collapsing");
            state.isCollapsed = true;
        } else {
            Logger.debug(ENABLE_LOG_TOGGLE, "[ContentHiddenToggleOn]", this.treeNode.title, "| isLeaf:", false, "→ Skipping collapse");
        }

        this.treeNodeViewChildren.forEach(child => child.contentHiddenToggleOn());
        TreeNodeView.contentHidden = true;

        this.updateCollapsedState();

        Logger.debug(ENABLE_LOG_TOGGLE, "[ContentHiddenToggleOn] contentCollapsed set to true");
    }

    contentHiddenToggleOff() {

        uiState.contentCollapsed = false;
        const state = this.ensureNodeViewState();


        if (this.treeNode.isLeaf) {
            const parent = this.treeNode.parent;
            const parentCollapsed = parent ? (this.viewState.nodeStates.get(parent.path)?.isCollapsed ?? false) : false;

            Logger.debug(ENABLE_LOG_TOGGLE, "[ContentHiddenToggleOff]", this.treeNode.title, "| isLeaf:", true, "| hasParent:", !!parent, "| parent.isCollapsed:", parentCollapsed);

            if (!parent || !parentCollapsed) {
                state.isCollapsed = false;
                Logger.debug(ENABLE_LOG_TOGGLE, "[ContentHiddenToggleOff] → Expanding leaf node:", this.treeNode.title);
            } else {
                Logger.debug(ENABLE_LOG_TOGGLE, "[ContentHiddenToggleOff] → Keeping leaf node collapsed due to collapsed parent:", this.treeNode.title);
            }
        }

        this.treeNodeViewChildren.forEach(child => child.contentHiddenToggleOff());
        TreeNodeView.contentHidden = false;

        this.updateCollapsedState();

        Logger.debug(ENABLE_LOG_TOGGLE, "[ContentHiddenToggleOff] contentCollapsed set to false");
    }

    toggle() {
        const state = this.ensureNodeViewState();
        state.isCollapsed = !state.isCollapsed;

        this.updateCollapsedState();
    }

    updateCollapsedState() {
        Logger.debug(ENABLE_LOG_CREATE, "[TNV:updateCollapsedState] path=", this.treeNode?.path);
        const state = this.ensureNodeViewState();
        Logger.debug(ENABLE_LOG_CREATE, "[TNV:updateCollapsedState] current state=", state);
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
        this.treeNodeViewChildren.forEach(child => child.updateCollapsedState());
    }

    get isCollapsed(): boolean {
        return this.ensureNodeViewState().isCollapsed;
    }

    get treeNodeModel(): TreeNodeModel {
        return this.treeNode;
    }

    private ensureNodeViewState(): NodeViewState {
        const id: NodeId = this.treeNode.path;
        let state = this.viewState.nodeStates.get(id);
        if (!state) {
            state = { isCollapsed: false, isVisible: true };
            this.viewState.nodeStates.set(id, state);
        }
        return state;
    }

}
