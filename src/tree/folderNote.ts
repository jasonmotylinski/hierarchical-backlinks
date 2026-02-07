import { TreeNode } from "./treeNode";

/**
 * Detects whether a folder node has a single child whose name matches
 * the folder name (a "folder note"). Returns the child if so, otherwise null.
 */
export function getFolderNoteChild(node: TreeNode): TreeNode | null {
    if (node.isLeaf) return null;
    if (node.children.length !== 1) return null;

    const child = node.children[0];
    if (!child.isLeaf) return null;
    if (child.title !== node.title) return null;

    return child;
}
