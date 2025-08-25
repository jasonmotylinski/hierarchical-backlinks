import { ItemView, WorkspaceLeaf, MarkdownView } from "obsidian";
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
    private debugHooksInstalled: boolean = false;
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

    /** Command-friendly lock toggle for the current note. */
    public toggleLock() {
        if (!this.currentNoteId) return;

        const isLocked = !!this.plugin.locks.get(this.currentNoteId);
        if (isLocked) {
            // Unlock: drop snapshot
            this.plugin.locks.delete(this.currentNoteId);
        } else {
            // Lock: capture snapshot
            const snap = this.captureSnapshot?.();
            if (snap) this.plugin.locks.set(this.currentNoteId, snap);
        }

        // Remount so header + tree reflect new state
        this.initialize?.();
    }

    public applyGlobalsFromUiState() {
        // keep navbar in sync
        this.syncNavbarFromGlobals?.();

        if (this.isNoteLocked()) return; // frozen tree: UI only

        // 1) list/content in place
        this.applyListAndContentGlobalsInPlace?.();

        // 2) flatten (rebuild tree) if needed
        const wantFlatten = !!uiState.flattenCollapsed;
        if (wantFlatten !== this.isFlattened) {
            this.layout?.setFlattenActive(wantFlatten);
            this.toggleFlatten(wantFlatten);
        }

        // 3) sort on current tree
        this.layout?.setSortActive(!!uiState.sortCollapsed);
        this.updateSortOrder(!!uiState.sortCollapsed);

        // 4) reapply search if active
        if ((uiState.query ?? "").length > 0) {
            this.filterBacklinks(uiState.query);
        }
    }

    public focusSearch() {
        this.layout?.focusSearch?.();
    }

    async initialize() {
        Logger.debug(ENABLE_LOG_SORT, "[initialize] start");
        const ae0 = document.activeElement as HTMLElement | null;
        const editorHadFocus0 = !!ae0?.closest?.('.cm-editor');
        console.log('[HB] initialize(): start; activeElement =', ae0?.tagName, ae0?.className, '| editorHadFocus =', editorHadFocus0);
        const container = this.containerEl.children[1] as HTMLElement; // .view-content

        // Remember the editor leaf; we’ll restore it after remount if needed
        const editorView = this.app.workspace.getActiveViewOfType(MarkdownView) || null;
        const editorLeaf = editorView?.leaf || null;

        // Install debug listeners ONCE per view instance for focus/mouse diagnostics
        if (!this.debugHooksInstalled) {
            // Log focus transitions inside the HB view
            this.containerEl.addEventListener('focusin', (e) => {
                const t = e.target as HTMLElement | null;
                console.log('[HB] focusin in HB view — target =', t?.tagName, t?.className);
            });
            this.containerEl.addEventListener('focusout', (e) => {
                const t = e.target as HTMLElement | null;
                console.log('[HB] focusout in HB view — target =', t?.tagName, t?.className);
            });

            // Mouse path diagnostics (capture phase) to see what bubbles up
            this.containerEl.addEventListener('pointerdown', (e) => {
                const t = e.target as HTMLElement | null;
                console.log('[HB] pointerdown in HB view (capture) — target =', t?.tagName, t?.className);
            }, true);
            this.containerEl.addEventListener('mousedown', (e) => {
                const t = e.target as HTMLElement | null;
                console.log('[HB] mousedown in HB view (capture) — target =', t?.tagName, t?.className);
            }, true);
            this.containerEl.addEventListener('click', (e) => {
                const t = e.target as HTMLElement | null;
                console.log('[HB] click in HB view (capture) — target =', t?.tagName, t?.className);
            }, true);

            this.debugHooksInstalled = true;
        }

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;
        const noteId = activeFile.path;

        // Always set the current note id first
        this.currentNoteId = noteId;

        // Prefer a locked snapshot from main (snapshot presence = locked)
        const snap = this.plugin.locks.get(noteId);
        if (snap) {
            console.log('[HB] initialize(): using LOCKED snapshot (no globals applied)');
            this.viewState = snap.viewState;
            this.viewState.isLocked = true;
            this.originalHierarchy = snap.hierarchy;
        
            // Mount header once (or reuse) and render tree only
            if (!this.layout) {
                this.layout = new BacklinksLayout(this.app);
                this.layout.mountHeader(container as HTMLDivElement, {
                    createTreeNodeView: (containerEl, node) => {
                        const v = new TreeNodeView(this.app, containerEl, node, this.viewState!);
                        this.treeNodeViews.push(v);
                        return v;
                    },
                    onListToggle: (collapsed) => {
                        if (this.isNoteLocked()) return;
                        if (collapsed) this.treeNodeViews.forEach((n) => n.listToggleOn());
                        else this.treeNodeViews.forEach((n) => n.listToggleOff());
                        this.layout?.setListActive(collapsed);
                    },
                    onContentToggle: (collapsed) => {
                        if (this.isNoteLocked()) return;
                        if (collapsed) this.treeNodeViews.forEach((n) => n.contentHiddenToggleOn());
                        else this.treeNodeViews.forEach((n) => n.contentHiddenToggleOff());
                        this.layout?.setContentActive(collapsed);
                    },
                    onSearchChange: (q) => {
                        if (this.isNoteLocked()) return;
                        if ((uiState.query ?? "") === (q ?? "")) return;
                        this.filterBacklinks(q);
                    },
                    onSortToggle: (descending: boolean) => {
                        if (this.isNoteLocked()) return;
                        this.layout?.setSortActive(descending);
                        this.updateSortOrder(descending);
                        if ((uiState.query ?? "").length > 0) this.filterBacklinks(uiState.query);
                    },
                    onFlattenToggle: (flattened: boolean) => {
                        if (this.isNoteLocked()) return;
                        this.layout?.setFlattenActive(flattened);
                        this.toggleFlatten(flattened);
                        if ((uiState.query ?? "").length > 0) this.filterBacklinks(uiState.query);
                    },
                    onLockToggle: (locked: boolean) => {
                        if (!this.currentNoteId || !this.viewState) return;
                        if (locked) {
                            const s = this.captureSnapshot();
                            this.plugin.locks.set(this.currentNoteId, s);
                            this.layout?.setLockActive(true);
                        } else {
                            this.plugin.locks.delete(this.currentNoteId);
                            this.layout?.setLockActive(false);
                            this.applyListAndContentGlobalsInPlace();
                            const wantFlatten = !!uiState.flattenCollapsed;
                            if (wantFlatten !== this.isFlattened) {
                                this.layout?.setFlattenActive(wantFlatten);
                                this.toggleFlatten(wantFlatten);
                                if ((uiState.query ?? '').length > 0) this.filterBacklinks(uiState.query);
                            } else {
                                this.layout?.setSortActive(!!uiState.sortCollapsed);
                                this.updateSortOrder(!!uiState.sortCollapsed);
                                if ((uiState.query ?? '').length > 0) this.filterBacklinks(uiState.query);
                            }
                        }
                    },
                    initialLocked: true,
                    initialFlattened: this.isFlattened,
                }, /* initialLocked */ true);
            } else {
                // Reuse header; just ensure callbacks and visuals match locked state
                this.layout.setCallbacks({
                    createTreeNodeView: (containerEl, node) => {
                        const v = new TreeNodeView(this.app, containerEl, node, this.viewState!);
                        this.treeNodeViews.push(v);
                        return v;
                    },
                    onListToggle: (collapsed) => {
                        if (this.isNoteLocked()) return;
                        if (collapsed) this.treeNodeViews.forEach((n) => n.listToggleOn());
                        else this.treeNodeViews.forEach((n) => n.listToggleOff());
                        this.layout?.setListActive(collapsed);
                    },
                    onContentToggle: (collapsed) => {
                        if (this.isNoteLocked()) return;
                        if (collapsed) this.treeNodeViews.forEach((n) => n.contentHiddenToggleOn());
                        else this.treeNodeViews.forEach((n) => n.contentHiddenToggleOff());
                        this.layout?.setContentActive(collapsed);
                    },
                    onSearchChange: (q) => {
                        if (this.isNoteLocked()) return;
                        if ((uiState.query ?? "") === (q ?? "")) return;
                        this.filterBacklinks(q);
                    },
                    onSortToggle: (descending: boolean) => {
                        if (this.isNoteLocked()) return;
                        this.layout?.setSortActive(descending);
                        this.updateSortOrder(descending);
                        if ((uiState.query ?? "").length > 0) this.filterBacklinks(uiState.query);
                    },
                    onFlattenToggle: (flattened: boolean) => {
                        if (this.isNoteLocked()) return;
                        this.layout?.setFlattenActive(flattened);
                        this.toggleFlatten(flattened);
                        if ((uiState.query ?? "").length > 0) this.filterBacklinks(uiState.query);
                    },
                    onLockToggle: (locked: boolean) => {
                        if (!this.currentNoteId || !this.viewState) return;
                        if (locked) {
                            const s = this.captureSnapshot();
                            this.plugin.locks.set(this.currentNoteId, s);
                            this.layout?.setLockActive(true);
                        } else {
                            this.plugin.locks.delete(this.currentNoteId);
                            this.layout?.setLockActive(false);
                            this.applyListAndContentGlobalsInPlace();
                            const wantFlatten = !!uiState.flattenCollapsed;
                            if (wantFlatten !== this.isFlattened) {
                                this.layout?.setFlattenActive(wantFlatten);
                                this.toggleFlatten(wantFlatten);
                                if ((uiState.query ?? '').length > 0) this.filterBacklinks(uiState.query);
                            } else {
                                this.layout?.setSortActive(!!uiState.sortCollapsed);
                                this.updateSortOrder(!!uiState.sortCollapsed);
                                if ((uiState.query ?? '').length > 0) this.filterBacklinks(uiState.query);
                            }
                        }
                    },
                    initialLocked: true,
                    initialFlattened: this.isFlattened,
                });
                this.layout.setLockActive(true);
            }
            // Render the snapshot tree only; header stays
            this.treeNodeViews = [];
            this.treeNodeViews = this.layout.renderTree(this.originalHierarchy);
        
        } else {
            console.log('[HB] initialize(): UNLOCKED — globals => sortDescending =', this.sortDescending, ', isFlattened =', this.isFlattened);
        
            this.viewState = { nodeStates: new Map<string, NodeViewState>(), isLocked: false };
        
            const file = new File(this.app, activeFile);
            const hierarchy = await file.getBacklinksHierarchy();
            this.originalHierarchy = hierarchy;
        
            this.sortDescending = uiState.sortCollapsed ?? false;
            this.isFlattened = uiState.flattenCollapsed ?? false;
        
            // Ensure header exists
            if (!this.layout) {
                this.layout = new BacklinksLayout(this.app);
                this.layout.mountHeader(container as HTMLDivElement, {
                    createTreeNodeView: (containerEl, node) => {
                        const v = new TreeNodeView(this.app, containerEl, node, this.viewState!);
                        this.treeNodeViews.push(v);
                        return v;
                    },
                    onListToggle: (collapsed) => {
                        if (this.isNoteLocked()) return;
                        if (collapsed) this.treeNodeViews.forEach((n) => n.listToggleOn());
                        else this.treeNodeViews.forEach((n) => n.listToggleOff());
                        this.layout?.setListActive(collapsed);
                    },
                    onContentToggle: (collapsed) => {
                        if (this.isNoteLocked()) return;
                        if (collapsed) this.treeNodeViews.forEach((n) => n.contentHiddenToggleOn());
                        else this.treeNodeViews.forEach((n) => n.contentHiddenToggleOff());
                        this.layout?.setContentActive(collapsed);
                    },
                    onSearchChange: (q) => {
                        if (this.isNoteLocked()) return;
                        if ((uiState.query ?? "") === (q ?? "")) return;
                        this.filterBacklinks(q);
                    },
                    onSortToggle: (descending: boolean) => {
                        if (this.isNoteLocked()) return;
                        this.layout?.setSortActive(descending);
                        this.updateSortOrder(descending);
                        if ((uiState.query ?? "").length > 0) this.filterBacklinks(uiState.query);
                    },
                    onFlattenToggle: (flattened: boolean) => {
                        if (this.isNoteLocked()) return;
                        this.layout?.setFlattenActive(flattened);
                        this.toggleFlatten(flattened);
                        if ((uiState.query ?? "").length > 0) this.filterBacklinks(uiState.query);
                    },
                    onLockToggle: (locked: boolean) => {
                        if (!this.currentNoteId || !this.viewState) return;
                        if (locked) {
                            const s = this.captureSnapshot();
                            this.plugin.locks.set(this.currentNoteId, s);
                            this.layout?.setLockActive(true);
                        } else {
                            this.plugin.locks.delete(this.currentNoteId);
                            this.layout?.setLockActive(false);
                            this.applyListAndContentGlobalsInPlace();
                            const wantFlatten = !!uiState.flattenCollapsed;
                            if (wantFlatten !== this.isFlattened) {
                                this.layout?.setFlattenActive(wantFlatten);
                                this.toggleFlatten(wantFlatten);
                                if ((uiState.query ?? '').length > 0) this.filterBacklinks(uiState.query);
                            } else {
                                this.layout?.setSortActive(!!uiState.sortCollapsed);
                                this.updateSortOrder(!!uiState.sortCollapsed);
                                if ((uiState.query ?? '').length > 0) this.filterBacklinks(uiState.query);
                            }
                        }
                    },
                    initialLocked: false,
                    initialFlattened: this.isFlattened,
                }, /* initialLocked */ false);
            } else {
                this.layout.setCallbacks({
                    createTreeNodeView: (containerEl, node) => {
                        const v = new TreeNodeView(this.app, containerEl, node, this.viewState!);
                        this.treeNodeViews.push(v);
                        return v;
                    },
                    onListToggle: (collapsed) => {
                        if (this.isNoteLocked()) return;
                        if (collapsed) this.treeNodeViews.forEach((n) => n.listToggleOn());
                        else this.treeNodeViews.forEach((n) => n.listToggleOff());
                        this.layout?.setListActive(collapsed);
                    },
                    onContentToggle: (collapsed) => {
                        if (this.isNoteLocked()) return;
                        if (collapsed) this.treeNodeViews.forEach((n) => n.contentHiddenToggleOn());
                        else this.treeNodeViews.forEach((n) => n.contentHiddenToggleOff());
                        this.layout?.setContentActive(collapsed);
                    },
                    onSearchChange: (q) => {
                        if (this.isNoteLocked()) return;
                        if ((uiState.query ?? "") === (q ?? "")) return;
                        this.filterBacklinks(q);
                    },
                    onSortToggle: (descending: boolean) => {
                        if (this.isNoteLocked()) return;
                        this.layout?.setSortActive(descending);
                        this.updateSortOrder(descending);
                        if ((uiState.query ?? "").length > 0) this.filterBacklinks(uiState.query);
                    },
                    onFlattenToggle: (flattened: boolean) => {
                        if (this.isNoteLocked()) return;
                        this.layout?.setFlattenActive(flattened);
                        this.toggleFlatten(flattened);
                        if ((uiState.query ?? "").length > 0) this.filterBacklinks(uiState.query);
                    },
                    onLockToggle: (locked: boolean) => {
                        if (!this.currentNoteId || !this.viewState) return;
                        if (locked) {
                            const s = this.captureSnapshot();
                            this.plugin.locks.set(this.currentNoteId, s);
                            this.layout?.setLockActive(true);
                        } else {
                            this.plugin.locks.delete(this.currentNoteId);
                            this.layout?.setLockActive(false);
                            this.applyListAndContentGlobalsInPlace();
                            const wantFlatten = !!uiState.flattenCollapsed;
                            if (wantFlatten !== this.isFlattened) {
                                this.layout?.setFlattenActive(wantFlatten);
                                this.toggleFlatten(wantFlatten);
                                if ((uiState.query ?? '').length > 0) this.filterBacklinks(uiState.query);
                            } else {
                                this.layout?.setSortActive(!!uiState.sortCollapsed);
                                this.updateSortOrder(!!uiState.sortCollapsed);
                                if ((uiState.query ?? '').length > 0) this.filterBacklinks(uiState.query);
                            }
                        }
                    },
                    initialLocked: false,
                    initialFlattened: this.isFlattened,
                });
                this.layout.setLockActive(false);
            }
        
            // Render tree based on flatten state
            this.treeNodeViews = [];
            const toRender = this.isFlattened
                ? (this.flattenedHierarchy = this.buildFlattenedHierarchy(this.originalHierarchy))
                : this.originalHierarchy;
            this.treeNodeViews = this.layout.renderTree(toRender);
            this.updateSortOrder(this.sortDescending);
        }

        // ⌨️ After remount: if search is not open, ensure the editor leaf stays active & focused.
        // This keeps Cmd/Alt+←/→ working even after clicking navbar buttons.
        try {
            const ae = document.activeElement as HTMLElement | null;
            const searchOpen = this.layout?.isSearchVisible?.() ?? false;

            // If focus is on <body> or somewhere inside the HB pane (esp. header), hand it back to the editor
            const inHB = !!ae?.closest?.(".workspace-leaf-content[data-type='hierarchical-backlinks']");
            const lostFocus = !ae || ae.tagName === "BODY" || inHB;

            if (!searchOpen && editorLeaf && lostFocus) {
                // 1) Make sure the editor is the active leaf again (prevents workspace hotkeys from targeting HB)
                this.app.workspace.setActiveLeaf(editorLeaf, false, false);
                // 2) Ensure DOM focus is on CodeMirror
                const edView = this.app.workspace.getActiveViewOfType(MarkdownView);
                edView?.editor?.focus();
            }

            // Debug
            const editorHasFocus = !!(document.activeElement as HTMLElement | null)?.closest?.(".cm-editor");
            console.log(
                "[HB] initialize() done — activeElement =",
                (document.activeElement as HTMLElement | null)?.tagName,
                (document.activeElement as HTMLElement | null)?.className,
                "| editorHasFocus =",
                editorHasFocus
            );
        } catch (_) { }

        // view.ts — at the very end of initialize(), after createPane/updateSortOrder, etc.
        try {
            const ae = document.activeElement as HTMLElement | null;
            const editorHasFocus = !!ae?.closest?.('.cm-editor');
            console.log('[HB] initialize() done — activeElement =', ae?.tagName, ae?.className, '| editorHasFocus =', editorHasFocus);
        } catch (_) { }

        // Keep navbar in sync without remounting header
        this.syncNavbarFromGlobals();
    }

    register_events() {
        this.plugin.registerEvent(this.app.metadataCache.on("changed", () => {
            this.initialize();
        }));
/*
        this.plugin.registerEvent(this.app.workspace.on("layout-change", () => {
            this.initialize();
        }));
*/
        this.plugin.registerEvent(this.app.workspace.on("file-open", () => {
            this.initialize();
        }));

    }

    async onOpen() {
        this.register_events();
        return this.initialize();
    }

    createPane(container: Element, hierarchy: TreeNode[]) {
        // Use renderTree only; header is managed by initialize/mountHeader
        this.treeNodeViews = [];
        this.treeNodeViews = this.layout!.renderTree(hierarchy);
    
        // If we’re in the special sort-restore path
        if (this.isSortRestore && this.sortSnapshot) {
            this.restoreNodeStatesFrom(this.sortSnapshot);
            for (const v of this.treeNodeViews) v.applyNodeViewStateToUI();
            this.isSortRestore = false;
            this.sortSnapshot = undefined;
            return;
        }
    
        // Apply global list/content only when unlocked
        if (!this.isNoteLocked()) {
            if (uiState.listCollapsed) this.treeNodeViews.forEach(v => v.listToggleOn());
            else this.treeNodeViews.forEach(v => v.listToggleOff());
            if (uiState.contentCollapsed) this.treeNodeViews.forEach(v => v.contentHiddenToggleOn());
            else this.treeNodeViews.forEach(v => v.contentHiddenToggleOff());
        }
    
        for (const v of this.treeNodeViews) v.applyNodeViewStateToUI();
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

    private isNoteLocked(): boolean {
        return !!(this.currentNoteId && this.plugin.locks.get(this.currentNoteId));
    }

    /** Update the navbar buttons from current globals (and lock state) without remounting. */
    private syncNavbarFromGlobals() {
        if (!this.layout) return;
        const locked = this.isNoteLocked();
        this.layout.setLockActive(locked);
        // reflect global toggles only when unlocked (purely visual; the lock setter already handles badge/dimming)
        this.layout.setListActive(!!uiState.listCollapsed);
        this.layout.setContentActive(!!uiState.contentCollapsed);
        this.layout.setFlattenActive(!!uiState.flattenCollapsed);
        this.layout.setSortActive(!!uiState.sortCollapsed);
    }

    /** Apply current *global* list/content to the existing tree in-place (no header rebuild). 
     *  For flatten/sort we’ll call the dedicated methods (which rebuild the tree only). */
    private applyListAndContentGlobalsInPlace() {
        if (this.isNoteLocked()) return; // don't touch locked trees
        if (!this.treeNodeViews?.length) return;

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

        // Push states to DOM
        for (const v of this.treeNodeViews) v.applyNodeViewStateToUI();
    }

}