import { App, setIcon } from "obsidian";
import { SearchResultFileMatchView } from "./searchResultFileMatchView";
import { ContentReference, TreeNode } from "./types";

export class TreeNodeView{
    private app: App;
    private isCollapsed: boolean;
    private parent: HTMLDivElement;
    private treeItem: HTMLDivElement;
    private treeItemSelf: HTMLDivElement;
    private treeItemIcon: HTMLDivElement;
    private treeNode: TreeNode;
    private treeNodeViewChildren: TreeNodeView[];
    constructor(app: App, parent: HTMLDivElement, treeNode: TreeNode) {
        this.app=app;
        this.isCollapsed=false;
        this.parent=parent;
        this.treeNode=treeNode;
        this.treeNodeViewChildren=[];
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

    appendEndNode(parent :HTMLDivElement, treeNode :TreeNode){
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

    appendTreeItemChildren(treeItem:HTMLDivElement, children :TreeNode[]){
        const treeItemChildren=treeItem.createDiv({cls: "tree-item-children"});
        children.forEach((c)=>{ 
            const treeNodeView=new TreeNodeView(this.app, treeItemChildren, c);
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

    appendReferences(parent:HTMLDivElement, item: TreeNode, references :ContentReference[]){
        const searchResultFileMatchView=new SearchResultFileMatchView(this.app, parent, item.content, references);
        searchResultFileMatchView.render();
    }

    toggleOn() {
        const matchBlock = this.treeItem.querySelector(".search-result-file-matches") as HTMLElement | null;
        const childrenContainer = this.treeItem.querySelector(".tree-item-children");

        this.isCollapsed = false;

        this.treeItemSelf.removeClass("is-collapsed");
        this.treeItemIcon.removeClass("is-collapsed");

        if (matchBlock) {
            matchBlock.style.display = "block";
        }
        if (childrenContainer) {
            (childrenContainer as HTMLElement).style.display = "block";
            this.treeNodeViewChildren.forEach(child => child.toggleOn());
        }
    }
    
    toggleOff() {
        const matchBlock = this.treeItem.querySelector(".search-result-file-matches") as HTMLElement | null;
        const childrenContainer = this.treeItem.querySelector(".tree-item-children");
      
        const isLeaf = !childrenContainer || childrenContainer.querySelectorAll(":scope > .tree-item").length === 0;
      
        if (isLeaf && matchBlock) {
          matchBlock.style.display = "none";
        }
      }

    toggle() {
        const matchBlock = this.treeItem.querySelector(".search-result-file-matches") as HTMLElement | null;
        const childrenContainer = this.treeItem.querySelector(".tree-item-children");
      
        this.isCollapsed = !this.isCollapsed;
      
        this.treeItemSelf.toggleClass("is-collapsed", this.isCollapsed);
        this.treeItemIcon.toggleClass("is-collapsed", this.isCollapsed);
      
        if (matchBlock) {
          matchBlock.style.display = this.isCollapsed ? "none" : "block";
        }
        if (childrenContainer) {
          (childrenContainer as HTMLElement).style.display = this.isCollapsed ? "none" : "block";
        }
      }

}
