import { TreeNode } from "../tree/treeNode";

/** Deep clone a hierarchy so mutations (sort/flatten) don't affect originals. */
export function cloneHierarchy(nodes: TreeNode[]): TreeNode[] {
    return nodes.map((n) => ({
        ...n,
        // recursively clone children
        children: cloneHierarchy(n.children || []),
        setFrontmatter: n.setFrontmatter, // preserve required method
    }));
}

/** Recursively sort nodes by the leaf name of their path (A→Z or Z→A). */
export function deepSortHierarchy(models: TreeNode[], descending: boolean): void {
    const nameOf = (n: TreeNode) => (n.path?.split("/").pop() ?? "").toLowerCase();
    const cmp = (a: TreeNode, b: TreeNode) =>
        descending ? nameOf(b).localeCompare(nameOf(a)) : nameOf(a).localeCompare(nameOf(b));

    models.sort(cmp);
    for (const m of models) {
        if (Array.isArray(m.children) && m.children.length > 0) {
            deepSortHierarchy(m.children, descending);
        }
    }
}

/**
 * Build a flat list of leaf nodes from a hierarchical tree.
 * Preserves node identity (path) so viewState (isVisible/isCollapsed) continues to apply.
 */
export function buildFlattenedHierarchy(hierarchy: TreeNode[]): TreeNode[] {
    const leaves: TreeNode[] = [];

    const walk = (node: TreeNode) => {
        if (node.isLeaf) {
            // clone the node but drop children to ensure it's rendered as a root leaf
            leaves.push({
                ...node,
                children: [],
                setFrontmatter: node.setFrontmatter, // preserve required method
            });
            return;
        }
        for (const c of node.children) walk(c);
    };

    for (const root of hierarchy) walk(root);
    return leaves;
}