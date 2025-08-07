import { App, setIcon } from "obsidian";
import { SearchResultFileMatchView } from "./searchResultFileMatchView";
import { ContentReference} from "./types";
import { TreeNodeModel } from "./models/TreeNodeModel";

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

        let name = treeNode.name;
        if(treeNode.children && treeNode.children.length == 0){
            const firstLink=this.app.metadataCache.getFirstLinkpathDest(treeNode.name, '');
            
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
            this.navigateTo(treeNode.name);
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

    navigateTo(name :string){
        const firstLink=this.app.metadataCache.getFirstLinkpathDest(name, '');
            
        if(firstLink){
            this.app.workspace.openLinkText(firstLink.name, firstLink.path);
        }
    }

    appendReferences(parent:HTMLDivElement, item: TreeNodeModel, references :ContentReference[]){
        this.matchBlock = parent.createDiv({ cls: "search-result-file-matches" });
        const matchView = new SearchResultFileMatchView(this.app, this.matchBlock, item.content, references);
        matchView.render();
    }

    listToggleOff() { 
        if (this.treeNode.isLeaf) {
            if (!TreeNodeView.contentHidden) {
                this.treeNode.isCollapsed = false;
                console.debug("[ListToggleOff]", this.treeNode.name, "| isLeaf:", true, "| contentHidden:", false, "→ isCollapsed set to:", false);
            } else {
                this.treeNode.isCollapsed = true;
                console.debug("[ListToggleOff]", this.treeNode.name, "| isLeaf:", true, "| contentHidden:", true, "→ isCollapsed set to:", true);
            }
        } else {
            this.treeNode.isCollapsed = false;
            console.debug("[ListToggleOff]", this.treeNode.name, "| isLeaf:", false, "→ isCollapsed set to:", false);
        }
        this.treeNodeViewChildren.forEach(child => child.listToggleOff());

        this.updateCollapsedState(); 
    }
    
    listToggleOn() {
      // Always collapse the node when toggling on.
      this.treeNode.isCollapsed = true;
      console.debug("[ListToggleOn]", this.treeNode.name, "→ isCollapsed set to:", this.treeNode.isCollapsed);
      this.treeNodeViewChildren.forEach(child => child.listToggleOn());
      this.updateCollapsedState();
    }

    contentHiddenToggleOn() {
      if (this.treeNode.isLeaf) {
        console.debug("[ContentHiddenToggleOn]", this.treeNode.name, "| isLeaf:", true, "→ Collapsing");
        this.treeNode.isCollapsed = true;
      } else {
        console.debug("[ContentHiddenToggleOn]", this.treeNode.name, "| isLeaf:", false, "→ Skipping collapse");
      }

      this.treeNodeViewChildren.forEach(child => child.contentHiddenToggleOn());
      TreeNodeView.contentHidden = true;

      this.updateCollapsedState();
      console.debug("[ContentHiddenToggleOn] contentHidden set to true");
    }

    contentHiddenToggleOff() {
      if (this.treeNode.isLeaf) {
        const parent = this.treeNode.parentNode;
        const parentCollapsed = parent?.isCollapsed ?? false;

        console.debug("[ContentHiddenToggleOff]", this.treeNode.name, "| isLeaf:", true, "| hasParent:", !!parent, "| parent.isCollapsed:", parentCollapsed);

        if (!parent || !parentCollapsed) {
          this.treeNode.isCollapsed = false;
          console.debug("[ContentHiddenToggleOff] → Expanding leaf node:", this.treeNode.name);
        } else {
          console.debug("[ContentHiddenToggleOff] → Keeping leaf node collapsed due to collapsed parent:", this.treeNode.name);
        }
      }

      this.treeNodeViewChildren.forEach(child => child.contentHiddenToggleOff());
      TreeNodeView.contentHidden = false;

      this.updateCollapsedState();
      console.debug("[ContentHiddenToggleOff] contentHidden set to false");
    }

    // isLeaf(): boolean {
    //     const childrenContainer = this.treeItem.querySelector(".tree-item-children");
    //     return !childrenContainer || childrenContainer.querySelectorAll(":scope > .tree-item").length === 0;
    // } 

    toggle() {
        const matchBlock = this.treeItem.querySelector(".search-result-file-matches") as HTMLElement | null;
        const childrenContainer = this.treeItem.querySelector(".tree-item-children");

        console.debug("[Toggle] isCollapsed (before toggle):", this.treeNode.isCollapsed);

        this.treeNode.isCollapsed = !this.treeNode.isCollapsed;

        this.treeItemSelf.toggleClass("is-collapsed", this.treeNode.isCollapsed);
        this.treeItemIcon.toggleClass("is-collapsed", this.treeNode.isCollapsed);
        console.debug("[Toggle] isLeaf:", this.treeNode.isLeaf);
        console.debug("[Toggle] matchBlock:", matchBlock);
        console.debug("[Toggle] childrenContainer:", childrenContainer);
        console.debug("[Toggle] isCollapsed (after toggle):", this.treeNode.isCollapsed);

        if (matchBlock) {
          // Only show matchBlock when node is a leaf or contentHidden is false
          if (!this.treeNode.isCollapsed) {
            if (this.treeNode.isLeaf || !TreeNodeView.contentHidden) {
              matchBlock.style.display = "block";
              matchBlock.removeClass("is-hidden");
            }
          } else {
            matchBlock.style.display = "none";
            matchBlock.addClass("is-hidden");
          }
        }

        if (childrenContainer) {
          (childrenContainer as HTMLElement).style.display = this.treeNode.isCollapsed ? "none" : "block";
        }
    }

    updateCollapsedState() {
        const isCollapsed = this.treeNode.isCollapsed;
      
        this.treeItemSelf.toggleClass("is-collapsed", isCollapsed);
        this.treeItemIcon.toggleClass("is-collapsed", isCollapsed);
      
        if (this.childrenContainer) {
          this.childrenContainer.style.display = isCollapsed ? "none" : "block";
        }
      
        if (this.matchBlock) {
          this.matchBlock.style.display = isCollapsed ? "none" : "block";
          this.matchBlock.toggleClass("is-hidden", isCollapsed);
        }
      
        this.treeNodeViewChildren.forEach(child => child.updateCollapsedState());
      }

}
