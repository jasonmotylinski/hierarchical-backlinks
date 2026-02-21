import { PluginSettingTab, Setting } from "obsidian";
import type HierarchicalBacklinksPlugin from "./main";
import { HierarchicalBacklinksSettings } from "../types";
import { VIEW_TYPE } from "../view/view";

export const DEFAULT_SETTINGS: HierarchicalBacklinksSettings = {
  toggleLeafNodes: false,
  boldFileNames: true,
  useFrontmatterTitle: false,
  frontmatterTitleProperty: "title",
  hideFolderNote: false,
  folderNoteIndexName: "",
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

    new Setting(containerEl)
      .setName("Use frontmatter property as display name")
      .setDesc("Display the value of a frontmatter property instead of the file name in the backlinks tree.")
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.useFrontmatterTitle)
          .onChange(async (value) => {
            this.plugin.settings.useFrontmatterTitle = value;
            await this.plugin.saveSettings();
            propertyNameSetting.settingEl.toggle(value);
          }),
      );

    const propertyNameSetting = new Setting(containerEl)
      .setName("Frontmatter property name")
      .setDesc("The frontmatter property to use as the display name.")
      .addText(text =>
        text
          .setPlaceholder("title")
          .setValue(this.plugin.settings.frontmatterTitleProperty)
          .onChange(async (value) => {
            this.plugin.settings.frontmatterTitleProperty = value;
            await this.plugin.saveSettings();
          }),
      );
    propertyNameSetting.settingEl.toggle(this.plugin.settings.useFrontmatterTitle);

    new Setting(containerEl).setName("Folder notes").setHeading();

    new Setting(containerEl)
      .setName("Hide folder notes")
      .setDesc("Hide folder notes from being displayed in the hierarchy. When a note has the same name as its parent folder (or matches the index file name), it is hidden and the folder becomes clickable instead.")
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.hideFolderNote)
          .onChange(async (value) => {
            this.plugin.settings.hideFolderNote = value;
            await this.plugin.saveSettings();
            indexNameSetting.setDisabled(!value);
          }),
      );

    const indexNameSetting = new Setting(containerEl)
      .setName("Index file name")
      .setDesc("Also treat a file with this name as a folder note regardless of the folder name (e.g. \"overview\" or \"_index\").")
      .setDisabled(!this.plugin.settings.hideFolderNote)
      .addText(text =>
        text
          .setPlaceholder("overview")
          .setValue(this.plugin.settings.folderNoteIndexName)
          .onChange(async (value) => {
            this.plugin.settings.folderNoteIndexName = value;
            await this.plugin.saveSettings();
          }),
      );
  }

  get toggleLeafNodes(): boolean {
    return this.plugin.settings.toggleLeafNodes;
  }
}