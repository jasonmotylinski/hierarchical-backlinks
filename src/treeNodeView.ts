import { App, setIcon } from "obsidian";
import { SearchResultFileMatchView } from "./searchResultFileMatchView";
import { ContentReference, TreeNode } from "./types";

export class TreeNodeView{
    private app: App;
    private isCollapsed: boolean;
    private static contentHidden: boolean = true;
    private parent: HTMLDivElement;
    private treeItem: HTMLDivElement;
    private treeItemSelf: HTMLDivElement;
    private treeItemIcon: HTMLDivElement;
    private treeNode: TreeNode;
    private treeNodeViewChildren: TreeNodeView[];
    private hasUserToggled: boolean = false;
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
            this.hasUserToggled = true;
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

    listToggleOff() {
        console.debug("LIST TOGGLE OFF START");

        this.treeItemSelf.removeClass("is-collapsed");
        this.treeItemIcon.removeClass("is-collapsed");

        const childrenContainer = this.treeItem.querySelector(".tree-item-children") as HTMLElement | null;
        if (childrenContainer) {
            childrenContainer.style.display = "block";
        }

        const matchBlock = this.treeItem.querySelector(".search-result-file-matches") as HTMLElement | null;
        if (matchBlock && !TreeNodeView.contentHidden) {
            matchBlock.style.display = "block";
            matchBlock.removeClass("is-hidden");
        }

        this.treeNodeViewChildren.forEach(child => child.listToggleOff());

        if (TreeNodeView.contentHidden && this.isLeaf()) {
            this.treeItemIcon.addClass("is-collapsed");
        }

        console.debug("list OFF");
    }
    
    listToggleOn() {

        this.treeItemSelf.addClass("is-collapsed");
        this.treeItemIcon.addClass("is-collapsed");

        const childrenContainer = this.treeItem.querySelector(".tree-item-children") as HTMLElement | null;
        if (childrenContainer) {
            childrenContainer.style.display = "none";
        }

        const matchBlock = this.treeItem.querySelector(".search-result-file-matches") as HTMLElement | null;
        if (matchBlock) {
            matchBlock.style.display = "none";
            matchBlock.addClass("is-hidden");
        }

        this.treeNodeViewChildren.forEach((c) => {
            c.listToggleOn();
        });
        console.debug("list ON");
    }

    contentHiddenToggleOff() {
        this.hasUserToggled = false;
        const matchBlock = this.treeItem.querySelector(".search-result-file-matches") as HTMLElement | null;
        const childrenContainer = this.treeItem.querySelector(".tree-item-children") as HTMLElement | null;

        // Only operate if this tree item is visible (its parent is not collapsed)
        if (this.treeItem.offsetParent === null) return;

        if (this.isLeaf() && !this.hasUserToggled) {
            this.treeItemSelf.removeClass("is-collapsed");
            this.treeItemIcon.removeClass("is-collapsed");
            if (matchBlock) {
                matchBlock.style.display = "block";
                matchBlock.removeClass("is-hidden");
            }
        }

        if (childrenContainer && childrenContainer.offsetParent !== null) {
            childrenContainer.style.display = "block";
            this.treeNodeViewChildren.forEach(child => child.contentHiddenToggleOff());
        }

        TreeNodeView.contentHidden = false;
        console.debug("content hidden OFF");
        console.debug("contentHidden: ", TreeNodeView.contentHidden);
    }
    
    contentHiddenToggleOn() {
        this.hasUserToggled = false;
        const matchBlock = this.treeItem.querySelector(".search-result-file-matches") as HTMLElement | null;
        const childrenContainer = this.treeItem.querySelector(".tree-item-children");
        const isLeaf = this.isLeaf();

        if (isLeaf && !this.hasUserToggled) {
            if (matchBlock) matchBlock.style.display = "none";
            this.treeItemSelf.addClass("is-collapsed");
            this.treeItemIcon.addClass("is-collapsed");
        } else {
            this.treeNodeViewChildren.forEach(child => child.contentHiddenToggleOn());

            const allChildrenCollapsed = this.treeNodeViewChildren.length > 0 &&
                this.treeNodeViewChildren.every(child => child.isLeaf());

            if (allChildrenCollapsed) {
                this.treeItemSelf.addClass("is-collapsed");
                this.treeItemIcon.addClass("is-collapsed");
            }
        }

        TreeNodeView.contentHidden = true;
        console.debug("content hidden ON");
        console.debug("contentHidden: ", TreeNodeView.contentHidden);
    }

    isLeaf(): boolean {
        const childrenContainer = this.treeItem.querySelector(".tree-item-children");
        return !childrenContainer || childrenContainer.querySelectorAll(":scope > .tree-item").length === 0;
    }

    toggle() {
        const matchBlock = this.treeItem.querySelector(".search-result-file-matches") as HTMLElement | null;
        const childrenContainer = this.treeItem.querySelector(".tree-item-children");

        console.debug("[Toggle] isCollapsed (before toggle):", this.isCollapsed);
        this.hasUserToggled = true;
        this.isCollapsed = !this.isCollapsed;

        this.treeItemSelf.toggleClass("is-collapsed", this.isCollapsed);
        this.treeItemIcon.toggleClass("is-collapsed", this.isCollapsed);
        console.debug("[Toggle] isLeaf:", this.isLeaf());
        console.debug("[Toggle] matchBlock:", matchBlock);
        console.debug("[Toggle] childrenContainer:", childrenContainer);
        console.debug("[Toggle] isCollapsed (after toggle):", this.isCollapsed);

        if (matchBlock) {
          // Only show matchBlock when node is a leaf or contentHidden is false
          if (!this.isCollapsed) {
            if (this.isLeaf() || !TreeNodeView.contentHidden) {
              matchBlock.style.display = "block";
              matchBlock.removeClass("is-hidden");
            }
          } else {
            matchBlock.style.display = "none";
            matchBlock.addClass("is-hidden");
          }
        }

        if (childrenContainer) {
          (childrenContainer as HTMLElement).style.display = this.isCollapsed ? "none" : "block";
        }
    }

    resetUserToggles() {
        this.hasUserToggled = false;
        this.treeNodeViewChildren.forEach(child => child.resetUserToggles());
    }

}
