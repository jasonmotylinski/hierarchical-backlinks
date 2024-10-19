import { App, getIcon } from "obsidian";
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
				return accumulator+=curr.searchMatches.length;
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
        this.treeItemIcon.appendChild(getIcon("right-triangle")!);

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

    toggleOn(){
        this.treeItemSelf.toggleClass("is-collapsed", false);
        this.treeItemIcon.toggleClass("is-collapsed", false);
        if(this.treeItemSelf.nextSibling){
            const nextDiv = this.treeItemSelf.nextSibling as HTMLDivElement;
            nextDiv.style.display="block";
        }

        this.treeNodeViewChildren.forEach((c)=>{c.toggleOn()});
    }
    
    toggleOff(){
        this.treeItemSelf.toggleClass("is-collapsed", true);
        this.treeItemIcon.toggleClass("is-collapsed", true);

        if(this.treeItemSelf.nextSibling){
            const nextDiv = this.treeItemSelf.nextSibling as HTMLDivElement;
            nextDiv.style.display="none";
        }

        this.treeNodeViewChildren.forEach((c)=>{c.toggleOff()});
    }

	toggle(){
        if(this.isCollapsed){
            this.isCollapsed=false;
            this.toggleOff();
        }else{
            this.isCollapsed=true;
            this.toggleOn();
        }
    }

}
