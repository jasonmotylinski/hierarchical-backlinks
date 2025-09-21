import { App, TFile, SearchMatchPart, CachedMetadata } from "obsidian";
import { BacklinkReference, ContentReference } from "../types";
import { TreeNode } from "../tree/treeNode";


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
                    node.setTags(this.extractTags(cache));
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

    private extractTags(cache: CachedMetadata | null | undefined): string[] {
        if (!cache) return [];

        const out = new Set<string>();
        const addTag = (value: unknown) => {
            if (value == null) return;
            if (Array.isArray(value)) {
                value.forEach(addTag);
                return;
            }
            let t = String(value).trim();
            if (!t) return;
            if (t.startsWith('#')) t = t.slice(1);
            if (!t) return;
            out.add(t.toLowerCase());
        };

        cache.tags?.forEach(({ tag }) => addTag(tag));

        const fmTags = (cache.frontmatter as any)?.tags;
        if (typeof fmTags === 'string') {
            fmTags
                .split(/[\s,]+/)
                .map((s: string) => s.trim())
                .filter(Boolean)
                .forEach(addTag);
        } else {
            addTag(fmTags);
        }

        return Array.from(out);
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
                const root = parts.shift() ?? "";
                const rawSegments = [...parts];
                const subPath: (string | number)[] = [];
                if (parts.length) {
                    for (const segment of parts) {
                        const numeric = Number(segment);
                        subPath.push(Number.isNaN(numeric) ? segment : numeric);
                    }
                }
                const displaySegments = [root, ...rawSegments];
                if (displaySegments.length > 1 && /^\d+$/.test(displaySegments[displaySegments.length - 1] ?? "")) {
                    displaySegments.pop();
                }
                const displayKey = displaySegments.filter(Boolean).join(".");
                reference.properties.push({
                    key: displayKey,
                    subkey: subPath,
					original: p.original,
                    pos: [0, p.original.length]
                })
                
            }
        });
        references.push(reference);
        
  
        return references;
    }
}
