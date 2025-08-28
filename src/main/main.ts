import { dbgMain } from "../utils/debug";
import { Plugin, WorkspaceLeaf, Notice } from "obsidian";
import { HierarchicalBacklinksSettingTab, DEFAULT_SETTINGS } from "./settings"; // Ensure this path is correct
import { HierarchicalBacklinksView, VIEW_TYPE } from "../view/view";
import { uiState } from "../ui/uiState";
import { HierarchicalBacklinksSettings } from "../types";
import LockService from "./lockService";

export default class HierarchicalBacklinksPlugin extends Plugin {
    settings: HierarchicalBacklinksSettings;
    public locks!: LockService;

    async onload() {

        document.addEventListener("focusin", () => {
            const ae = document.activeElement as HTMLElement | null;
            dbgMain("focusin: activeElement =", ae?.tagName, ae?.className);
        });

        const data = (await this.loadData()) ?? {};

        this.locks = new LockService(this.app);

        // Load settings (back-compat: old versions stored the settings at root)
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings ?? data);

        // Load global UI runtime state (if present)
        uiState.load(data.ui);

        // First-run fallback: if there is no persisted UI yet,
        // honor the "Hide Content by Default" setting for contentCollapsed.
        if (!data.ui) {
            uiState.contentCollapsed = this.settings.toggleLeafNodes;
        }

        this.addSettingTab(new HierarchicalBacklinksSettingTab(this));

        this.registerView(
            VIEW_TYPE,
            (leaf) => new HierarchicalBacklinksView(leaf, this)
        );

        this.addCommand({
            id: "show-hierarchical-backlinks",
            name: "Show hierarchical backlinks",
            callback: () => {
                this.activateView();
            },
        });
        this.addCommand({
            id: "clear-all-hb-locks",
            name: "Clear all locks",
            callback: () => {
                const n = this.locks.clearAll();
                try { new Notice(`Released ${n} lock${n === 1 ? "" : "s"}.`); } catch (_) { }
            },
        });
        // Toggle Flatten
        this.addCommand({
            id: "hb-toggle-flatten",
            name: "Toggle flatten",
            callback: () => {
                const next = !uiState.flattenCollapsed;
                this.withActiveView((v) => v.actionFlatten?.(next), { respectLock: false });
            },
        });

        // Toggle Sort Order
        this.addCommand({
            id: "hb-toggle-sort",
            name: "Toggle sort order",
            callback: () => {
                const next = !uiState.sortCollapsed;
                this.withActiveView((v) => v.actionSort?.(next), { respectLock: false });
            },
        });

        // Toggle Hide Content
        this.addCommand({
            id: "hb-toggle-content",
            name: "Toggle hide content",
            callback: () => {
                const next = !uiState.contentCollapsed;
                this.withActiveView((v) => v.actionContent?.(next), { respectLock: false });
            },
        });

        // Toggle Collapse List
        this.addCommand({
            id: "hb-toggle-list",
            name: "Toggle collapse list",
            callback: () => {
                const next = !uiState.listCollapsed;
                this.withActiveView((v) => v.actionList?.(next), { respectLock: false });
            },
        });

        // Toggle Lock (works even when currently locked)
        this.addCommand({
            id: "hb-toggle-lock",
            name: "Toggle lock",
            callback: () => {
                this.withActiveView((v) => {
                    const noteId: string | null = v?.currentNoteId ?? null;
                    const isLocked = noteId ? this.locks.has(noteId) : false;
                    v.actionLock?.(!isLocked);
                }, { respectLock: false });
            },
        });

        // Focus Search (optional, just focus the search input if available)
        this.addCommand({
            id: "hb-focus-search",
            name: "Focus search",
            callback: () => {
                this.withActiveView((view) => view.focusSearch?.(), { respectLock: false });
            },
        });
    }

    async onUserEnable() {
        this.activateView();
    }

    onunload() {
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            await leaf?.setViewState({ type: VIEW_TYPE, active: true });
        }

        workspace.revealLeaf(leaf!);
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private withActiveView(apply: (view: any) => void, opts: { respectLock?: boolean } = {}) {
        const { respectLock = true } = opts;
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
        if (!leaves.length) return;
        const v = leaves[0].view as any;
        if (respectLock && v?.viewState?.isLocked) return; // respect lock by default
        try { apply(v); } catch (_) { }
    }

    private refreshActiveView() {
        this.withActiveView((v) => v.applyGlobalsFromUiState?.(), { respectLock: false });
      }
}