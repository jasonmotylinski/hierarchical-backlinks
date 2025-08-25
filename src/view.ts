import { ItemView, WorkspaceLeaf } from "obsidian";
import { File } from "./file";
import HierarchicalBacklinksPlugin from "./main";
import { TreeNode } from "./treeNode";
import { TreeNodeView } from "./treeNodeView";
import { ViewState, NodeViewState, LockedTreeSnapshot } from "./types";
import { parseSearchQuery } from "./search/parse";
import { makePredicate } from "./search/evaluate";
import { Logger } from "./utils/logger";
import { uiState } from "./ui/uiState";
import { BacklinksLayout } from "./ui/layout";
import { getOrCreateNodeViewState } from "./viewState";

const ENABLE_LOG_FILTER = false; // Set to false to disable logging in filter-related methods
const ENABLE_LOG_FILTER_VERBOSE = false; // Ultra-verbose per-node logging.
const ENABLE_LOG_SORT = false; // Set to false to disable logging in sort-related methods

export const VIEW_TYPE = "hierarchical-backlinks";


export class HierarchicalBacklinksView extends ItemView {
    private plugin: HierarchicalBacklinksPlugin;
    private treeNodeViews: TreeNodeView[] = [];
    private originalHierarchy: TreeNode[] = [];
    private viewState: ViewState | null = null;
    private currentNoteId: string | null = null;
    private sortDescending: boolean = false;
    private layout: BacklinksLayout | null = null;
    private isFlattened: boolean = false;
    private flattenedHierarchy: TreeNode[] = [];
    private isSortRestore: boolean = false;
    private sortSnapshot?: Map<string, { isCollapsed: boolean; isVisible: boolean }>;
    private searchSeq: number = 0;
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

        // Always set the current note id first
        this.currentNoteId = noteId;

        // Prefer a locked snapshot from main (snapshot presence = locked)
        const snap = this.plugin.locks.get(noteId);
        if (snap) {
            this.viewState = snap.viewState;
            this.viewState.isLocked = true;
            this.originalHierarchy = snap.hierarchy;
        } else {
            this.viewState = {
                nodeStates: new Map<string, NodeViewState>(),
                isLocked: false,
            };
            const file = new File(this.app, activeFile);
            const hierarchy = await file.getBacklinksHierarchy();
            this.originalHierarchy = hierarchy;
        }
        this.sortDescending = uiState.sortCollapsed ?? false;


        // Recompute flattened view if needed
        if (this.isFlattened) {
            this.flattenedHierarchy = this.buildFlattenedHierarchy(this.originalHierarchy);
            this.createPane(container, this.flattenedHierarchy);
        } else {
            this.createPane(container, this.originalHierarchy);
        }
        this.updateSortOrder(this.sortDescending);
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

    createPane(container: Element, hierarchy: TreeNode[]) {
        Logger.debug(ENABLE_LOG_SORT, `[createPane] rendering with ${hierarchy.length} root nodes`);
        Logger.debug(ENABLE_LOG_SORT, "[createPane] START: resetting collected views");
        // Delegate all layout/DOM work to BacklinksLayout
        this.layout = new BacklinksLayout(this.app);

        // Reset views before rendering
        this.treeNodeViews = [];
        Logger.debug(ENABLE_LOG_SORT, "[createPane] treeNodeViews reset -> count:", this.treeNodeViews.length);

        Logger.debug(ENABLE_LOG_SORT, "[createPane] calling layout.mount; current collected views:", this.treeNodeViews.length);
        this.layout.mount(container as HTMLDivElement, hierarchy, {
            createTreeNodeView: (containerEl, node) => {
                const v = new TreeNodeView(
                    this.app,
                    containerEl,
                    node,
                    this.viewState!
                );
                // Collects nodes and appends their children to them
                this.treeNodeViews.push(v);
                Logger.debug(ENABLE_LOG_SORT, "[createPane] created TreeNodeView for:", node.path);
                return v;
            },
            onListToggle: (collapsed) => {
                if (this.viewState?.isLocked) return;
                if (collapsed) {
                    this.treeNodeViews.forEach((n) => n.listToggleOn());
                } else {
                    this.treeNodeViews.forEach((n) => n.listToggleOff());
                }
            },
            onContentToggle: (collapsed) => {
                if (this.viewState?.isLocked) return;
                if (collapsed) {
                    this.treeNodeViews.forEach((n) => n.contentHiddenToggleOn());
                } else {
                    this.treeNodeViews.forEach((n) => n.contentHiddenToggleOff());
                }
            },
            onSearchChange: (q) => {
                if (this.viewState?.isLocked) return;
                this.filterBacklinks(q);
            },
            onSortToggle: (descending: boolean) => {
                if (this.viewState?.isLocked) return;
                Logger.debug(ENABLE_LOG_SORT, `[createPane:onSortToggle] Triggered with descending=${descending}`);
                this.updateSortOrder(descending);
            },
            onFlattenToggle: (flattened: boolean) => {
                if (this.viewState?.isLocked) return;
                this.toggleFlatten(flattened);
            },
            onLockToggle: (locked: boolean) => {
                if (!this.currentNoteId || !this.viewState) return;
                // this.viewState.isLocked = locked;
                if (locked) {
                    const snap = this.captureSnapshot();
                    this.plugin.locks.set(this.currentNoteId, snap);
                } else {
                    this.plugin.locks.delete(this.currentNoteId);

                    // >>> Minimal resync to globals on unlock <<<
                    this.isFlattened = !!uiState.flattenCollapsed;
                    this.sortDescending = !!uiState.sortCollapsed;
                }
                this.initialize();
            },
            initialLocked: this.viewState?.isLocked ?? false,
            // initialLocked: !!this.plugin.lockedTrees.get(this.currentNoteId ?? ""),
            initialFlattened: this.isFlattened,
        });
        Logger.debug(ENABLE_LOG_SORT, "[createPane] layout.mount finished; collected views:", this.treeNodeViews.length);
        Logger.debug(ENABLE_LOG_SORT, "[createPane] collected node paths:", this.treeNodeViews.map(v => v.TreeNode.path));

        // === SORT RESTORE (special path) ============================================
        if (this.isSortRestore && this.sortSnapshot) {
            Logger.debug(ENABLE_LOG_SORT, "[createPane] SORT RESTORE: applying snapshot");

            // 1) Overwrite viewState with the snapshot we took before sorting
            this.restoreNodeStatesFrom(this.sortSnapshot);

            // 2) Apply restored states to all rendered views (deep preferred)
            for (const v of this.treeNodeViews) {
                v.applyNodeViewStateToUI();
            }
            // 3) Clear snapshot/flag and EXIT EARLY so nothing else runs this cycle
            this.isSortRestore = false;
            this.sortSnapshot = undefined;
            Logger.debug(ENABLE_LOG_SORT, "[createPane] SORT RESTORE: done");
            return; // ← important: skip global toggles/etc. for this special pass
        }
        // ============================================================================

        // 1. Apply global list/content states only when UNLOCKED
        if (!this.viewState?.isLocked) {
            if (uiState.listCollapsed) {
                this.treeNodeViews.forEach(v => v.listToggleOn());
            } else {
                this.treeNodeViews.forEach(v => v.listToggleOff());
            }
            if (uiState.contentCollapsed) {
                this.treeNodeViews.forEach(v => v.contentHiddenToggleOn());
            } else {
                this.treeNodeViews.forEach(v => v.contentHiddenToggleOff());
            }
        }

        // 2. Then update UI
        for (const v of this.treeNodeViews) {
            v.applyNodeViewStateToUI();
        }
        Logger.debug(ENABLE_LOG_SORT, "[createPane] re-applied collapsed/visibility states to", this.treeNodeViews.length, "nodes");
        Logger.debug(ENABLE_LOG_SORT, "[createPane] DONE with createPane");
    }

    private snapshotNodeStates(): Map<string, { isCollapsed: boolean; isVisible: boolean }> {
        const snap = new Map<string, { isCollapsed: boolean; isVisible: boolean }>();
        for (const [path, st] of this.viewState!.nodeStates.entries()) {
            snap.set(path, { isCollapsed: !!st.isCollapsed, isVisible: st.isVisible !== false });
        }
        return snap;
    }

    private restoreNodeStatesFrom(snapshot: Map<string, { isCollapsed: boolean; isVisible: boolean }>): void {
        for (const [path, st] of snapshot.entries()) {
            this.viewState!.nodeStates.set(path, { isCollapsed: st.isCollapsed, isVisible: st.isVisible });
        }
    }

    /** Deep clone the hierarchy so we can sort without mutating originals */
    private cloneHierarchy(nodes: TreeNode[]): TreeNode[] {
        return nodes.map((n) => ({
            ...n,
            // recursively clone children
            children: this.cloneHierarchy(n.children || []),
            setFrontmatter: n.setFrontmatter, // Include the required method
        }));
    }

    /** Recursively sort nodes by the leaf name of their path (A→Z or Z→A). */
    private deepSortHierarchy(models: TreeNode[], descending: boolean): void {
        const nameOf = (n: TreeNode) => (n.path?.split("/").pop() ?? "").toLowerCase();
        const cmp = (a: TreeNode, b: TreeNode) =>
            descending ? nameOf(b).localeCompare(nameOf(a)) : nameOf(a).localeCompare(nameOf(b));

        models.sort(cmp);
        for (const m of models) {
            if (Array.isArray(m.children) && m.children.length > 0) {
                this.deepSortHierarchy(m.children, descending);
            }
        }
    }

    private updateSortOrder(descending: boolean) {
        Logger.debug(ENABLE_LOG_SORT, `[updateSortOrder] Current=${this.sortDescending}, New=${descending}`);
        this.sortDescending = descending;
        Logger.debug(ENABLE_LOG_SORT, "[updateSortOrder] BEFORE remount; collected views:", this.treeNodeViews.length,
            "flattened=", this.isFlattened);
        // We rebuild the DOM from a sorted data source and rely on createPane()
        // to reapply per-node states (isCollapsed/isVisible) via viewState.
        const container = this.containerEl.children[1] as HTMLElement; // .view-content

        if (this.isFlattened) {
            // Rebuild flattened list, sort (shallow), and remount
            const leaves = this.buildFlattenedHierarchy(this.originalHierarchy);
            const nameOf = (n: TreeNode) => (n.path?.split("/").pop() ?? "").toLowerCase();
            leaves.sort((a, b) =>
                descending ? nameOf(b).localeCompare(nameOf(a)) : nameOf(a).localeCompare(nameOf(b))
            );
            this.createPane(container, leaves);
            Logger.debug(ENABLE_LOG_SORT, "[updateSortOrder] AFTER remount; collected views:", this.treeNodeViews.length);
        } else {
            // Take snapshot for sort restore
            this.sortSnapshot = this.snapshotNodeStates();
            this.isSortRestore = true;

            // Deep sort a cloned hierarchy so we don't mutate the original
            const cloned = this.cloneHierarchy(this.originalHierarchy);
            this.deepSortHierarchy(cloned, descending);
            this.createPane(container, cloned);
            Logger.debug(ENABLE_LOG_SORT, "[updateSortOrder] AFTER remount; collected views:", this.treeNodeViews.length);
        }
    }

    private getOrCreateNodeViewState(nodeId: string): NodeViewState {
        if (!this.viewState) {
            this.viewState = { nodeStates: new Map<string, NodeViewState>(), isLocked: false };
        }
        return getOrCreateNodeViewState(this.viewState, nodeId);
    }

    private resetVisibilityForTree(node: TreeNode): void {
        const s = this.getOrCreateNodeViewState(node.path);
        s.isVisible = true;
        for (const child of node.children) {
            this.resetVisibilityForTree(child);
        }
    }

    private markVisibilityForTree(
        node: TreeNode,
        pred: (n: TreeNode) => boolean,
        sid?: number
    ): boolean {
        const isMatch = node.isLeaf && pred(node);

        const predRaw = pred(node);            // does the predicate think this node matches?
        const leafGate = node.isLeaf;          // is the node a leaf?
        const finMatch = leafGate && predRaw;   // your current behavior

        Logger.debug(ENABLE_LOG_FILTER_VERBOSE,
            `[testTerm:diag] node="${node.path}" leaf=${leafGate} predRaw=${predRaw} finalMatch=${finMatch}`);

        // before:
        // const childrenMatch = node.children.some(child =>
        //   this.markVisibilityForTree(child, pred, sid)
        // );

        let childrenMatch = false;
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const childVisible = this.markVisibilityForTree(child, pred, sid);

            Logger.debug(
                ENABLE_LOG_FILTER_VERBOSE,
                `[children-visit${sid ? ":" + sid : ""}] parent="${node.path}" idx=${i}/${node.children.length - 1} child="${child.path}" -> visible=${childVisible}`
            );

            // Aggregate visibility across ALL children; do not short-circuit so
            // every child's visibility state gets updated during this pass.
            childrenMatch = childrenMatch || childVisible;
        }

        const state = this.getOrCreateNodeViewState(node.path);
        const prevVisible = state.isVisible !== false; // default true if undefined
        const nextVisible = isMatch || childrenMatch;
        state.isVisible = nextVisible;

        Logger.debug(
            ENABLE_LOG_FILTER_VERBOSE,
            `[filterTree${sid ? ":" + sid : ""}] node="${node.path}", isLeaf=${node.isLeaf}, isMatch=${isMatch}, childrenMatches=${childrenMatch}, visible ${prevVisible} -> ${nextVisible}`
        );

        return state.isVisible;
    }

    private takeVisibilitySnapshot(nodes: TreeNode[]): Map<string, boolean> {
        const snap = new Map<string, boolean>();
        const walk = (n: TreeNode) => {
            const st = this.getOrCreateNodeViewState(n.path);
            const vis = st.isVisible !== false; // default true
            snap.set(n.path, vis);
            for (const c of n.children) walk(c);
        };
        for (const r of nodes) walk(r);
        return snap;
    }

    private summarizeVisibility(nodes: TreeNode[]): { total: number; visible: number; visibleLeaves: number; visibleFolders: number } {
        let total = 0, visible = 0, visibleLeaves = 0, visibleFolders = 0;
        const walk = (n: TreeNode) => {
            total++;
            const st = this.getOrCreateNodeViewState(n.path);
            const vis = st.isVisible !== false; // default true
            if (vis) {
                visible++;
                if (n.isLeaf) visibleLeaves++; else visibleFolders++;
            }
            for (const c of n.children) walk(c);
        };
        for (const r of nodes) walk(r);
        return { total, visible, visibleLeaves, visibleFolders };
    }

    private filterBacklinks(query: string) {
        const trimmed = query.trim().toLowerCase();
        const sid = ++this.searchSeq;

        Logger.debug(ENABLE_LOG_FILTER, `[filterBacklinks:${sid}] ROOTS=${this.originalHierarchy.length} flattened=${this.isFlattened}`);
        const allPaths: string[] = [];
        const collect = (n: TreeNode) => { allPaths.push(n.path); n.children.forEach(collect); };
        this.originalHierarchy.forEach(collect);
        Logger.debug(ENABLE_LOG_FILTER_VERBOSE, `[filterBacklinks:${sid}] VISITABLE nodes=${allPaths.length} sample[0..10]=`, allPaths.slice(0, 10));

        uiState.query = trimmed;

        Logger.debug(ENABLE_LOG_FILTER, `[filterBacklinks:${sid}] BEGIN query="${trimmed}"`);

        // Snapshot visibility before filtering
        const before = this.takeVisibilitySnapshot(this.originalHierarchy);

        // Build search predicate (bare terms target content by default)
        const { clauses } = parseSearchQuery(trimmed, "default");
        const pred = makePredicate(clauses, { defaultKey: "default" });

        if (trimmed.length === 0) {
            for (const node of this.originalHierarchy) {
                this.resetVisibilityForTree(node);
            }
        } else {
            for (const node of this.originalHierarchy) {
                this.markVisibilityForTree(node, pred, sid);
            }
        }

        // Snapshot visibility after filtering and compute diff
        const after = this.takeVisibilitySnapshot(this.originalHierarchy);
        let changed = 0;
        for (const [path, prev] of before.entries()) {
            const curr = after.get(path);
            if (curr !== prev) changed++;
        }

        const summary = this.summarizeVisibility(this.originalHierarchy);
        Logger.debug(
            ENABLE_LOG_FILTER,
            `[filterBacklinks:${sid}] END query="${trimmed}" | changed=${changed} | total=${summary.total}, visible=${summary.visible} (leaves=${summary.visibleLeaves}, folders=${summary.visibleFolders})`
        );

        // Update visibility of treeNodeViews in-place (roots only; method recurses into children)
        for (const v of this.treeNodeViews) {
            v.applyNodeViewStateToUI();
        }
    }

    /**
     * Build a flat list of leaf nodes from a hierarchical tree.
     * Preserves node identity (path) so viewState (isVisible/isCollapsed) continues to apply.
     */
    private buildFlattenedHierarchy(hierarchy: TreeNode[]): TreeNode[] {
        const leaves: TreeNode[] = [];

        const walk = (node: TreeNode) => {
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
        this.updateSortOrder(this.sortDescending);
    }

    private cloneViewState(): ViewState {
        const map = new Map<string, NodeViewState>();
        for (const [k, v] of this.viewState!.nodeStates.entries()) {
            map.set(k, { isCollapsed: !!v.isCollapsed, isVisible: v.isVisible });
        }
        return { nodeStates: map, isLocked: true };
    }

    private captureSnapshot(): LockedTreeSnapshot {
        const source = this.isFlattened ? this.flattenedHierarchy : this.originalHierarchy;
        const frozenHierarchy = this.cloneHierarchy(source);
        return {
            hierarchy: frozenHierarchy,
            viewState: this.cloneViewState(),
        };
    }

}