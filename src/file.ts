import { App, TFile, SearchMatchPart } from "obsidian";
import { BacklinkReference, ContentReference } from "./types";

export class File {
    app :App;
	file: TFile;

    constructor(app :App, file :TFile){
        this.app=app;
		this.file=file;
    }

     
    getBacklinks(){
        // @ts-ignore - getBacklinksForFile is available in the JS API, not TS for some reason. Function does exist on MetadataCache 
        const backlinks = this.app.metadataCache.getBacklinksForFile(this.file); 
        backlinks.data.delete(this.file.path);
        return backlinks;
    }
    
    async getBacklinksHierarchy(){

        const result :any[] = [];
        const level = {result};
        const backlinks=this.getBacklinks();

        for (const [path, backlinkReferences] of backlinks.data.entries()) {
            const parts=path.split('/');
            const file = this.app.vault.getFileByPath(path);
            if(file){
                const cached=this.app.vault.cachedRead(file);
                const content=(await cached);
                const references=(await this.getReferences(path, (backlinkReferences as BacklinkReference[])));
                parts.reduce((r :any, name :string, i :any, a :any) => {
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

    async getReferences(path :string, backlinkReferences: BacklinkReference[]){
        const references:ContentReference[]=[];
        const reference=<ContentReference>({path:path, content:[], properties:[]});

        backlinkReferences.forEach((p) => {
            if(p.position){
				// match exists in content of file
                const searchMatchPart: SearchMatchPart = [p.position.start.offset, p.position.end.offset];
                reference.content.push(searchMatchPart);
            }
            else{
				// match exists in frontmatter
                const parts = p.key.split(".");
                const key = parts[0];
                const y = parts.slice(1);
                var b = [];

                if (y) {
                    b = [];
                    for (var w = 0, k = y; w < k.length; w++) {
                        var C = k[w]
                            , M = Number(C);
                        b.push(Number.isNaN(M) ? C : M)
                    }
                }
                reference.properties.push({
                    key: key,
                    subkey: b,
					original: p.original,
                    pos: [0, p.original.length]
                })
                
            }
        });
        references.push(reference);
        
  
        return references;
    }
}
