import { PluginSettingTab, Setting } from "obsidian";
import type HierarchicalBacklinksPlugin from "./main";
import { HierarchicalBacklinksSettings } from "../types";

export const DEFAULT_SETTINGS: HierarchicalBacklinksSettings = {
  toggleLeafNodes: false,
};

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
          }),
      );
  }

  get toggleLeafNodes(): boolean {
    return this.plugin.settings.toggleLeafNodes;
  }
}