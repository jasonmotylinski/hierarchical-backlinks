import { ItemView, WorkspaceLeaf } from "obsidian";
import { File } from "./file";
import HierarchicalBacklinksPlugin  from "./main";
import { TreeNodeModel } from "./treeNodeModel";
import { TreeNodeView } from "./treeNodeView";
import { NavButtonsView } from "./nav/navButtonsView";
import { ViewState, NodeViewState } from "./types";
import { parseSearchQuery } from "./search/parse";
import { makePredicate } from "./search/evaluate";
import { Logger } from "./utils/logger";
import { uiState } from "./uiState";
import { SearchBar } from "./nav/searchBar";
import { BacklinksLayout, BacklinksLayoutCallbacks } from "./ui/layout";

const ENABLE_LOG = true; // Set to false to disable logging in this file

export const VIEW_TYPE="hierarchical-backlinks";


export class HierarchicalBacklinksView extends ItemView {
    private plugin :HierarchicalBacklinksPlugin;
    private treeNodeViews: TreeNodeView[]=[];
    private originalHierarchy: TreeNodeModel[] = [];
    private viewState: ViewState | null = null;
    private currentNoteId: string | null = null;
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

async initialize() {
    const container = this.containerEl.children[1] as HTMLElement; // .view-content

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) return;
    const noteId = activeFile.path;
    if (this.currentNoteId !== noteId || !this.viewState) {
      this.currentNoteId = noteId;
      this.viewState = {
        nodeStates: new Map<string, NodeViewState>(),
      };
    }
    const file = new File(this.app, activeFile);
    const hierarchy = await file.getBacklinksHierarchy();
    this.createPane(container, hierarchy);
}

    createPane(container: Element, hierarchy: TreeNodeModel[]) {
        // Delegate all layout/DOM work to BacklinksLayout
        const layout = new BacklinksLayout(this.app);

        // Reset views before rendering
        this.treeNodeViews = [];

        const { treeNodeViews } = layout.mount(container as HTMLDivElement, hierarchy, {
            createTreeNodeView: (containerEl, node) => {
                const v = new TreeNodeView(
                    this.app,
                    containerEl,
                    node,
                    this.viewState!,
                    this.plugin.settings.preserveCollapseState
                );
                this.treeNodeViews.push(v);
                return v;
            },
            onListToggle: (collapsed) => {
                if (collapsed) {
                    this.treeNodeViews.forEach((n) => n.listToggleOn());
                } else {
                    this.treeNodeViews.forEach((n) => n.listToggleOff());
                }
            },
            onContentToggle: (collapsed) => {
                if (collapsed) {
                    this.treeNodeViews.forEach((n) => n.contentHiddenToggleOn());
                } else {
                    this.treeNodeViews.forEach((n) => n.contentHiddenToggleOff());
                }
            },
            onSearchChange: (q) => {
                this.filterBacklinks(q);
            }
        });

        this.treeNodeViews = treeNodeViews;
        this.originalHierarchy = hierarchy;
    }

    private filterBacklinks(query: string) {
        const trimmed = query.trim().toLowerCase();

        if (!this.viewState) {
            // safety: create a default view state if not present
            this.viewState = { nodeStates: new Map<string, NodeViewState>() };
        }
        uiState.query = trimmed;

        // Build search predicate (bare terms target content by default)
        const { clauses } = parseSearchQuery(trimmed, "default");
        const pred = makePredicate(clauses, { defaultKey: "default" });
        

        const ensureState = (path: string): NodeViewState => {
            let s = this.viewState!.nodeStates.get(path);
            if (!s) {
                s = { isCollapsed: false, isVisible: true };
                this.viewState!.nodeStates.set(path, s);
            }
            return s;
        };

        const resetVisibility = (node: TreeNodeModel) => {
            const s = ensureState(node.path);
            s.isVisible = true;
            for (const child of node.children) {
                resetVisibility(child);
            }
        };

        const markVisibility = (node: TreeNodeModel): boolean => {
            // const pathSegments = node.path?.toLowerCase().split("/") ?? [];
            // const pathMatch = pathSegments.some(segment => segment.includes(trimmed));
            // const contentMatch = node.content?.toLowerCase().includes(trimmed) ?? false;
            // const isMatch = node.isLeaf && (pathMatch || contentMatch);
            const isMatch = node.isLeaf && pred(node);
    
            let childrenMatch = false;


            for (const child of node.children) {
                const childMatches = markVisibility(child);
                if (childMatches) childrenMatch = true;
            }
            

            const state = ensureState(node.path);
            state.isVisible = isMatch || childrenMatch;

            Logger.debug(ENABLE_LOG,`[filterTree] node="${node.path}", isLeaf=${node.isLeaf}, isMatch=${isMatch}, childrenMatches=${childrenMatch}`);
            return state.isVisible;

        };

        if (trimmed.length === 0) {
            for (const node of this.originalHierarchy) {
                resetVisibility(node);
            }
        } else {
            for (const node of this.originalHierarchy) {
                markVisibility(node);
            }
        }
    
        console.debug(`[filterBacklinks] Query: "${trimmed}"`);

        // Update visibility of treeNodeViews in-place
        for (const treeNodeView of this.treeNodeViews) {
            treeNodeView.updateCollapsedState();
        }
    } 

    register_events(){
        this.plugin.registerEvent(this.app.metadataCache.on("changed", () => {
            this.initialize();
        }));

        this.plugin.registerEvent(this.app.workspace.on("layout-change", () => {
            this.initialize();
        }));

		this.plugin.registerEvent(this.app.workspace.on("file-open", () => {
           this.initialize();
        }));

    }

    async onOpen(){
        this.register_events();
        return this.initialize();
    }
}
