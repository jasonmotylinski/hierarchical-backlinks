import { App, setIcon } from "obsidian";
import { SearchResultFileMatchView } from "./searchResultFileMatchView";
import { ContentReference, ViewState, NodeViewState, NodeId } from "./types";
import { TreeNodeModel } from "./treeNodeModel";

// Set DEBUG flag to true to enable debug logging
class Logger {
  static DEBUG = true;
  static log(...args: any[]) {
    if (Logger.DEBUG) console.debug(...args);
  }
}

export class TreeNodeView{
    private app: App;
    private static contentHidden: boolean = false;
    private parent: HTMLDivElement;
    private treeItem: HTMLDivElement;
    private treeItemSelf: HTMLDivElement;
    private treeItemIcon: HTMLDivElement;
    private treeNode: TreeNodeModel;
    private treeNodeViewChildren: TreeNodeView[];
    private childrenContainer: HTMLDivElement | null = null;
    private matchBlock: HTMLDivElement | null = null;
    private viewState: ViewState;
    private preserveCollapseState: boolean;

    constructor(app: App, parent: HTMLDivElement, treeNode: TreeNodeModel, viewState: ViewState, preserveCollapseState: boolean = true) {
        this.app = app;
        this.parent = parent;
        this.treeNode = treeNode;
        this.treeNodeViewChildren = [];
        this.viewState = viewState;
        this.preserveCollapseState = preserveCollapseState;
      }

    render(){
        this.treeItem=this.parent.createDiv({cls: "tree-item"});
        this.treeItemSelf=this.treeItem.createDiv({cls: "tree-item-self is-clickable backlink-item"});

        this.appendEndNode(this.treeItemSelf, this.treeNode);

        const treeItemFlair=this.treeItemSelf.createDiv({cls:"tree-item-flair-outer"}).createEl("span",{cls: "tree-item-flair"});
        if(this.treeNode.children.length > 0){
            this.appendTreeItemChildren(this.treeItem, this.treeNode.children);
            
        }else{
            const total=this.treeNode.references.reduce((accumulator: number,curr)=>{
                return accumulator+=curr.content.length + curr.properties.length;
            }, 0);
            treeItemFlair.setText(total.toString());
            this.appendReferences(this.treeItem, this.treeNode, this.treeNode.references);
        }

        // Apply current collapsed state (hide/show children or matches)
        this.updateCollapsedState();
    }

    appendEndNode(parent :HTMLDivElement, treeNode :TreeNodeModel){
        this.treeItemIcon=parent.createDiv({cls: "tree-item-icon collapse-icon"});

        let name = treeNode.title;
        if(treeNode.children && treeNode.children.length == 0){
            const firstLink=this.app.metadataCache.getFirstLinkpathDest(treeNode.title, '');
            
            if(firstLink){
                name=firstLink.basename;
            }
        }

        const treeItemInner=parent.createDiv({cls: "tree-item-inner", text: name});
        setIcon(this.treeItemIcon, 'right-triangle');

        this.treeItemIcon.addEventListener("click", (e)=> {

            this.toggle();
        });
        treeItemInner.addEventListener("click", (e)=>{ 
            this.navigateTo(treeNode.path);
        });
    }

    appendTreeItemChildren(treeItem:HTMLDivElement, children :TreeNodeModel[]){
        this.childrenContainer=treeItem.createDiv({cls: "tree-item-children"});
        children.forEach((c)=>{ 
            const treeNodeView = new TreeNodeView(
                this.app,
                this.childrenContainer!,
                c,
                this.viewState,
                this.preserveCollapseState
            );
            treeNodeView.render();
            this.treeNodeViewChildren.push(treeNodeView);
        });

    }

    navigateTo(path :string){
        const firstLink=this.app.metadataCache.getFirstLinkpathDest(path, '');
            
        if(firstLink){
            this.app.workspace.openLinkText(firstLink.name, firstLink.path);
        }
    }

    appendReferences(parent:HTMLDivElement, item: TreeNodeModel, references :ContentReference[]){
        this.matchBlock = parent.createDiv({ cls: "search-result-file-matches" });
        const matchView = new SearchResultFileMatchView(this.app, this.matchBlock, item.content, references);
        matchView.render();
    }

    listToggleOn() {
        // Always collapse the node when toggling on.
        // Collapse this node and all descendants; also mark the list as collapsed
        this.viewState.listCollapsed = true;
        const state = this.ensureNodeViewState();
        state.isCollapsed = true;

        this.treeNodeViewChildren.forEach(child => child.listToggleOn());
        
        this.updateCollapsedState();

        Logger.log("[ListToggleOn]", this.treeNode.title, "→ isCollapsed set to:", state.isCollapsed);    }

    listToggleOff() {

        // Expand according to contentCollapsed for leaves; parents expand
        this.viewState.listCollapsed = false;
        const state = this.ensureNodeViewState();

        if (this.treeNode.isLeaf) {
            state.isCollapsed = this.viewState.contentCollapsed;
        } else {
            state.isCollapsed = false;
        }

        this.treeNodeViewChildren.forEach(child => child.listToggleOff());
        
        this.updateCollapsedState();

        Logger.log("[ListToggleOff]", this.treeNode.title, "| isLeaf:", this.treeNode.isLeaf, "| contentCollapsed:", this.viewState.contentCollapsed, "→ isCollapsed set to:", state.isCollapsed);    }

    contentHiddenToggleOn() {

        // When content is hidden, collapse leaf nodes; keep parents as-is
        this.viewState.contentCollapsed = true;
        const state = this.ensureNodeViewState();


        if (this.treeNode.isLeaf) {
            Logger.log("[ContentHiddenToggleOn]", this.treeNode.title, "| isLeaf:", true, "→ Collapsing");
            state.isCollapsed = true;
        } else {
            Logger.log("[ContentHiddenToggleOn]", this.treeNode.title, "| isLeaf:", false, "→ Skipping collapse");
        }

        this.treeNodeViewChildren.forEach(child => child.contentHiddenToggleOn());
        TreeNodeView.contentHidden = true;
        
        this.updateCollapsedState();
        
        Logger.log("[ContentHiddenToggleOn] contentCollapsed set to true");
    }

    contentHiddenToggleOff() {

        this.viewState.contentCollapsed = false;
        const state = this.ensureNodeViewState();


        if (this.treeNode.isLeaf) {
            const parent = this.treeNode.parent;
            const parentCollapsed = parent ? (this.viewState.nodeStates.get(parent.path)?.isCollapsed ?? false) : false;

            Logger.log("[ContentHiddenToggleOff]", this.treeNode.title, "| isLeaf:", true, "| hasParent:", !!parent, "| parent.isCollapsed:", parentCollapsed);

            if (!parent || !parentCollapsed) {
                state.isCollapsed = false;
                Logger.log("[ContentHiddenToggleOff] → Expanding leaf node:", this.treeNode.title);
            } else {
                Logger.log("[ContentHiddenToggleOff] → Keeping leaf node collapsed due to collapsed parent:", this.treeNode.title);
            }
        }

        this.treeNodeViewChildren.forEach(child => child.contentHiddenToggleOff());
        TreeNodeView.contentHidden = false;

        this.updateCollapsedState();
        
        Logger.log("[ContentHiddenToggleOff] contentCollapsed set to false");
    }

    toggle() {
        const state = this.ensureNodeViewState();
        state.isCollapsed = !state.isCollapsed;
        
        this.updateCollapsedState();
    }

    updateCollapsedState() {
        const state = this.ensureNodeViewState();
        let isCollapsed = state.isCollapsed;

        // Active search?
        const searchActive = !!this.viewState.query && this.viewState.query.trim().length > 0;
        const isLeaf = this.treeNode.isLeaf;

        // 1) If preservation is OFF during a search, expand folders (ignore saved collapse)
        if (!this.preserveCollapseState && searchActive && !isLeaf) {
            isCollapsed = false;
        }

        // 2) Global toggles as visual overrides
        if (this.viewState.listCollapsed && !isLeaf) {
            isCollapsed = true;
        }
        if (this.viewState.contentCollapsed && isLeaf) {
            isCollapsed = true;
        }

        // 3) Optional default: for new nodes (no stored state) & preserve ON, default parents to collapsed
        if (this.preserveCollapseState && !this.viewState.nodeStates.has(this.treeNode.path) && !isLeaf) {
            isCollapsed = true;
        }

        // Apply visual state
        this.treeItemSelf.toggleClass("is-collapsed", isCollapsed);
        this.treeItemIcon.toggleClass("is-collapsed", isCollapsed);

        if (this.childrenContainer) {
            this.childrenContainer.style.setProperty("display", isCollapsed ? "none" : "block");
        }
        if (this.matchBlock) {
            this.matchBlock.style.setProperty("display", isCollapsed ? "none" : "block");
        }

        // Propagate to children
        this.treeNodeViewChildren.forEach(child => child.updateCollapsedState());
    }

    get isCollapsed(): boolean {
        return this.ensureNodeViewState().isCollapsed;
    }   

    get treeNodeModel(): TreeNodeModel {
        return this.treeNode;
    }

    private ensureNodeViewState(): NodeViewState {
        const id: NodeId = this.treeNode.path;
        let state = this.viewState.nodeStates.get(id);
        if (!state) {
            state = { isCollapsed: false, isVisible: true };
            this.viewState.nodeStates.set(id, state);
        }
        return state;
    }

}
