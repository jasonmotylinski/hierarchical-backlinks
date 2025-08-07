import { ItemView, WorkspaceLeaf } from "obsidian";
import { File } from "./file";
import HierarchicalBacklinksPlugin  from "./main";
import { TreeNodeModel } from "./treeNodeModel";
import { TreeNodeView } from "./treeNodeView";
import { NavButtonsView } from "./nav/navButtonsView";

export const VIEW_TYPE="hierarchical-backlinks";


export class HierarchicalBacklinksView extends ItemView {
    private plugin :HierarchicalBacklinksPlugin;
    private treeNodeViews: TreeNodeView[]=[];
    private originalHierarchy: TreeNodeModel[] = [];
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

    createPane(container: Element, hierarchy: TreeNodeModel[]) {
        
        const navButtonsView=new NavButtonsView(this.app, container);
        navButtonsView.render();

  
        navButtonsView.listCollapseButton.setCollapsed(this.plugin.toggleListState);
        navButtonsView.contentCollapseButton.setCollapsed(this.plugin.toggleContentState);


        navButtonsView.listCollapseButton.on("collapse-click", (e)=> {
            if(navButtonsView.listCollapseButton.isCollapsed()){
                this.plugin.toggleListState=true;
                this.treeNodeViews.forEach((n)=>{
                    n.listToggleOn();
                });
            }else{
                this.plugin.toggleListState=false;
                this.treeNodeViews.forEach((n)=>{
                    n.listToggleOff();
                });
            }
        });

        navButtonsView.contentCollapseButton.on("collapse-click", (e)=> {
            if(navButtonsView.contentCollapseButton.isCollapsed()){
                this.plugin.toggleContentState=true;
                this.treeNodeViews.forEach((n)=>{
                    n.contentHiddenToggleOn();
                });
            }else{
                this.plugin.toggleContentState=false;
                this.treeNodeViews.forEach((n)=>{
                    n.contentHiddenToggleOff();
                });
            }
        });

        // 🔍 Add search bar container
        const searchContainer = container.createDiv({ cls: "backlink-search-container" });
        const searchInput = searchContainer.createEl("input", {
            type: "text",
            placeholder: "Filter backlinks...",
            cls: "backlink-search-input",
        });

        // Add event listener to filter backlinks (you'll implement filter logic later)
        searchInput.addEventListener("input", (e) => {
            const query = (e.target as HTMLInputElement).value.toLowerCase();
            this.filterBacklinks(query);
        });

        const pane=container.createDiv({cls: "backlink-pane"});
        this.appendLinks(pane, navButtonsView,"Linked mentions", hierarchy);

        this.originalHierarchy = hierarchy;

        // Apply plugin toggle states to the freshly created treeNodeViews
        if (this.plugin.toggleListState) {
            this.treeNodeViews.forEach((n) => n.listToggleOn());
        } else {
            this.treeNodeViews.forEach((n) => n.listToggleOff());
        }

        if (this.plugin.toggleContentState) {
            this.treeNodeViews.forEach((n) => n.contentHiddenToggleOn());
        } else {
            this.treeNodeViews.forEach((n) => n.contentHiddenToggleOff());
        }
    }

    private filterBacklinks(query: string) {
        const trimmed = query.trim().toLowerCase();

        const resetVisibility = (node: TreeNodeModel) => {
            node.isVisible = false;
            for (const child of node.children) {
                resetVisibility(child);
            }
        };


    
        const markVisibility = (node: TreeNodeModel): boolean => {
            const pathSegments = node.path?.toLowerCase().split("/") ?? [];
            const pathMatch = pathSegments.some(segment => segment.includes(trimmed));
            const contentMatch = node.content?.toLowerCase().includes(trimmed) ?? false;
            const isMatch = node.isLeaf && (pathMatch || contentMatch);
    
            let childrenMatch = false;


            for (const child of node.children) {
                const childMatches = markVisibility(child);
                if (childMatches) {
                    childrenMatch = true;
                }
            }
            

            node.isVisible = isMatch || childrenMatch;

            console.debug(`[filterTree] node="${node.path}", isLeaf=${node.isLeaf}, isMatch=${isMatch}, childrenMatches=${childrenMatch}`);
            return node.isVisible;

        };

        for (const node of this.originalHierarchy) {
            resetVisibility(node);
        }
    
        for (const node of this.originalHierarchy) {
            markVisibility(node);
        }
    
        console.debug(`[filterBacklinks] Query: "${trimmed}"`);
    
        const pane = this.containerEl.querySelector(".backlink-pane") as HTMLDivElement;
        if (pane) {
            pane.empty();
            const navButtonsViewStub = new NavButtonsView(this.app, pane);
            this.appendLinks(pane, navButtonsViewStub, "Filtered results", this.originalHierarchy);

            // Apply plugin toggleListState to the freshly created treeNodeViews for consistency with createPane()
            if (this.plugin.toggleListState) {
                this.treeNodeViews.forEach((n) => n.listToggleOn());
            } else {
                this.treeNodeViews.forEach((n) => n.listToggleOff());
            }

            if (this.plugin.toggleContentState) {
                this.treeNodeViews.forEach((n) => n.contentHiddenToggleOn());
            } else {
                this.treeNodeViews.forEach((n) => n.contentHiddenToggleOff());
            }
        }
    }

    appendLinks(pane :HTMLDivElement, navButtonsView: NavButtonsView, headerText :string, links: any[]){
        const linksHeader=pane.createDiv({cls: "tree-item-self is-clickable"});
        linksHeader.createEl("div",{text: headerText});
        pane.appendChild(linksHeader);

        const searchResultsContainer=pane.createDiv({cls: "search-result-container"});

        // Clear stale view references before re-rendering
        this.treeNodeViews = [];

        // If filtering ran, nodes have `isVisible` set for matches and their ancestors.
        // We must prune children that are not visible so descendants don’t appear
        // just because an ancestor matched. Additionally, respect per-node collapsed
        // state: if a node is collapsed, render the node but not its children.
        const hasVisibility = Array.isArray(links) && links.some((l) => Object.prototype.hasOwnProperty.call(l, "isVisible"));

        const pruneForRender = (nodes: TreeNodeModel[]): TreeNodeModel[] => {
            if (!Array.isArray(nodes)) return [];
            return nodes
                // When visibility flags exist, only keep visible nodes
                .filter((n) => !hasVisibility || n.isVisible)
                .map((n) => {
                    const isCollapsed = (n as any).isCollapsed === true || (n as any).collapsed === true;
                    return {
                        ...n,
                        // Respect collapsed state: keep node, but drop children if collapsed
                        children: isCollapsed ? [] : pruneForRender(n.children ?? [])
                    } as TreeNodeModel;
                });
        };

        const linksToRender: TreeNodeModel[] = pruneForRender(links);

        if(linksToRender.length==0){
            searchResultsContainer.createDiv({cls: "search-empty-state", text: "No backlinks found."})
        }else{
            linksToRender.forEach((l) =>{
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
