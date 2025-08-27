import { ItemView, WorkspaceLeaf, MarkdownView } from "obsidian";
import { File } from "../data/file";
import HierarchicalBacklinksPlugin from "../main/main";
import { TreeNode } from "../tree/treeNode";
import { TreeNodeView } from "../tree/treeNodeView";
import { ViewState, NodeViewState, LockedTreeSnapshot } from "../types";
import { Logger } from "../utils/logger";
import { uiState } from "../ui/uiState";
import { BacklinksLayout } from "../ui/layout";
import { getOrCreateNodeViewState } from "./viewState";
import { cloneHierarchy, deepSortHierarchy, buildFlattenedHierarchy } from "./treeUtils";
import { applyFilter } from "./filter";
import { installDebugHooks } from "../utils/diagnostics";
import {
    ensureViewState,
    getOrCreateNodeViewState as getNodeState,
    snapshotNodeStates,
    restoreNodeStatesFrom,
    captureSnapshotFrom,
} from "./state";
import { registerViewEvents } from "./events";

const ENABLE_LOG_FILTER = true; // enable logging in filter-related methods
const ENABLE_LOG_FILTER_VERBOSE = false; // Ultra-verbose per-node logging.
const ENABLE_LOG_SORT = false; // Set to false to disable logging in sort-related methods
const ENABLE_LOG_HB = false; // General logging for HB view methods

export const VIEW_TYPE = "hierarchical-backlinks";


export class HierarchicalBacklinksView extends ItemView {
    // ---- diagnostics: suppress bursty initialize() calls tied to header clicks ----
    private suppressInitUntil = 0;
    private suppressInit(ms = 200) { this.suppressInitUntil = Date.now() + ms; }
    private shouldSuppressInit() { return Date.now() < this.suppressInitUntil; }

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
    private lastEditorLeaf: WorkspaceLeaf | null = null;
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

    /** After a navbar action, keep editor history hotkeys working.
     *  If the search bar is visible, we leave focus there. */
    private refocusEditorIfNoSearch() {
        const searchOpen = this.layout?.isSearchVisible?.() ?? false;
        if (searchOpen) return;

        // Prefer the last known Markdown editor leaf; fall back to current if available
        let leaf: WorkspaceLeaf | null = this.lastEditorLeaf
            ?? this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf
            ?? null;
        if (!leaf) {
            Logger.debug(ENABLE_LOG_HB, '[HB] refocusEditorIfNoSearch: no editor leaf to focus');
            return;
        }
        this.app.workspace.setActiveLeaf(leaf, false, false);
        const mv = leaf.view as MarkdownView | null;
        try {
            mv?.editor?.focus();
            // Logger.debug(ENABLE_LOG_HB,'[HB] refocusEditorIfNoSearch: focused editor');
        } catch (_) { }
    }

    /** Build the header/navbar callbacks so mountHeader() and setCallbacks() share identical behavior. */
    private buildNavCallbacks(initialLocked: boolean) {
        const self = this;
        return {
            createTreeNodeView: (containerEl: HTMLElement, node: TreeNode) => {
                const v = new TreeNodeView(self.app, containerEl as HTMLDivElement, node, self.viewState!);
                self.treeNodeViews.push(v);
                return v;
            },
            onListToggle: (collapsed: boolean) => {
                setTimeout(() => self.refocusEditorIfNoSearch(), 0);
                Logger.debug(ENABLE_LOG_HB, '[HB][view] cb:list', { collapsed, locked: self.isNoteLocked(), nodes: self.treeNodeViews.length });
                if (self.isNoteLocked()) {
                    // revert UI to global state when locked
                    self.layout?.setListActive(!!uiState.listCollapsed);
                    return;
                }
                if (collapsed) self.treeNodeViews.forEach((n) => n.listToggleOn());
                else self.treeNodeViews.forEach((n) => n.listToggleOff());
                self.layout?.setListActive(collapsed);
            },
            onContentToggle: (collapsed: boolean) => {
                setTimeout(() => self.refocusEditorIfNoSearch(), 0);
                Logger.debug(ENABLE_LOG_HB, '[HB][view] cb:content', { collapsed, locked: self.isNoteLocked(), nodes: self.treeNodeViews.length });
                if (self.isNoteLocked()) {
                    self.layout?.setContentActive(!!uiState.contentCollapsed);
                    return;
                }
                if (collapsed) self.treeNodeViews.forEach((n) => n.contentHiddenToggleOn());
                else self.treeNodeViews.forEach((n) => n.contentHiddenToggleOff());
                self.layout?.setContentActive(collapsed);
            },
            onSearchChange: (q: string) => {
                setTimeout(() => self.refocusEditorIfNoSearch(), 0);
                Logger.debug(ENABLE_LOG_HB, '[HB][view] cb:search', { q, locked: self.isNoteLocked(), nodes: self.treeNodeViews.length });
                if (self.isNoteLocked()) return;
                // Do NOT short-circuit on equality with uiState.query; layout updates it before calling us.
                self.filterBacklinks(q ?? '');
            },
            onSortToggle: (descending: boolean) => {
                setTimeout(() => self.refocusEditorIfNoSearch(), 0);
                Logger.debug(ENABLE_LOG_HB, '[HB][view] cb:sort', { descending, locked: self.isNoteLocked(), nodes: self.treeNodeViews.length });
                if (self.isNoteLocked()) {
                    self.layout?.setSortActive(!!uiState.sortCollapsed);
                    return;
                }
                self.layout?.setSortActive(descending);
                self.updateSortOrder(descending);
                if ((uiState.query ?? "").length > 0) self.filterBacklinks(uiState.query);
            },
            onFlattenToggle: (flattened: boolean) => {
                setTimeout(() => self.refocusEditorIfNoSearch(), 0);
                Logger.debug(ENABLE_LOG_HB, '[HB][view] cb:flatten', { flattened, locked: self.isNoteLocked(), nodes: self.treeNodeViews.length });
                if (self.isNoteLocked()) {
                    self.layout?.setFlattenActive(!!uiState.flattenCollapsed);
                    return;
                }
                self.layout?.setFlattenActive(flattened);
                self.toggleFlatten(flattened);
                if ((uiState.query ?? "").length > 0) self.filterBacklinks(uiState.query);
            },
            onLockToggle: (locked: boolean) => {
                setTimeout(() => self.refocusEditorIfNoSearch(), 0);
                Logger.debug(ENABLE_LOG_HB, '[HB][view] cb:lock', { locked, hasNote: !!self.currentNoteId, nodes: self.treeNodeViews.length });
                if (!self.currentNoteId || !self.viewState) return;
                if (locked) {
                    // Build snapshot from the currently rendered data source
                    self.captureLockSnapshot();
                    self.layout?.setLockActive(true);
                } else {
                    // Fully release the snapshot and rebuild from globals
                    const noteId = self.currentNoteId;
                    if (noteId) {
                        const had = self.plugin.locks.has(noteId);
                        self.plugin.locks.delete(noteId);
                        Logger.debug(ENABLE_LOG_HB, '[HB][lock] unlock: release', noteId, 'had=', had, 'nowHas=', self.plugin.locks.has(noteId));
                    }
                    if (self.viewState) self.viewState.isLocked = false;
                    // Drop any cached flattened variant derived from the snapshot
                    self.flattenedHierarchy = [];
                    // Re-init will fetch fresh hierarchy and apply global toggles/search
                    self.layout?.setLockActive(false);
                    self.initialize?.();
                    return; // do not fall through into any stale-path logic
                }
            },
            // Some layouts read these on first mount; harmless if ignored by setCallbacks
            initialLocked,
            initialFlattened: this.isFlattened,
        } as any;
    }

    // --- Public actions for commands/hotkeys: unify with navbar behavior ---
    public actionList(collapsed: boolean) {
        uiState.listCollapsed = !!collapsed; // keep globals consistent
        const h = this.buildNavCallbacks(this.isNoteLocked());
        h.onListToggle(collapsed);
    }

    public actionContent(collapsed: boolean) {
        uiState.contentCollapsed = !!collapsed;
        const h = this.buildNavCallbacks(this.isNoteLocked());
        h.onContentToggle(collapsed);
    }

    public actionSort(descending: boolean) {
        uiState.sortCollapsed = !!descending;
        const h = this.buildNavCallbacks(this.isNoteLocked());
        h.onSortToggle(descending);
    }

    public actionFlatten(flattened: boolean) {
        uiState.flattenCollapsed = !!flattened;
        const h = this.buildNavCallbacks(this.isNoteLocked());
        h.onFlattenToggle(flattened);
    }

    public actionLock(locked: boolean) {
        const h = this.buildNavCallbacks(this.isNoteLocked());
        h.onLockToggle(locked);
    }

    public actionSearchToggle(show: boolean) {
        // Keep the original semantics you implemented for the search bar command
        if (show) {
            this.layout?.setSearchActive?.(true);
            this.layout?.focusSearch?.();
        } else {
            this.layout?.clearSearch?.(); // clears UI + uiState.query if your layout implements it
            this.layout?.setSearchActive?.(false);
            // Do not refocus here; refocus is handled in navbar callbacks and helper
            this.refocusEditorIfNoSearch();
        }
    }

    async initialize() {

        if (ENABLE_LOG_HB) {
            console.group("[HB] initialize(): TRACE");
            console.trace();
            console.groupEnd();
        }

        Logger.debug(ENABLE_LOG_SORT, "[initialize] start");
        const ae0 = document.activeElement as HTMLElement | null;
        const editorHadFocus0 = !!ae0?.closest?.('.cm-editor');
        Logger.debug(ENABLE_LOG_HB, '[HB] initialize(): start; activeElement =', ae0?.tagName, ae0?.className, '| editorHadFocus =', editorHadFocus0);
        const container = this.containerEl.children[1] as HTMLElement; // .view-content

        // Remember the editor leaf; we’ll restore it after remount if needed
        const editorView = this.app.workspace.getActiveViewOfType(MarkdownView) || null;
        const editorLeaf = editorView?.leaf || null;

        // Install debug listeners ONCE per view instance for focus/mouse diagnostics
        if (!this.debugHooksInstalled) {
            installDebugHooks(this.containerEl as HTMLElement, () => this.suppressInit(250), ENABLE_LOG_HB);
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
            Logger.debug(ENABLE_LOG_HB, '[HB] initialize(): using LOCKED snapshot (no globals applied)');
            this.viewState = snap.viewState;
            this.viewState.isLocked = true;
            this.originalHierarchy = snap.hierarchy;

            // Mount header once (or reuse) and render tree only
            if (!this.layout) {
                this.layout = new BacklinksLayout(this.app);
                this.layout.mountHeader(
                    container as HTMLDivElement,
                    this.buildNavCallbacks(true),
                    /* initialLocked */ true
                );
            } else {
                // Reuse header; just ensure callbacks and visuals match locked state
                this.layout.setCallbacks(this.buildNavCallbacks(true));
                this.layout.setLockActive(true);
            }
            // Render the snapshot tree only; header stays
            this.treeNodeViews = [];
            this.treeNodeViews = this.layout.renderTree(this.originalHierarchy);
        } else {
            Logger.debug(ENABLE_LOG_HB, '[HB] initialize(): UNLOCKED — globals => sortDescending =', this.sortDescending, ', isFlattened =', this.isFlattened);
            this.viewState = { nodeStates: new Map<string, NodeViewState>(), isLocked: false };

            const file = new File(this.app, activeFile);
            const hierarchy = await file.getBacklinksHierarchy();
            this.originalHierarchy = hierarchy;

            this.sortDescending = uiState.sortCollapsed ?? false;
            this.isFlattened = uiState.flattenCollapsed ?? false;

            // Ensure header exists
            if (!this.layout) {
                this.layout = new BacklinksLayout(this.app);
                this.layout.mountHeader(
                    container as HTMLDivElement,
                    this.buildNavCallbacks(false),
                    /* initialLocked */ false
                );
            } else {
                this.layout.setCallbacks(this.buildNavCallbacks(false));
                this.layout.setLockActive(false);
            }

            // Render tree based on flatten state
            this.treeNodeViews = [];
            const toRender = this.isFlattened
                ? (this.flattenedHierarchy = buildFlattenedHierarchy(this.originalHierarchy))
                : this.originalHierarchy;
            this.treeNodeViews = this.layout.renderTree(toRender);
            this.updateSortOrder(this.sortDescending);
            // Reapply global UI state (list/content/flatten/sort/search) to the freshly-rendered tree
            this.applyGlobalsFromUiState();
        }

        // Keep navbar in sync without remounting header
        this.syncNavbarFromGlobals();
    }

    async onOpen() {
        registerViewEvents(this, { enableLogHB: ENABLE_LOG_HB });
        return this.initialize();
    }

    createPane(container: Element, hierarchy: TreeNode[]) {
        // Use renderTree only; header is managed by initialize/mountHeader
        this.treeNodeViews = [];
        this.treeNodeViews = this.layout!.renderTree(hierarchy);

        // If we’re in the special sort-restore path
        if (this.isSortRestore && this.sortSnapshot) {
            restoreNodeStatesFrom(this.viewState!, this.sortSnapshot);
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
            const leaves = buildFlattenedHierarchy(this.originalHierarchy);
            const nameOf = (n: TreeNode) => (n.path?.split("/").pop() ?? "").toLowerCase();
            leaves.sort((a, b) =>
                descending ? nameOf(b).localeCompare(nameOf(a)) : nameOf(a).localeCompare(nameOf(b))
            );
            this.createPane(container, leaves);
            Logger.debug(ENABLE_LOG_SORT, "[updateSortOrder] AFTER remount; collected views:", this.treeNodeViews.length);
        } else {
            // Take snapshot for sort restore
            this.sortSnapshot = snapshotNodeStates(this.viewState!);
            this.isSortRestore = true;

            // Deep sort a cloned hierarchy so we don't mutate the original
            const cloned = cloneHierarchy(this.originalHierarchy);
            deepSortHierarchy(cloned, descending);
            this.createPane(container, cloned);
            Logger.debug(ENABLE_LOG_SORT, "[updateSortOrder] AFTER remount; collected views:", this.treeNodeViews.length);
        }
    }

    // If you keep this helper, route it to the shared impl:
    private getOrCreateNodeViewState(nodeId: string): NodeViewState {
        this.viewState = ensureViewState(this.viewState);
        return getNodeState(this.viewState, nodeId);
    }

    private filterBacklinks(query: string) {
        const trimmed = (query ?? "").trim().toLowerCase();
        uiState.query = trimmed;
        const sid = ++this.searchSeq;

        applyFilter(
            {
                roots: this.originalHierarchy,
                treeNodeViews: this.treeNodeViews,
                getOrCreateNodeViewState: (id: string) => this.getOrCreateNodeViewState(id),
            },
            trimmed,
            sid,
            {
                enableLog: true,       // was ENABLE_LOG_FILTER
                enableVerbose: false,  // was ENABLE_LOG_FILTER_VERBOSE
            }
        );
    }

    private toggleFlatten(flattened: boolean) {
        this.isFlattened = flattened;
        const container = this.containerEl.children[1] as HTMLElement; // .view-content

        if (this.isFlattened) {
            this.flattenedHierarchy = buildFlattenedHierarchy(this.originalHierarchy);
            this.createPane(container, this.flattenedHierarchy);
        } else {
            this.createPane(container, this.originalHierarchy);
        }

        // After remount, re-apply collapsed/visibility states (handled by createPane)
        // Ensure current sort order is respected without remounting again
        this.updateSortOrder(this.sortDescending);
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

    private applyGlobalsFromUiState() {
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

    /** Create a lock snapshot from the current render source and store it for the current note. */
    private captureLockSnapshot(): LockedTreeSnapshot | null {
        if (!this.currentNoteId) return null;

        const source = this.isFlattened ? this.flattenedHierarchy : this.originalHierarchy;
        // Ensure we have a viewState to capture from
        this.viewState = ensureViewState(this.viewState);

        const snap = captureSnapshotFrom(source, this.viewState!);
        this.plugin.locks.set(this.currentNoteId, snap);
        // mark logically locked
        if (this.viewState) this.viewState.isLocked = true;

        return snap;
    }

}