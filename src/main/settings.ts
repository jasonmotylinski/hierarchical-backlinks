import { PluginSettingTab, Setting } from "obsidian";
import type HierarchicalBacklinksPlugin from "./main";
import { HierarchicalBacklinksSettings, FOLDER_NOTE_OPEN_KEY_OPTIONS } from "../types";
import { VIEW_TYPE, HierarchicalBacklinksView } from "../view/view";
import { uiState } from "../ui/uiState";

export const DEFAULT_SETTINGS: HierarchicalBacklinksSettings = {
  toggleLeafNodes: false,
  boldFileNames: true,
  useFrontmatterTitle: false,
  frontmatterTitleProperty: "title",
  hideFolderNote: false,
  folderNoteIndexName: "",
  superchargedLinks: false,
  openNoteOnRowClick: true,
  folderNoteOpenKey: "alt",
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
      .setDesc("Hide backlink context by default. Applies immediately to open panels and on future launches.")
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.toggleLeafNodes)
          .onChange(async (value) => {
            this.plugin.settings.toggleLeafNodes = value;
            uiState.contentCollapsed = value;
            await this.plugin.saveSettings();
            // Apply the change live to all open backlink views
            this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(leaf => {
              void (leaf.view as HierarchicalBacklinksView).actionContent?.(value);
            });
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

    new Setting(containerEl).setName("Styling").setHeading();

    new Setting(containerEl)
      .setName("Supercharged Links attributes")
      .setDesc("Add Supercharged Links-style data-link-* attributes (from each note's frontmatter and tags) to backlink rows, so your existing Supercharged Links CSS snippets color them. No dependency on the Supercharged Links plugin.")
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.superchargedLinks)
          .onChange(async (value) => {
            this.plugin.settings.superchargedLinks = value;
            await this.plugin.saveSettings();
            // Re-render open views so the attributes are added/removed now.
            this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(leaf => {
              void (leaf.view as HierarchicalBacklinksView).initialize();
            });
          }),
      );

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

    const openNoteOnRowClickSetting = new Setting(containerEl)
      .setName("Open note on row click")
      .setDesc("When enabled, clicking a folder note row opens the note. When disabled, clicking toggles expand/collapse and a modifier key opens the note.")
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.openNoteOnRowClick)
          .onChange(async (value) => {
            this.plugin.settings.openNoteOnRowClick = value;
            await this.plugin.saveSettings();
            folderNoteOpenKeySetting.settingEl.toggle(!value);
          }),
      );

    const folderNoteOpenKeySetting = new Setting(containerEl)
      .setName("Key for opening folder note")
      .setDesc("Modifier key to open the folder note when 'Open note on row click' is disabled.")
      .addDropdown(dropdown =>
        dropdown
          .addOptions(Object.fromEntries(FOLDER_NOTE_OPEN_KEY_OPTIONS.map(k => [k, k.charAt(0).toUpperCase() + k.slice(1)])))
          .setValue(this.plugin.settings.folderNoteOpenKey)
          .onChange(async (value) => {
            this.plugin.settings.folderNoteOpenKey = value;
            await this.plugin.saveSettings();
          }),
      );
    folderNoteOpenKeySetting.settingEl.toggle(!this.plugin.settings.openNoteOnRowClick);
  }

  get toggleLeafNodes(): boolean {
    return this.plugin.settings.toggleLeafNodes;
  }
}