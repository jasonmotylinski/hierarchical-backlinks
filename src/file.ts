import { App, TFile, SearchMatchPart } from "obsidian";
import { ContentReference, Position } from "./types";

export class File {
    app :App;

    constructor(app :App, file :TFile){
        this.app=app;
    }
    getBacklinks(){
        return this.app.metadataCache.getBacklinksForFile(this.app.workspace.getActiveFile());
    }

    async getBacklinksHierarchy(){

        const result :any[] = [];
        const level = {result};
        const backlinks=this.getBacklinks();
        for (const [path, positions] of Object.entries(backlinks.data)) {
            const parts=path.split('/');
            const file = this.app.vault.getFileByPath(path);
            if(file){
                const cached=this.app.vault.cachedRead(file);
                const content=(await cached);
                const references=(await this.getReferences(path, positions));
                parts.reduce((r :any, name :string, i, a) => {
                    if(!r[name]) {
                        r[name] = {result: []};
                        const refs: ContentReference[] = [];
                        const item={name: name,children: r[name].result, content:content, references: refs};
                        if(i==parts.length-1){
                            item.references=references;
                        }
                        r.result.push(item);
                    }
                    return r[name];
                }, level);
            }
        }	
        return result;
    }

    async getReferences(path :string, positions: Position[]){
        const references:ContentReference[]=[];
        const reference=<ContentReference>({searchMatches:[]});

        positions.forEach((p) => {
            const searchMatchPart: SearchMatchPart = [p.position.start.offset, p.position.end.offset];
            reference.searchMatches.push(searchMatchPart);
        });
        references.push(reference);
        
  
        return references;
    }
}
