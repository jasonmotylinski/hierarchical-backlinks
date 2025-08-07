import { App, setIcon } from "obsidian";
import { SearchResultFileMatchView } from "./searchResultFileMatchView";
import { ContentReference} from "./types";
import { TreeNodeModel } from "./treeNodeModel";

// Set DEBUG flag to true to enable debug logging
class Logger {
  static DEBUG = false;
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

    constructor(app: App, parent: HTMLDivElement, treeNode: TreeNodeModel) {
        this.app = app;
        this.parent = parent;
        this.treeNode = treeNode;
        this.treeNodeViewChildren = [];
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
            const treeNodeView=new TreeNodeView(this.app, this.childrenContainer!, c);
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
        this.treeNode.isCollapsed = true;
        this.treeNodeViewChildren.forEach(child => child.listToggleOn());
        
        this.updateCollapsedState();

        Logger.log("[ListToggleOn]", this.treeNode.title, "→ isCollapsed set to:", this.treeNode.isCollapsed);
    }

    listToggleOff() {
        if (this.treeNode.isLeaf) {
            this.treeNode.isCollapsed = TreeNodeView.contentHidden;
        } else {
            this.treeNode.isCollapsed = false;
        }

        this.treeNodeViewChildren.forEach(child => child.listToggleOff());
        
        this.updateCollapsedState();

        Logger.log("[ListToggleOff]", this.treeNode.title, "| isLeaf:", this.treeNode.isLeaf, "| contentHidden:", TreeNodeView.contentHidden, "→ isCollapsed set to:", this.treeNode.isCollapsed);
    }

    contentHiddenToggleOn() {
        if (this.treeNode.isLeaf) {
            Logger.log("[ContentHiddenToggleOn]", this.treeNode.title, "| isLeaf:", true, "→ Collapsing");
            this.treeNode.isCollapsed = true;
        } else {
            Logger.log("[ContentHiddenToggleOn]", this.treeNode.title, "| isLeaf:", false, "→ Skipping collapse");
        }

        this.treeNodeViewChildren.forEach(child => child.contentHiddenToggleOn());
        TreeNodeView.contentHidden = true;
        
        this.updateCollapsedState();
        
        Logger.log("[ContentHiddenToggleOn] contentHidden set to true");
    }

    contentHiddenToggleOff() {
        if (this.treeNode.isLeaf) {
            const parent = this.treeNode.parent;
            const parentCollapsed = parent?.isCollapsed ?? false;

            Logger.log("[ContentHiddenToggleOff]", this.treeNode.title, "| isLeaf:", true, "| hasParent:", !!parent, "| parent.isCollapsed:", parentCollapsed);

            if (!parent || !parentCollapsed) {
                this.treeNode.isCollapsed = false;
                Logger.log("[ContentHiddenToggleOff] → Expanding leaf node:", this.treeNode.title);
            } else {
                Logger.log("[ContentHiddenToggleOff] → Keeping leaf node collapsed due to collapsed parent:", this.treeNode.title);
            }
        }

        this.treeNodeViewChildren.forEach(child => child.contentHiddenToggleOff());
        TreeNodeView.contentHidden = false;

        this.updateCollapsedState();
        
        Logger.log("[ContentHiddenToggleOff] contentHidden set to false");
    }

    toggle() {
        this.treeNode.isCollapsed = !this.treeNode.isCollapsed;
        
        this.updateCollapsedState();
    }

    updateCollapsedState() {
        const isCollapsed = this.treeNode.isCollapsed;
      
        this.treeItemSelf.toggleClass("is-collapsed", isCollapsed);
        this.treeItemIcon.toggleClass("is-collapsed", isCollapsed);
      
        if (this.childrenContainer) {
          this.childrenContainer?.style.setProperty("display", isCollapsed ? "none" : "block");
        }
      
        if (this.matchBlock) {
          this.matchBlock?.style.setProperty("display", isCollapsed ? "none" : "block");
        }
      
        this.treeNodeViewChildren.forEach(child => child.updateCollapsedState());
    }

}
