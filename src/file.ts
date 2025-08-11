import { App, TFile, SearchMatchPart } from "obsidian";
import { BacklinkReference, ContentReference } from "./types";
import { TreeNode } from "./treeNode";


export class File {
    app :App;
	file: TFile;

    constructor(app :App, file :TFile){
        this.app=app;
		this.file=file;
    }

    private insertTreeNodesForPath(
        level: Record<string, any>,
        parts: string[],
        file: TFile,
        content: string,
        references: ContentReference[]
    ): void {
        parts.reduce((r: any, name: string, i: number) => {
            if (!r[name]) {
                r[name] = { result: [] };

                const isLast = i === parts.length - 1;
                const node = new TreeNode(
                    name,
                    isLast ? content : "",
                    isLast ? references : [],
                    r[name].result,
                    r.__node ?? null,
                    isLast
                );
                node.isLeaf = isLast;
                node.parent = r.__node ?? undefined;
                node.path = parts.slice(0, i + 1).join('/');

                if (isLast) {
                    const cache = this.app.metadataCache.getFileCache(file);
                    node.setFrontmatter(cache?.frontmatter as unknown as Record<string, unknown> | undefined);
                }

                r.result.push(node);
                r[name].__node = node;
            }
            return r[name];
        }, level);
    }
     
    async getBacklinks(){
        // @ts-ignore - getBacklinksForFile is available in the JS API, not TS for some reason. Function does exist on MetadataCache 
        const backlinks = this.app.metadataCache.getBacklinksForFile(this.file); 
        backlinks.data.delete(this.file.path);
        return backlinks;
    }
    
    async getBacklinksHierarchy(): Promise<TreeNode[]> {
        const result: TreeNode[] = [];
        const level: Record<string, any> = { result };
        const backlinks = await this.getBacklinks();

        for (const [path, backlinkReferences] of backlinks.data.entries()) {
            const file = this.app.vault.getFileByPath(path);
            if (!file) continue;

            const parts = path.split('/');
            const [content, references] = await Promise.all([
                this.app.vault.cachedRead(file),
                this.getReferences(path, backlinkReferences as BacklinkReference[]),
            ]);

            this.insertTreeNodesForPath(level, parts, file, content, references);
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
