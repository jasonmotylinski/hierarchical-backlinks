import { dbgTR } from "../utils/debug";
import { uiState } from "./uiState";
import type { BacklinksLayoutHandlers } from "../types";
import type { TreeNode } from "../tree/treeNode";
import { TreeNodeView } from "../tree/treeNodeView";

/**
 * Responsible ONLY for rendering the hierarchy into the scroll container.
 * No navbar/search logic here. Pure view for the tree area.
 */
export class TreeRenderer {
    private roots: TreeNode[] = [];
    private rootWrappers: Map<string, HTMLElement> = new Map();

    constructor(private scrollEl: HTMLDivElement) { }

    /**
     * Render the provided hierarchy. Returns the created TreeNodeViews.
     */
    render(hierarchy: TreeNode[], callbacks: BacklinksLayoutHandlers): TreeNodeView[] {
        dbgTR("start len=", hierarchy?.length ?? 0);

        this.roots = hierarchy || [];
        this.scrollEl.empty();

        // Header: "Linked mentions"
        const headerContainer = this.scrollEl.createDiv({ cls: "linked-mentions-header-container" });
        headerContainer.style.marginBottom = "10px";

        const linkedHeader = headerContainer.createDiv({ cls: "tree-item-self" });
        linkedHeader.style.paddingLeft = "0";
        linkedHeader.style.marginLeft = "0";
        const label = linkedHeader.createEl("div", { text: "Linked mentions" });
        label.style.fontWeight = "bold";

        const views: TreeNodeView[] = [];
        this.rootWrappers.clear();

        if (!this.roots.length) {
            this.scrollEl.createDiv({ cls: "search-empty-state", text: "No backlinks found." });
            dbgTR("empty");
        } else {
            for (const node of this.roots) {
                const wrapper = this.scrollEl.createDiv({
                    cls: "hb-root-wrapper",
                    attr: { "data-node-path": node.path },
                }) as HTMLDivElement;

                const view = callbacks.createTreeNodeView(wrapper, node);
                view.render();
                views.push(view);
                this.rootWrappers.set(node.path, wrapper);
            }

            dbgTR("Built child count=", this.scrollEl.childElementCount);
        }

        // If a query already exists (e.g., from previous pane), ask view to filter again
        if (uiState.query && uiState.query.trim().length > 0) {
            callbacks.onSearchChange?.(uiState.query);
        }

        return views;
    }
}