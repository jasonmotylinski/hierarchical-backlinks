import { ItemView, WorkspaceLeaf } from "obsidian";
import { File } from "./file";
import HierarchicalBacklinksPlugin from "./main";
import { TreeNodeModel } from "./treeNodeModel";
import { TreeNodeView } from "./treeNodeView";
import { ViewState, NodeViewState } from "./types";
import { parseSearchQuery } from "./search/parse";
import { makePredicate } from "./search/evaluate";
import { Logger } from "./utils/logger";
import { uiState } from "./ui/uiState";
import { BacklinksLayout } from "./ui/layout";

const ENABLE_LOG = false; // Set to false to disable logging in this file
const ENABLE_LOG_SORT = true; // Set to false to disable logging in sort-related methods

export const VIEW_TYPE = "hierarchical-backlinks";


export class HierarchicalBacklinksView extends ItemView {
    private plugin: HierarchicalBacklinksPlugin;
    private treeNodeViews: TreeNodeView[] = [];
    private originalHierarchy: TreeNodeModel[] = [];
    private viewState: ViewState | null = null;
    private currentNoteId: string | null = null;
    private sortDescending: boolean = false;
    private layout: BacklinksLayout | null = null;
    private isFlattened: boolean = false;
    private flattenedHierarchy: TreeNodeModel[] = [];
    constructor(leaf: WorkspaceLeaf, plugin: HierarchicalBacklinksPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return VIEW_TYPE;
    }

    getIcon(): string {
        return "links-coming-in";
    }

    getDisplayText(): string {
        return "Hierarchical backlinks";
    }

    async initialize() {
        Logger.debug(ENABLE_LOG_SORT, "[initialize] start");
        const container = this.containerEl.children[1] as HTMLElement; // .view-content

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;
        const noteId = activeFile.path;
        if (this.currentNoteId !== noteId || !this.viewState) {
            this.currentNoteId = noteId;
            this.viewState = {
                nodeStates: new Map<string, NodeViewState>(),
            };
        }
        const file = new File(this.app, activeFile);
        const hierarchy = await file.getBacklinksHierarchy();
        this.originalHierarchy = hierarchy;


        // Recompute flattened view if needed
        if (this.isFlattened) {
            this.flattenedHierarchy = this.buildFlattenedHierarchy(this.originalHierarchy);
            this.createPane(container, this.flattenedHierarchy);
        } else {
            this.createPane(container, this.originalHierarchy);
        }
    }

    createPane(container: Element, hierarchy: TreeNodeModel[]) {
        Logger.debug(ENABLE_LOG_SORT, `[createPane] rendering with ${hierarchy.length} root nodes`);
        // Delegate all layout/DOM work to BacklinksLayout
        this.layout = new BacklinksLayout(this.app);

        // Reset views before rendering
        this.treeNodeViews = [];

        const { treeNodeViews } = this.layout.mount(container as HTMLDivElement, hierarchy, {
            createTreeNodeView: (containerEl, node) => {
                const v = new TreeNodeView(
                    this.app,
                    containerEl,
                    node,
                    this.viewState!,
                    this.plugin.settings.preserveCollapseState
                );
                this.treeNodeViews.push(v);
                return v;
            },
            onListToggle: (collapsed) => {
                if (collapsed) {
                    this.treeNodeViews.forEach((n) => n.listToggleOn());
                } else {
                    this.treeNodeViews.forEach((n) => n.listToggleOff());
                }
            },
            onContentToggle: (collapsed) => {
                if (collapsed) {
                    this.treeNodeViews.forEach((n) => n.contentHiddenToggleOn());
                } else {
                    this.treeNodeViews.forEach((n) => n.contentHiddenToggleOff());
                }
            },
            onSearchChange: (q) => {
                this.filterBacklinks(q);
            },
            onSortToggle: (descending: boolean) => {
                Logger.debug(ENABLE_LOG_SORT, `[createPane:onSortToggle] Triggered with descending=${descending}`);
                this.updateSortOrder(descending);
            },
            onFlattenToggle: (flattened: boolean) => {
                this.toggleFlatten(flattened);
            },
            initialFlattened: this.isFlattened,
        });

        this.treeNodeViews = treeNodeViews;
        // Re-apply per-node collapsed & visibility states after remount
        for (const v of this.treeNodeViews) {
            v.updateCollapsedState();
        }
        Logger.debug(ENABLE_LOG_SORT, "[createPane] re-applied collapsed/visibility states to", this.treeNodeViews.length, "nodes");
    }

    private updateSortOrder(descending: boolean) {
        Logger.debug(ENABLE_LOG_SORT, `[updateSortOrder] Current=${this.sortDescending}, New=${descending}`);
        this.sortDescending = descending;

        // In-place DOM reorder of roots; no remount, state preserved
        this.layout?.resortRoots(this.sortDescending);
    }

    private filterBacklinks(query: string) {
        const trimmed = query.trim().toLowerCase();

        if (!this.viewState) {
            // safety: create a default view state if not present
            this.viewState = { nodeStates: new Map<string, NodeViewState>() };
        }
        uiState.query = trimmed;

        // Build search predicate (bare terms target content by default)
        const { clauses } = parseSearchQuery(trimmed, "default");
        const pred = makePredicate(clauses, { defaultKey: "default" });


        const ensureState = (path: string): NodeViewState => {
            let s = this.viewState!.nodeStates.get(path);
            if (!s) {
                s = { isCollapsed: false, isVisible: true };
                this.viewState!.nodeStates.set(path, s);
            }
            return s;
        };

        const resetVisibility = (node: TreeNodeModel) => {
            const s = ensureState(node.path);
            s.isVisible = true;
            for (const child of node.children) {
                resetVisibility(child);
            }
        };

        const markVisibility = (node: TreeNodeModel): boolean => {
            // const pathSegments = node.path?.toLowerCase().split("/") ?? [];
            // const pathMatch = pathSegments.some(segment => segment.includes(trimmed));
            // const contentMatch = node.content?.toLowerCase().includes(trimmed) ?? false;
            // const isMatch = node.isLeaf && (pathMatch || contentMatch);
            const isMatch = node.isLeaf && pred(node);

            let childrenMatch = false;


            for (const child of node.children) {
                const childMatches = markVisibility(child);
                if (childMatches) childrenMatch = true;
            }


            const state = ensureState(node.path);
            state.isVisible = isMatch || childrenMatch;

            Logger.debug(ENABLE_LOG, `[filterTree] node="${node.path}", isLeaf=${node.isLeaf}, isMatch=${isMatch}, childrenMatches=${childrenMatch}`);
            return state.isVisible;

        };

        if (trimmed.length === 0) {
            for (const node of this.originalHierarchy) {
                resetVisibility(node);
            }
        } else {
            for (const node of this.originalHierarchy) {
                markVisibility(node);
            }
        }

        //console.debug(`[filterBacklinks] Query: "${trimmed}"`);
        Logger.debug(ENABLE_LOG, `[filterBacklinks] Query: "${trimmed}"`);

        // Update visibility of treeNodeViews in-place
        for (const treeNodeView of this.treeNodeViews) {
            treeNodeView.updateCollapsedState();
        }
    }

    register_events() {
        this.plugin.registerEvent(this.app.metadataCache.on("changed", () => {
            this.initialize();
        }));

        this.plugin.registerEvent(this.app.workspace.on("layout-change", () => {
            this.initialize();
        }));

        this.plugin.registerEvent(this.app.workspace.on("file-open", () => {
            this.initialize();
        }));

    }

    async onOpen() {
        this.register_events();
        return this.initialize();
    }

    /**
     * Build a flat list of leaf nodes from a hierarchical tree.
     * Preserves node identity (path) so viewState (isVisible/isCollapsed) continues to apply.
     */
    private buildFlattenedHierarchy(hierarchy: TreeNodeModel[]): TreeNodeModel[] {
        const leaves: TreeNodeModel[] = [];

        const walk = (node: TreeNodeModel) => {
            if (node.isLeaf) {
                // clone the node but drop children to ensure it's rendered as a root leaf
                leaves.push({
                    ...node,
                    children: [],
                    setFrontmatter: node.setFrontmatter, // Include the required method
                });
                return;
            }
            for (const c of node.children) walk(c);
        };

        for (const root of hierarchy) walk(root);
        return leaves;
    }

    private toggleFlatten(flattened: boolean) {
        // Preserve state map; only switch the rendered data source
        if (this.isFlattened === flattened) return;
        this.isFlattened = flattened;

        const container = this.containerEl.children[1] as HTMLElement; // .view-content

        if (this.isFlattened) {
            this.flattenedHierarchy = this.buildFlattenedHierarchy(this.originalHierarchy);
            this.createPane(container, this.flattenedHierarchy);
        } else {
            this.createPane(container, this.originalHierarchy);
        }

        // After remount, re-apply collapsed/visibility states (handled by createPane)
        // Ensure current sort order is respected without remounting again
        this.layout?.resortRoots(this.sortDescending);
    }

}