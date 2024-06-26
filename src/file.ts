import { App, TFile } from "obsidian";
import { ContentReference } from "./types";

export class File {
    app :App;

    constructor(app :App, file :TFile){
        this.app=app;
    }
    getBacklinks(){
        return this.app.metadataCache.getBacklinksForFile(this.app.workspace.getActiveFile());

    }

    async getBacklinksHierarchy(){

        let result :any[] = [];
        let level = {result};
        const backlinks=this.getBacklinks();
        for (const [path, positions] of Object.entries(backlinks.data)) {
            let parts=path.split('/');
            const references=(await this.getReferences(path, positions));
            parts.reduce((r :any, name :string, i, a) => {
                if(!r[name]) {
                    r[name] = {result: []};
                    const refs: ContentReference[] = [];
                    const item={name: name,children: r[name].result, references: refs};
                    if(i==parts.length-1){
                        item.references=references;
                    }
                    r.result.push(item);
                }


    
                return r[name];
            }, level);
            }
        return result;
    
    }

    async getReferences(path :string, positions){
        const references:ContentReference[]=[];
        const file = this.app.vault.getFileByPath(path);
        if(file){
            const cached=this.app.vault.cachedRead(file);
            const contents=(await cached);
            const lines=contents.split("\n");
            
            positions.forEach((r) => {
                references.push({exerpt: lines[r.position.start.line]});
            });
        }
        return references;
    }
}