import {  Plugin, WorkspaceLeaf } from 'obsidian';
import {HierarchicalBacklinksView, VIEW_TYPE} from "./view";

export default class HierarchicalBacklinksPlugin extends Plugin {
    async onload() {
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
