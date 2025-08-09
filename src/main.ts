import { Plugin, WorkspaceLeaf, PluginSettingTab, Setting, App } from "obsidian";
import {HierarchicalBacklinksView, VIEW_TYPE} from "./view";
import { uiState } from "./ui/uiState";

interface HierarchicalBacklinksSettings {
    toggleLeafNodes: boolean;
    preserveCollapseState: boolean;
}

const DEFAULT_SETTINGS: HierarchicalBacklinksSettings = {
    toggleLeafNodes: false,
    preserveCollapseState: true,
};

export default class HierarchicalBacklinksPlugin extends Plugin {
    settings: HierarchicalBacklinksSettings;
  
    async onload() {
        const data = (await this.loadData()) ?? {};
      
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
}

export class HierarchicalBacklinksSettingTab extends PluginSettingTab {
    plugin: HierarchicalBacklinksPlugin;

    constructor(plugin: HierarchicalBacklinksPlugin) {
        super(plugin.app,plugin);
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

        new Setting(containerEl)
            .setName("Preserve Collapse State Between Searches")
            .setDesc("If enabled, collapsed/expanded state of nodes will be preserved when searching within the same note.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.preserveCollapseState)
                    .onChange(async (value) => {
                        this.plugin.settings.preserveCollapseState = value;
                        await this.plugin.saveSettings();
                    })
            );
    }

    get toggleLeafNodes(): boolean {
        return this.plugin.settings.toggleLeafNodes;
    }
}