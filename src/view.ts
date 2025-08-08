import { ItemView, WorkspaceLeaf } from "obsidian";
import { File } from "./file";
import HierarchicalBacklinksPlugin  from "./main";
import { TreeNodeModel } from "./treeNodeModel";
import { TreeNodeView } from "./treeNodeView";
import { NavButtonsView } from "./nav/navButtonsView";
import { ViewState, NodeViewState } from "./types";
import { parseSearchQuery } from "./search/parse";
import { makePredicate } from "./search/evaluate";
import { Logger } from "./utils/logger";

const ENABLE_LOG = true; // Set to false to disable logging in this file

export const VIEW_TYPE="hierarchical-backlinks";


export class HierarchicalBacklinksView extends ItemView {
    private plugin :HierarchicalBacklinksPlugin;
    private treeNodeViews: TreeNodeView[]=[];
    private originalHierarchy: TreeNodeModel[] = [];
    private viewState: ViewState | null = null;
    private currentNoteId: string | null = null;
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

async initialize() {
        const container = this.containerEl.children[1];
        container.empty();
      
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;
      
        const noteId = activeFile.path;
        if (this.currentNoteId !== noteId || !this.viewState) {
          this.currentNoteId = noteId;
          this.viewState = {
            query: "",
            listCollapsed: this.plugin.toggleListState,
            contentCollapsed: this.plugin.toggleContentState,
            nodeStates: new Map<string, NodeViewState>(),
          };
        }
      
        const file = new File(this.app, activeFile);
        const hierarchy = await file.getBacklinksHierarchy();
        this.createPane(container, hierarchy);
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

        // 🔍 Add search bar container (hidden by default; shown when search button is toggled)
        const searchContainer = container.createDiv({ cls: "backlink-search-container" });
        (searchContainer as HTMLElement).style.display = "none"; // start hidden
        const searchInput = searchContainer.createEl("input", {
            type: "text",
            placeholder: "Filter backlinks...",
            cls: "backlink-search-input",
        });

        // tie visibility to the nav search toggle button
        navButtonsView.searchToggleButton.on("collapse-click", () => {
            const show = navButtonsView.searchToggleButton.isCollapsed();
            (searchContainer as HTMLElement).style.display = show ? "" : "none";
            if (show) {
                (searchInput as HTMLInputElement).focus();
            } else {
                (searchInput as HTMLInputElement).value = "";
                this.filterBacklinks("");
            }
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

        if (!this.viewState) {
            // safety: create a default view state if not present
            this.viewState = { query: "", listCollapsed: false, contentCollapsed: false, nodeStates: new Map<string, NodeViewState>() };
        }
        this.viewState.query = trimmed;

        // Build search predicate (bare terms target content by default)
        const { clauses } = parseSearchQuery(trimmed, "default");
        const pred = makePredicate(clauses, { defaultKey: "default" });
        

        const ensureState = (path: string): NodeViewState => {
            let s = this.viewState!.nodeStates.get(path);
            if (!s) {
                s = { isCollapsed: false, isVisible: true };
                this.viewState!.nodeStates.set(path, s);
            }
            return s;
        };

        const resetVisibility = (node: TreeNodeModel) => {
            const s = ensureState(node.path);
            s.isVisible = true;
            for (const child of node.children) {
                resetVisibility(child);
            }
        };

        const markVisibility = (node: TreeNodeModel): boolean => {
            // const pathSegments = node.path?.toLowerCase().split("/") ?? [];
            // const pathMatch = pathSegments.some(segment => segment.includes(trimmed));
            // const contentMatch = node.content?.toLowerCase().includes(trimmed) ?? false;
            // const isMatch = node.isLeaf && (pathMatch || contentMatch);
            const isMatch = node.isLeaf && pred(node);
    
            let childrenMatch = false;


            for (const child of node.children) {
                const childMatches = markVisibility(child);
                if (childMatches) childrenMatch = true;
            }
            

            const state = ensureState(node.path);
            state.isVisible = isMatch || childrenMatch;

            Logger.debug(ENABLE_LOG,`[filterTree] node="${node.path}", isLeaf=${node.isLeaf}, isMatch=${isMatch}, childrenMatches=${childrenMatch}`);
            return state.isVisible;

        };

        if (trimmed.length === 0) {
            for (const node of this.originalHierarchy) {
                resetVisibility(node);
            }
        } else {
            for (const node of this.originalHierarchy) {
                markVisibility(node);
            }
        }
    
        console.debug(`[filterBacklinks] Query: "${trimmed}"`);
    
        const pane = this.containerEl.querySelector(".backlink-pane") as HTMLDivElement;
        if (pane) {
            pane.empty();
            const navButtonsViewStub = new NavButtonsView(this.app, pane);
            this.appendLinks(pane, navButtonsViewStub, trimmed ? "Filtered results" : "Linked mentions", this.originalHierarchy);
            
            // Apply plugin toggle states to freshly created TreeNodeViews
            // if (this.plugin.toggleListState) {
            //     this.treeNodeViews.forEach((n) => n.listToggleOn());
            // } else {
            //     this.treeNodeViews.forEach((n) => n.listToggleOff());
            // }
            
            // if (this.plugin.toggleContentState) {
            //     this.treeNodeViews.forEach((n) => n.contentHiddenToggleOn());
            // } else {
            //     this.treeNodeViews.forEach((n) => n.contentHiddenToggleOff());
            // }
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
        const hasVisibility = !!this.viewState && !!this.viewState.query && this.viewState.query.trim().length > 0;

        const pruneForRender = (nodes: TreeNodeModel[]): TreeNodeModel[] => {
            if (!Array.isArray(nodes)) return [];
            return nodes
              .filter((n) => {
                if (!this.viewState) return true;
                if (!hasVisibility) return true;
                const st = this.viewState.nodeStates.get(n.path);
                return st ? st.isVisible : true;
              })
              .map((n) => {
                // Do not prune by `isCollapsed` here; only visibility is applied above.
                // Keeping children allows expand/uncollapse to work after filtering.
                return { ...n, children: pruneForRender(n.children ?? []) } as TreeNodeModel;
              });
        };

        console.debug("[appendLinks] incoming nodes", links.length);
        const linksToRender = pruneForRender(links);
        console.debug("[appendLinks] nodes rendered after prune", linksToRender.length);

        if(linksToRender.length==0){
            searchResultsContainer.createDiv({cls: "search-empty-state", text: "No backlinks found."})
        }else{
            linksToRender.forEach((l) =>{
                const treeNodeView = new TreeNodeView(
                    this.app,
                    searchResultsContainer,
                    l,
                    this.viewState!,
                    this.plugin.settings.preserveCollapseState);
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
