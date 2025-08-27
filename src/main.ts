import {  Plugin, WorkspaceLeaf } from 'obsidian';
import {HierarchicalBacklinksView, VIEW_TYPE} from "./view";
import { PluginSettings } from './types';

export default class HierarchicalBacklinksPlugin extends Plugin {
    settings: PluginSettings;
    DEFAULT_SETTINGS: Partial<PluginSettings> = {
        collapseButtonState: false
    };
    async onload() {
        await this.loadSettings();
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
    async loadSettings() {
        this.settings = Object.assign({}, this.DEFAULT_SETTINGS, await this.loadData());
    }
    async onUserEnable(){
        this.activateView();
    }

    onunload() {
    }

    async activateView(){
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE);

        if(leaves.length > 0){
            leaf=leaves[0];
        }else{
            leaf=workspace.getRightLeaf(false);
            await leaf?.setViewState({type: VIEW_TYPE, active: true});
        }

        workspace.revealLeaf(leaf!);
    }
}
