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
import { uiState } from "./uiState";
import { SearchBar } from "./nav/searchBar";

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
    const container = this.containerEl.children[1] as HTMLElement; // .view-content
    container.empty();

    // Make .view-content a non-scrolling flex column so inner pane controls scrolling
    const containerDiv = container as HTMLDivElement;
    containerDiv.style.display = "flex";
    containerDiv.style.flexDirection = "column";
    containerDiv.style.height = "100%";
    containerDiv.style.overflow = "hidden";
    
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) return;
    const noteId = activeFile.path;
    if (this.currentNoteId !== noteId || !this.viewState) {
      this.currentNoteId = noteId;
      this.viewState = {
        nodeStates: new Map<string, NodeViewState>(),
      };
    }
    const file = new File(this.app, activeFile);
    const hierarchy = await file.getBacklinksHierarchy();
    this.createPane(container, hierarchy);
}

    createPane(container: Element, hierarchy: TreeNodeModel[]) {
        // Make the root content area a flex column and prevent it from scrolling
        const root = container as HTMLDivElement;
        root.style.display = "flex";
        root.style.flexDirection = "column";
        root.style.height = "100%";
        root.style.overflow = "hidden"; // prevent the outer view-content from scrolling

        // Header (nav buttons + search), rendered OUTSIDE the scroll area
        const headerWrapper = root.createDiv();
        const navButtonsView = new NavButtonsView(this.app, headerWrapper);
        navButtonsView.render();
        const headerEl = (headerWrapper.querySelector('.nav-header') as HTMLDivElement) || (headerWrapper as HTMLDivElement);

        navButtonsView.listCollapseButton.setCollapsed(uiState.listCollapsed);
        navButtonsView.contentCollapseButton.setCollapsed(uiState.contentCollapsed);

        navButtonsView.listCollapseButton.on("collapse-click", () => {
            if (navButtonsView.listCollapseButton.isCollapsed()) {
                uiState.listCollapsed = true;
                this.treeNodeViews.forEach((n) => n.listToggleOn());
            } else {
                uiState.listCollapsed = false;
                this.treeNodeViews.forEach((n) => n.listToggleOff());
            }
        });

        navButtonsView.contentCollapseButton.on("collapse-click", () => {
            if (navButtonsView.contentCollapseButton.isCollapsed()) {
                uiState.contentCollapsed = true;
                this.treeNodeViews.forEach((n) => n.contentHiddenToggleOn());
            } else {
                uiState.contentCollapsed = false;
                this.treeNodeViews.forEach((n) => n.contentHiddenToggleOff());
            }
        });

        // Search bar lives inside the header
        const searchBar = new SearchBar(headerEl, "Search...");
        searchBar.setValue(uiState.query ?? "");

        const show = uiState.searchCollapsed ?? false;
        navButtonsView.searchToggleButton.setCollapsed(show);
        searchBar.containerEl.style.display = show ? "" : "none";

        navButtonsView.searchToggleButton.on("collapse-click", () => {
            const isOn = navButtonsView.searchToggleButton.isCollapsed();
            uiState.searchCollapsed = isOn;
            searchBar.containerEl.style.display = isOn ? "" : "none";
            if (isOn) {
                const inp = searchBar.containerEl.querySelector("input") as HTMLInputElement | null;
                inp?.focus();
            } else {
                searchBar.setValue("");
                uiState.query = "";
            }
        });

        searchBar.onChange((value) => {
            const q = value.toLowerCase();
            uiState.query = q;
            this.filterBacklinks(q);
        });

        // Backlink pane (acts as a container for the header inside the pane + the scroll area)
        const pane = root.createDiv({ cls: "backlink-pane node-insert-event" });
        const paneDiv = pane as HTMLDivElement;
        paneDiv.style.position = "relative";
        paneDiv.style.display = "flex";
        paneDiv.style.flexDirection = "column";
        // Ensure no right padding/margin so scrollbar is flush
        paneDiv.style.paddingRight = "0";
        paneDiv.style.marginRight = "0";
        paneDiv.style.flex = "1 1 auto"; // fill remaining height under the header

        // Scroll container that holds the section header + results
        const scrollContainer = paneDiv.createDiv({ cls: "search-result-container" });
        const scDiv = scrollContainer as HTMLDivElement;
        scDiv.style.flex = "1 1 auto";
        scDiv.style.overflow = "auto"; // only this area scrolls
        // Ensure scrollbar is flush to the right edge
        scDiv.style.paddingRight = "0";
        scDiv.style.marginRight = "0";

        // Section header lives **inside** the scroll container so the scrollbar starts here
        const linkedHeader = scDiv.createDiv({ cls: "tree-item-self" });
        linkedHeader.style.paddingLeft = "0";
        linkedHeader.style.marginLeft = "0";
        linkedHeader.createEl("div", { text: "Linked mentions" }).style.fontWeight = "bold";
        // No sticky positioning — header scrolls away with results so the scrollbar starts at its height

        // Render nodes **after** the header inside the scroll container
        this.appendLinks(scDiv, hierarchy);

        this.originalHierarchy = hierarchy;

        // Apply toggles on freshly created nodes
        if (uiState.listCollapsed) {
            this.treeNodeViews.forEach((n) => n.listToggleOn());
        } else {
            this.treeNodeViews.forEach((n) => n.listToggleOff());
        }

        if (uiState.contentCollapsed) {
            this.treeNodeViews.forEach((n) => n.contentHiddenToggleOn());
        } else {
            this.treeNodeViews.forEach((n) => n.contentHiddenToggleOff());
        }

        if (uiState.query && uiState.query.trim().length > 0) {
            this.filterBacklinks(uiState.query);
        }
    }

    private filterBacklinks(query: string) {
        const trimmed = query.trim().toLowerCase();

        if (!this.viewState) {
            // safety: create a default view state if not present
            this.viewState = { nodeStates: new Map<string, NodeViewState>() };
        }
        uiState.query = trimmed;

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

        // Update visibility of treeNodeViews in-place
        for (const treeNodeView of this.treeNodeViews) {
            treeNodeView.updateCollapsedState();
        }
    } 

    appendLinks(containerEl :HTMLDivElement, links: any[]){
        // Clear stale view references before re-rendering
        this.treeNodeViews = [];

        const linksToRender = links as TreeNodeModel[];

        Logger.debug(ENABLE_LOG, "[appendLinks] incoming nodes", links.length);
        Logger.debug(ENABLE_LOG, "[appendLinks] nodes rendered (no prune)", linksToRender.length);

        if(linksToRender.length==0){
            containerEl.createDiv({cls: "search-empty-state", text: "No backlinks found."})
        }else{
            linksToRender.forEach((l) =>{
                const treeNodeView = new TreeNodeView(
                    this.app,
                    containerEl,
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
