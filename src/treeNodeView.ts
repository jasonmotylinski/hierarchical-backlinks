import { App, getIcon } from "obsidian";
import { SearchResultFileMatchView } from "./searchResultFileMatchView";
import { ContentReference, TreeNode } from "./types";

export class TreeNodeView {
	private app: App;
    constructor(app: App) {
		this.app=app;
	}

	render(parent: HTMLDivElement,  treeNode :TreeNode){
		const treeItem=parent.createDiv({cls: "tree-item"});
        const treeItemSelf=treeItem.createDiv({cls: "tree-item-self is-clickable backlink-item"});

        const treeItemIcon=this.appendEndNode(treeItemSelf, treeNode);

        const treeItemFlair=treeItemSelf.createDiv({cls:"tree-item-flair-outer"}).createEl("span",{cls: "tree-item-flair"});
        if(treeNode.children.length > 0){
            this.appendTreeItemChildren(treeItem, treeNode.children);
            
        }else{
			const total=treeNode.references.reduce((accumulator: number,curr)=>{
				return accumulator+=curr.searchMatches.length;
			}, 0);
			treeItemFlair.setText(total.toString());
            this.appendReferences(treeItem, treeNode, treeNode.references);
        }

        treeItemSelf.addEventListener("click", (e)=>{ 
            // We are dealing with a branch node so collapse/uncollapse

            this.toggleBranch(treeNode, treeItem, treeItemSelf, treeItemIcon);
        });
	}

	appendEndNode(treeItemSelf :HTMLDivElement, item :TreeNode){
        const treeItemIcon=treeItemSelf.createDiv({cls: "tree-item-icon collapse-icon"});

        let name = item.name;
        if(item.children && item.children.length == 0){
            const firstLink=this.app.metadataCache.getFirstLinkpathDest(item.name, '');
            
            if(firstLink){
                name=firstLink.basename;
            }
        }

        treeItemSelf.createDiv({cls: "tree-item-inner", text: name});
        treeItemIcon.appendChild(getIcon("right-triangle")!);
        return treeItemIcon;
    }

	appendTreeItemChildren(treeItem:HTMLDivElement, children :TreeNode[]){
        const treeItemChildren=treeItem.createDiv({cls: "tree-item-children"});
        children.forEach((c)=>{ 
            this.render(treeItemChildren, c);
        });
    }

	appendReferences(parent:HTMLDivElement, item: TreeNode, references :ContentReference[]){
        const searchResultFileMatchView= new SearchResultFileMatchView(parent, item.content, references);
		searchResultFileMatchView.render();
    }

	toggleBranch(item :TreeNode, treeItem: HTMLDivElement, treeItemSelf :HTMLDivElement, treeItemIcon :HTMLDivElement){
        treeItemSelf.toggleClass("is-collapsed", !treeItemSelf.hasClass("is-collapsed"));
        treeItemIcon.toggleClass("is-collapsed", !treeItemIcon.hasClass("is-collapsed"));
        if(treeItemSelf.hasClass("is-collapsed")){
            treeItemSelf.nextSibling!.remove();
        }
        else{
            const treeItemChildren=treeItem.createDiv({cls: "tree-item-children"});
            if(item.children.length > 0){
                this.appendTreeItemChildren(treeItemChildren, item.children);
                
            }else{
                this.appendReferences(treeItemChildren, item, item.references);
            }
    
        }
    }

}
