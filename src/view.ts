import { ItemView, WorkspaceLeaf, getIcon } from "obsidian";
import { File } from "./file";
import HierarchicalBacklinksPlugin  from "./main";
import { ContentReference, TreeNode } from "./types";
import { SearchResultFileMatchView } from "./searchResultFileMatchView";
import { TreeNodeView } from "./treeNodeView";

export const VIEW_TYPE="hierarchical-backlinks-view";


export class HierarchicalBacklinksView extends ItemView {
    private plugin :HierarchicalBacklinksPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: HierarchicalBacklinksPlugin){
        super(leaf);
        this.plugin=plugin;
    }

    getViewType(){
        return VIEW_TYPE;
    }

    getIcon(): string {
        return "links-coming-in";
    }

    getDisplayText(): string {
        return "Hierarchical backlinks";
    }

    async initialize(){

        const container=this.containerEl.children[1];
        container.empty();
        const activeFile=this.app.workspace.getActiveFile();

        if(activeFile){
            const file=new File(this.app, activeFile);
            const hierarchy=(await file.getBacklinksHierarchy());
            this.createPane(container, hierarchy);
        }
    }

    createPane(container :Element, hierarchy :TreeNode[]){
        const pane=container.createDiv({cls: "backlink-pane"});
        this.appendLinks(pane, "Linked mentions", hierarchy);
    }

    appendLinks(pane :HTMLDivElement, headerText :string, links: any[]){
        const linksHeader=pane.createDiv({cls: "tree-item-self is-clickable"});
        linksHeader.createEl("div",{text: headerText});
        pane.appendChild(linksHeader);

        const searchResultsContainer=pane.createDiv({cls: "search-result-container"});
        links.forEach((l) =>{
			const treeNodeView=new TreeNodeView(this.app);
			treeNodeView.render(searchResultsContainer, l);
        });
    }

    navigateTo(name :string){
        const firstLink=this.app.metadataCache.getFirstLinkpathDest(name, '');
            
        if(firstLink){
            this.app.workspace.openLinkText(firstLink.name, firstLink.path);
        }
    }

    register_events(){
        this.plugin.registerEvent(this.app.metadataCache.on("changed", () => {
            this.initialize();
        }));

        this.plugin.registerEvent(this.app.workspace.on("layout-change", () => {
            this.initialize();
        }));

        this.plugin.registerEvent(this.app.workspace.on("active-leaf-change", () => {
            this.initialize();
        }));
    }

    async onOpen(){
        this.register_events();
        return this.initialize();
    }
}
