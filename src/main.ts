import { Plugin, WorkspaceLeaf, PluginSettingTab, Setting, App, Notice } from "obsidian";
import { HierarchicalBacklinksView, VIEW_TYPE } from "./view";
import { uiState } from "./ui/uiState";
import { HierarchicalBacklinksSettings, LockedTreeSnapshot } from "./types";
import LockService from "./lockService";

const DEFAULT_SETTINGS: HierarchicalBacklinksSettings = {
    toggleLeafNodes: false,
};

export default class HierarchicalBacklinksPlugin extends Plugin {
    settings: HierarchicalBacklinksSettings;
    public locks!: LockService;

    async onload() {
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
            name: "Hierarchical Backlinks: Clear all locks (snapshots)",
            callback: () => {
                const n = this.locks.clearAll();                              // ← delegate
                try { new Notice(`Released ${n} lock${n === 1 ? "" : "s"}.`); } catch (_) { }
            },
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "L" }],
        });
        // Toggle Flatten
        this.addCommand({
            id: "hb-toggle-flatten",
            name: "Hierarchical Backlinks: Toggle flatten",
            callback: () => {
                uiState.flattenCollapsed = !uiState.flattenCollapsed;
                this.refreshActiveView();
            },
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "F" }], // example: Cmd/Ctrl+Shift+F
        });

        // Toggle Sort Order
        this.addCommand({
            id: "hb-toggle-sort",
            name: "Hierarchical Backlinks: Toggle sort order",
            callback: () => {
                uiState.sortCollapsed = !uiState.sortCollapsed;
                this.refreshActiveView();
            },
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "O" }],
        });

        // Toggle Hide Content
        this.addCommand({
            id: "hb-toggle-content",
            name: "Hierarchical Backlinks: Toggle hide content",
            callback: () => {
                uiState.contentCollapsed = !uiState.contentCollapsed;
                this.refreshActiveView();
            },
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "C" }],
        });

        // Toggle Collapse List
        this.addCommand({
            id: "hb-toggle-list",
            name: "Hierarchical Backlinks: Toggle collapse list",
            callback: () => {
                uiState.listCollapsed = !uiState.listCollapsed;
                this.refreshActiveView();
            },
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "K" }],
        });

        // Toggle Lock (works even when currently locked)
        this.addCommand({
            id: "hb-toggle-lock",
            name: "Hierarchical Backlinks: Toggle lock",
            callback: () => {
                this.withActiveView((v) => v.toggleLock?.(), { respectLock: false });
                this.refreshActiveView();
            },
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "." }], // change in Settings → Hotkeys if you like
        });

        // Focus Search (optional, just focus the search input if available)
        this.addCommand({
            id: "hb-focus-search",
            name: "Hierarchical Backlinks: Focus search",
            callback: () => {
                this.withActiveView((view) => view.focusSearch?.(), { respectLock: false });
            },
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "S" }],
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
        this.withActiveView((v) => v.initialize?.(), { respectLock: false });
    }
}

export class HierarchicalBacklinksSettingTab extends PluginSettingTab {
    plugin: HierarchicalBacklinksPlugin;

    constructor(plugin: HierarchicalBacklinksPlugin) {
        super(plugin.app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Hierarchical Backlinks Settings" });

        new Setting(containerEl)
            .setName("Hide Content by Default")
            .setDesc("Next time the plugin is loaded, content will be hidden by default.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.toggleLeafNodes)
                    .onChange(async (value) => {
                        this.plugin.settings.toggleLeafNodes = value;
                        await this.plugin.saveSettings();
                    })
            );
    }

    get toggleLeafNodes(): boolean {
        return this.plugin.settings.toggleLeafNodes;
    }
}