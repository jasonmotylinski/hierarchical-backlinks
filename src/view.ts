import { ItemView, WorkspaceLeaf } from "obsidian";
import { File } from "./file";
import HierarchicalBacklinksPlugin  from "./main";
import { TreeNode } from "./types";
import { TreeNodeView } from "./treeNodeView";
import { NavButtonsView } from "./nav/navButtonsView";

export const VIEW_TYPE="hierarchical-backlinks";


export class HierarchicalBacklinksView extends ItemView {
    private plugin :HierarchicalBacklinksPlugin;
    private treeNodeViews: TreeNodeView[]=[];
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
        
        const navButtonsView=new NavButtonsView(this.app, container);
        navButtonsView.render();

        navButtonsView.collapseButton.on("collapse-click", (e)=> {
            if(navButtonsView.collapseButton.isCollapsed()){
                this.treeNodeViews.forEach((n)=>{
                    n.toggleOff();
                });
            }else{
                this.treeNodeViews.forEach((n)=>{
                    n.toggleOn();
                });
            }
        });

        const pane=container.createDiv({cls: "backlink-pane"});
        this.appendLinks(pane, navButtonsView,"Linked mentions", hierarchy);
    }

    appendLinks(pane :HTMLDivElement, navButtonsView: NavButtonsView,headerText :string, links: any[]){
        const linksHeader=pane.createDiv({cls: "tree-item-self is-clickable"});
        linksHeader.createEl("div",{text: headerText});
        pane.appendChild(linksHeader);

        const searchResultsContainer=pane.createDiv({cls: "search-result-container"});

        if(links.length==0){
            searchResultsContainer.createDiv({cls: "search-empty-state", text: "No backlinks found."})
        }else{
            links.forEach((l) =>{
                const treeNodeView=new TreeNodeView(this.app,searchResultsContainer, l);
                treeNodeView.render();
                this.treeNodeViews.push(treeNodeView);
            });
        }
    }

    register_events(){
        this.plugin.registerEvent(this.app.metadataCache.on("changed", () => {
            this.initialize();
        }));

        this.plugin.registerEvent(this.app.workspace.on("layout-change", () => {
            this.initialize();
        }));

		this.plugin.registerEvent(this.app.workspace.on("file-open", () => {
           this.initialize();
        }));

    }

    async onOpen(){
        this.register_events();
        return this.initialize();
    }
}
