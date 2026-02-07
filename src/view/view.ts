import { dbgHB, dbgHBTrace, dbgFilter, dbgSort } from "../utils/debugger";
import { ItemView, WorkspaceLeaf, MarkdownView } from "obsidian";
import { File } from "../data/file";
import HierarchicalBacklinksPlugin from "../main/main";
import { TreeNode } from "../tree/treeNode";
import { TreeNodeView } from "../tree/treeNodeView";
import { ViewState, NodeViewState, LockedTreeSnapshot } from "../types";
import { uiState } from "../ui/uiState";
import { BacklinksLayout } from "../ui/layout";
import { cloneHierarchy, deepSortHierarchy, buildFlattenedHierarchy } from "./treeUtils";
import { applyFilter } from "./filter";
import { installDebugHooks, activeSummary } from "../utils/diagnostics";
import {
    ensureViewState,
    getOrCreateNodeViewState as getNodeState,
    snapshotNodeStates,
    restoreNodeStatesFrom,
    captureSnapshotFrom,
} from "./state";
import { registerViewEvents } from "./events";
import { installHistoryHotkeys } from "./focusSupport";

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
    private refocusEditorIfNoSearch(force = false) {
        // Guard: if focus is inside HB view (e.g., search input), only proceed when forced
        const ae = document.activeElement as HTMLElement | null;
        if (!force && ae && this.containerEl.contains(ae)) {
            dbgHB('refocusEditorIfNoSearch: skipped (focus inside HB)');
            return;
        }
        const searchOpen = this.layout?.isSearchVisible?.() ?? false;
        if (searchOpen && !force) return;

        // Prefer the last known Markdown editor leaf; fall back to current if available
        let leaf: WorkspaceLeaf | null = this.lastEditorLeaf
            ?? this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf
            ?? null;
        if (!leaf) {
            dbgHB('refocusEditorIfNoSearch: no editor leaf to focus');
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
                const v = new TreeNodeView(self.app, containerEl as HTMLDivElement, node, self.viewState!, self.plugin.settings);
                self.treeNodeViews.push(v);
                return v;
            },
            onListToggle: (collapsed: boolean) => {
                setTimeout(() => self.refocusEditorIfNoSearch(), 0);
                dbgHB('cb:list', { collapsed, locked: self.isNoteLocked(), nodes: self.treeNodeViews.length });
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
                dbgHB('cb:content', { collapsed, locked: self.isNoteLocked(), nodes: self.treeNodeViews.length });
                if (self.isNoteLocked()) {
                    self.layout?.setContentActive(!!uiState.contentCollapsed);
                    return;
                }
                if (collapsed) self.treeNodeViews.forEach((n) => n.contentHiddenToggleOn());
                else self.treeNodeViews.forEach((n) => n.contentHiddenToggleOff());
                self.layout?.setContentActive(collapsed);
            },
            onSearchToggle: (isOn: boolean) => {
                uiState.searchCollapsed = isOn;
                this.layout?.setSearchActive?.(!!isOn);
            },
            onSearchChange: (q: string) => {
                // setTimeout(() => self.refocusEditorIfNoSearch(), 0);
                dbgHB('cb:filter', { q, locked: self.isNoteLocked(), nodes: self.treeNodeViews.length });
                if (self.isNoteLocked()) return;
                // Do NOT short-circuit on equality with uiState.query; layout updates it before calling us.
                self.filterBacklinks(q ?? '');
            },
            onSortToggle: (descending: boolean) => {
                setTimeout(() => self.refocusEditorIfNoSearch(), 0);
                dbgHB('cb:sort', { descending, locked: self.isNoteLocked(), nodes: self.treeNodeViews.length });
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
                dbgHB('cb:flatten', { flattened, locked: self.isNoteLocked(), nodes: self.treeNodeViews.length });
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
                dbgHB('cb:lock', { locked, hasNote: !!self.currentNoteId, nodes: self.treeNodeViews.length });
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
                        dbgHB('cb:unlock release', noteId, 'had=', had, 'nowHas=', self.plugin.locks.has(noteId));
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
        //uiState.searchCollapsed = !!show;
        const h = this.buildNavCallbacks(this.isNoteLocked());
        h.onSearchToggle(!!show);
    }

    async initialize() {
        dbgHBTrace('initialize(): TRACE');

        dbgHB('initialize(): start');

        const ae0 = document.activeElement as HTMLElement | null;
        const editorHadFocus0 = !!ae0?.closest?.('.cm-editor');
        dbgHB('initialize(): start; activeElement =', ae0?.tagName, ae0?.className, '| editorHadFocus =', editorHadFocus0);

        const container = this.containerEl.children[1] as HTMLElement; // .view-content

        // Apply bold file names setting
        this.containerEl.toggleClass("hbl-no-bold", !this.plugin.settings.boldFileNames);

        // Remember the editor leaf; we'll restore it after remount if needed
        const editorView = this.app.workspace.getActiveViewOfType(MarkdownView) || null;
        this.lastEditorLeaf = editorView?.leaf || this.lastEditorLeaf;

        // Install debug listeners ONCE per view instance for focus/mouse diagnostics
        if (!this.debugHooksInstalled) {
            installDebugHooks(this.containerEl as HTMLElement, () => this.suppressInit(250));
            this.debugHooksInstalled = true;
        }

        // Keep forward/back hotkeys working even when HB has focus
        installHistoryHotkeys({
            containerEl: this.containerEl as HTMLElement,
            refocus: this.refocusEditorIfNoSearch.bind(this),
            register: this.registerDomEvent.bind(this),
            // @ts-ignore - commands exists at runtime but not in type definitions
            exec: (id: string) => this.app.commands.executeCommandById(id),
        });

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;
        const noteId = activeFile.path;

        // Always set the current note id first
        this.currentNoteId = noteId;

        const ensureHeader = (locked: boolean): BacklinksLayout => {
            if (!this.layout) {
                this.layout = new BacklinksLayout(this.app);
                this.layout.mountHeader(
                    container as HTMLDivElement,
                    this.buildNavCallbacks(locked),
                    locked
                );
            } else {
                this.layout.setCallbacks(this.buildNavCallbacks(locked));
                this.layout.setLockActive(locked);
            }
            return this.layout as BacklinksLayout;
        };

        // Prefer a locked snapshot from main (snapshot presence = locked)
        const snap = this.plugin.locks.get(noteId);
        if (snap) {
            dbgHB('initialize(): using LOCKED snapshot (no globals applied)');
            this.viewState = snap.viewState;
            this.viewState.isLocked = true;
            this.originalHierarchy = snap.hierarchy;

            const layoutLocked = ensureHeader(true);
            // Render the snapshot tree only; header stays
            this.treeNodeViews = [];
            this.treeNodeViews = layoutLocked.renderTree(this.originalHierarchy);
        } else {
            dbgHB('initialize(): UNLOCKED — globals => sortDescending =', this.sortDescending, ', isFlattened =', this.isFlattened); this.viewState = { nodeStates: new Map<string, NodeViewState>(), isLocked: false };

            const file = new File(this.app, activeFile);
            this.originalHierarchy = await file.getBacklinksHierarchy();

            this.sortDescending = uiState.sortCollapsed ?? false;
            this.isFlattened = uiState.flattenCollapsed ?? false;

            const layoutUnlocked = ensureHeader(false);
            // Render tree based on flatten state
            this.treeNodeViews = [];
            const toRender = this.isFlattened
                ? (this.flattenedHierarchy = buildFlattenedHierarchy(this.originalHierarchy))
                : this.originalHierarchy;
            this.treeNodeViews = layoutUnlocked.renderTree(toRender);

            this.updateSortOrder(this.sortDescending);
            // Reapply global UI state (list/content/flatten/sort/search) to the freshly-rendered tree
            this.applyGlobalsFromUiState();
        }

        // Keep navbar in sync without remounting header
        this.syncNavbarFromGlobals();
    }

    async onOpen() {
        registerViewEvents(this);
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
        dbgSort('updateSortOrder: Current=', this.sortDescending, ' New=', descending);
        this.sortDescending = descending;
        dbgSort('updateSortOrder: BEFORE remount; collected views:', this.treeNodeViews.length, 'flattened=', this.isFlattened);
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
            dbgSort('updateSortOrder: AFTER remount; collected views:', this.treeNodeViews.length);
        } else {
            // Take snapshot for sort restore
            this.sortSnapshot = snapshotNodeStates(this.viewState!);
            this.isSortRestore = true;

            // Deep sort a cloned hierarchy so we don't mutate the original
            const cloned = cloneHierarchy(this.originalHierarchy);
            deepSortHierarchy(cloned, descending);
            this.createPane(container, cloned);
            dbgSort('updateSortOrder: AFTER remount; collected views:', this.treeNodeViews.length);
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

        dbgFilter('BEGIN q=', trimmed, ' active=', activeSummary());

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

        dbgFilter('END   q=', trimmed, ' active=', activeSummary());
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
        const views = this.treeNodeViews;
        if (!views?.length) return;

        const listCollapsed = !!uiState.listCollapsed;
        const contentCollapsed = !!uiState.contentCollapsed;

        for (const v of views) {
            listCollapsed ? v.listToggleOn() : v.listToggleOff();
            contentCollapsed ? v.contentHiddenToggleOn() : v.contentHiddenToggleOff();
            v.applyNodeViewStateToUI();
        }
    }

    private applyGlobalsFromUiState() {
        // keep navbar in sync
        this.syncNavbarFromGlobals();

        if (this.isNoteLocked()) return; // frozen tree: UI only

        // 1) list/content in place
        this.applyListAndContentGlobalsInPlace();

        // 2) flatten (rebuild tree) if needed
        const wantFlatten = !!uiState.flattenCollapsed;
        if (wantFlatten !== this.isFlattened) {
            this.layout?.setFlattenActive(wantFlatten);
            this.toggleFlatten(wantFlatten);
        }

        // 3) sort on current tree
        const wantSort = !!uiState.sortCollapsed;
        this.layout?.setSortActive(wantSort);
        this.updateSortOrder(wantSort);

        // 4) reapply search if active
        const q = uiState.query ?? "";
        if (q.length > 0) this.filterBacklinks(q);
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

    public refresh(): void {
        try {
            this.applyGlobalsFromUiState();
        } catch (e) { dbgHB('refresh(): error', e); }
    }

    // in src/view/view.ts inside HierarchicalBacklinksView
    public getCurrentNoteId(): string | null {
        return this.currentNoteId ?? null;
    }

    public isLocked(): boolean {
        return !!this.viewState?.isLocked;
    }
}