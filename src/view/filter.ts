import { dbgFilter } from "../utils/debug";
import { TreeNode } from "../tree/treeNode";
import { TreeNodeView } from "../tree/treeNodeView";
import { NodeViewState } from "../types";
import { parseSearchQuery } from "../search/parse";
import { makePredicate } from "../search/evaluate";

export interface FilterAccess {
    roots: TreeNode[];
    treeNodeViews: TreeNodeView[];
    getOrCreateNodeViewState: (nodeId: string) => NodeViewState;
}

export interface FilterOptions {
    enableLog: boolean;
    enableVerbose: boolean;
}

export interface FilterResult {
    changed: number;
    total: number;
    visible: number;
    visibleLeaves: number;
    visibleFolders: number;
}

export function applyFilter(
    access: FilterAccess,
    query: string,
    seq: number,
    opts: FilterOptions
): FilterResult {
    const { roots, treeNodeViews, getOrCreateNodeViewState } = access;

    const trimmed = (query || "").trim().toLowerCase();

    dbgFilter(`filterBacklinks:${seq} ROOTS=${roots.length}`);
    const allPaths: string[] = [];
    const collect = (n: TreeNode) => { allPaths.push(n.path); n.children.forEach(collect); };
    roots.forEach(collect);
    dbgFilter(`filterBacklinks:${seq} VISITABLE nodes=${allPaths.length} sample[0..10]=`, allPaths.slice(0, 10));

    dbgFilter(`filterBacklinks:${seq} BEGIN query="${trimmed}"`);

    // --- helpers local to this module ---
    const takeVisibilitySnapshot = (nodes: TreeNode[]): Map<string, boolean> => {
        const snap = new Map<string, boolean>();
        const walk = (n: TreeNode) => {
            const st = getOrCreateNodeViewState(n.path);
            const vis = st.isVisible !== false; // default true
            snap.set(n.path, vis);
            for (const c of n.children) walk(c);
        };
        for (const r of nodes) walk(r);
        return snap;
    };

    const summarizeVisibility = (nodes: TreeNode[]) => {
        let total = 0, visible = 0, visibleLeaves = 0, visibleFolders = 0;
        const walk = (n: TreeNode) => {
            total++;
            const st = getOrCreateNodeViewState(n.path);
            const vis = st.isVisible !== false; // default true
            if (vis) {
                visible++;
                if (n.isLeaf) visibleLeaves++; else visibleFolders++;
            }
            for (const c of n.children) walk(c);
        };
        for (const r of nodes) walk(r);
        return { total, visible, visibleLeaves, visibleFolders };
    };

    const resetVisibilityForTree = (node: TreeNode): void => {
        const s = getOrCreateNodeViewState(node.path);
        s.isVisible = true;
        for (const child of node.children) {
            resetVisibilityForTree(child);
        }
    };

    const markVisibilityForTree = (
        node: TreeNode,
        pred: (n: TreeNode) => boolean
    ): boolean => {
        const isMatch = node.isLeaf && pred(node);

        const predRaw = pred(node);
        const leafGate = node.isLeaf;
        const finMatch = leafGate && predRaw;
        dbgFilter(`testTerm diag node="${node.path}" leaf=${leafGate} predRaw=${predRaw} finalMatch=${finMatch}`);

        let childrenMatch = false;
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const childVisible = markVisibilityForTree(child, pred);
            dbgFilter(`children visit parent="${node.path}" idx=${i}/${node.children.length - 1} child="${child.path}" -> visible=${childVisible}`);
            childrenMatch = childrenMatch || childVisible;
        }

        const state = getOrCreateNodeViewState(node.path);
        const prevVisible = state.isVisible !== false; // default true if undefined
        const nextVisible = isMatch || childrenMatch;
        state.isVisible = nextVisible;

        dbgFilter(`filterTree node="${node.path}", isLeaf=${node.isLeaf}, isMatch=${isMatch}, childrenMatches=${childrenMatch}, visible ${prevVisible} -> ${nextVisible}`);

        return state.isVisible;
    };

    // --- snapshot before ---
    const before = takeVisibilitySnapshot(roots);

    // Build predicate
    const { clauses } = parseSearchQuery(trimmed, "default");
    const pred = makePredicate(clauses, { defaultKey: "default" });

    if (trimmed.length === 0) {
        for (const node of roots) resetVisibilityForTree(node);
    } else {
        for (const node of roots) markVisibilityForTree(node, pred);
    }

    // --- snapshot after & diff ---
    const after = takeVisibilitySnapshot(roots);
    let changed = 0;
    for (const [path, prev] of before.entries()) {
        const curr = after.get(path);
        if (curr !== prev) changed++;
    }

    const summary = summarizeVisibility(roots);
    dbgFilter(`filterBacklinks:${seq} END query="${trimmed}" | changed=${changed} | total=${summary.total}, visible=${summary.visible} (leaves=${summary.visibleLeaves}, folders=${summary.visibleFolders})`);

    // Push visibility updates to DOM
    for (const v of treeNodeViews) v.applyNodeViewStateToUI();

    return { changed, ...summary };
}