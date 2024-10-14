import { ItemView, SearchMatchPart, WorkspaceLeaf, getIcon, renderMatches } from "obsidian";
import { File } from "./file";
import HierarchicalBacklinksPlugin  from "./main";
import { ContentReference, Point, Position, TreeNode } from "./types";

export const VIEW_TYPE="hierarchical-backlinks-view";


export class HierarchicalBacklinksView extends ItemView {
    private plugin :HierarchicalBacklinksPlugin;

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

    createPane(container :Element, hierarchy :TreeNode[]){
        const pane=container.createDiv({cls: "backlink-pane"});
        this.appendLinks(pane, "Linked mentions", hierarchy);
    }

    appendLinks(pane :HTMLDivElement, headerText :string, links: any[]){
        const linksHeader=pane.createDiv({cls: "tree-item-self is-clickable"});
        linksHeader.createEl("div",{text: headerText});
        pane.appendChild(linksHeader);

        const searchResultsContainer=pane.createDiv({cls: "search-result-container"});
        links.forEach((l) =>{
            this.appendChild(searchResultsContainer, l);
        });
    }

    appendChild(parent :HTMLDivElement, item :TreeNode){
        const treeItem=parent.createDiv({cls: "tree-item"});
        const treeItemSelf=treeItem.createDiv({cls: "tree-item-self is-clickable backlink-item"});

        const treeItemIcon=this.appendEndNode(treeItemSelf, item);

        let text = "";

        treeItemSelf.createDiv({cls:"tree-item-flair-outer"}).createEl("span",{cls: "tree-item-flair", text: text});
        if(item.children.length > 0){
            this.appendTreeItemChildren(treeItem, item.children);
            
        }else{
            this.appendReferences(treeItem, item.references);
        }

        treeItemSelf.addEventListener("click", (e)=>{ 
            // We are dealing with a branch node so collapse/uncollapse
            this.toggleBranch(item, treeItem, treeItemSelf, treeItemIcon);
        });
    }

    appendTreeItemChildren(treeItem:HTMLDivElement, children :TreeNode[]){
        const treeItemChildren=treeItem.createDiv({cls: "tree-item-children"});
        children.forEach((c)=>{ 
            this.appendChild(treeItemChildren, c);
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

    appendReferences(parent:HTMLDivElement, references :ContentReference[]){
        const matchesDiv=parent.createDiv({cls: 'search-result-file-matches'})
        references.forEach((r)=>{
            
            r.searchMatches.forEach((m) => {
                const matchDiv=matchesDiv.createDiv({cls: "search-result-file-match"});

                const p=this.findLineBoundaries(r.contents, m);
                this.highlightMatches(matchDiv, r.contents,p[0],p[1], [m]);
            });
        });
    }

    navigateTo(name :string){
        const firstLink=this.app.metadataCache.getFirstLinkpathDest(name, '');
            
        if(firstLink){
            this.app.workspace.openLinkText(firstLink.name, firstLink.path);
        }
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
                this.appendReferences(treeItemChildren, item.references);
            }
    
        }
    }

    findLineBoundaries(text: string, indices: [number, number], maxDistance: number | undefined) {
        // Set a default value for maxDistance if it's not provided
        if (maxDistance === undefined) maxDistance = 100;
    
        // Search backwards from the starting point (indices[0] - 1) for up to 'maxDistance' characters.
        let leftIndex = indices[0] - 1;  // Start just before the first index
        let leftDistance = 0;  // Track how far we've moved to the left
        
        // Move left until we find a newline or reach the maxDistance limit
        while (leftDistance < maxDistance && leftIndex >= 0) {
            if (text.charAt(leftIndex) === '\n')  // Stop if we hit a newline
                break;
            leftIndex--;  // Move one character to the left
            leftDistance++;  // Increase the distance moved
        }
        leftIndex++;  // Move one step back to the character after the newline (or starting point)
        
        // Track if we've hit the maxDistance on the left side
        const hitMaxLeftDistance = leftDistance === maxDistance;
    
        // Search forwards from the end point (indices[1])
        let rightIndex = indices[1];  // Start at the second index
        let rightDistance = 0;  // Track how far we've moved to the right
        
        // Move right until we find a newline or reach the maxDistance limit
        while (rightDistance < maxDistance && rightIndex < text.length) {
            if (text.charAt(rightIndex) === '\n')  // Stop if we hit a newline
                break;
            rightIndex++;  // Move one character to the right
            rightDistance++;  // Increase the distance moved
        }
        
        // Track if we've hit the maxDistance on the right side
        const hitMaxRightDistance = rightDistance === maxDistance;
        
        // Return the calculated boundaries and whether we hit the distance limit
        return [leftIndex, rightIndex, hitMaxLeftDistance, hitMaxRightDistance];
    }

    highlightMatches(
        e: any, 
        fullText: string, 
        startIndex: number | boolean, 
        endIndex: number | boolean, 
        ranges: SearchMatchPart[]
    ): void {
        // Anonymous function processing ranges
        (function(lowerBound: number, upperBound: number, rangeArray: SearchMatchPart[], callback: (isMatch: boolean, from: number, to: number) => void) {
            let currentPos = lowerBound;
            for (let i = 0; i < rangeArray.length; i++) {
                let range = rangeArray[i];
                let rangeStart = range[0];

                if (rangeStart >= upperBound) break;

                let rangeEnd = range[1];

                if (rangeEnd < lowerBound) continue;

                if (rangeStart < lowerBound) rangeStart = lowerBound;
                if (rangeEnd > upperBound) rangeEnd = upperBound;

                if (rangeStart > currentPos) callback(false, currentPos, rangeStart);
                callback(true, rangeStart, rangeEnd);

                currentPos = rangeEnd;
            }

            if (currentPos < upperBound) callback(false, currentPos, upperBound);

        })(startIndex, endIndex, ranges, function(isMatch: boolean, from: number, to: number): void {
            const textSegment = fullText.substring(from, to);
            if (isMatch) {
                e.createSpan({
                    cls: "search-result-file-matched-text",
                    text: textSegment
                });
            } else {
                e.createSpan({
                    text: textSegment
                });
            }
        });
    }

    register_events(){
        this.plugin.registerEvent(this.app.metadataCache.on("changed", () => {
            this.initialize();
        }));

        this.plugin.registerEvent(this.app.workspace.on("layout-change", () => {
            this.initialize();
        }));

        this.plugin.registerEvent(this.app.workspace.on("active-leaf-change", () => {
            this.initialize();
        }));
    }

    async onOpen(){
        this.register_events();
        return this.initialize();
    }
}