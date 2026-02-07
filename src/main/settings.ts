import { PluginSettingTab, Setting } from "obsidian";
import type HierarchicalBacklinksPlugin from "./main";
import { HierarchicalBacklinksSettings } from "../types";
import { VIEW_TYPE } from "../view/view";

export const DEFAULT_SETTINGS: HierarchicalBacklinksSettings = {
  toggleLeafNodes: false,
  boldFileNames: true,
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
      .setName("Hide Context by Default")
      .setDesc("Next time the plugin is loaded, context will be hidden by default.")
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.toggleLeafNodes)
          .onChange(async (value) => {
            this.plugin.settings.toggleLeafNodes = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Bold File Names")
      .setDesc("Display file names in bold when they have backlink matches.")
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.boldFileNames)
          .onChange(async (value) => {
            this.plugin.settings.boldFileNames = value;
            await this.plugin.saveSettings();
            // Update all open backlink views immediately
            this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(leaf => {
              leaf.view.containerEl.toggleClass("hbl-no-bold", !value);
            });
          }),
      );
  }

  get toggleLeafNodes(): boolean {
    return this.plugin.settings.toggleLeafNodes;
  }
}