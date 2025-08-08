import type { TreeNode, ContentReference } from "./types";

export class TreeNodeModel implements TreeNode {
  path: string;
  title: string;
  content: string;
  children: TreeNodeModel[];
  references: ContentReference[];
  parent: TreeNodeModel | null;
  isLeaf: boolean;

  static contentHidden: boolean = false;

  constructor(
    path: string,
    content: string,
    references: ContentReference[],
    children: TreeNodeModel[],
    parent: TreeNodeModel | null,
    isLeaf: boolean,
  ) {
    this.path = path;
    this.title = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
    this.content = content;
    this.children = children;
    this.references = references;
    this.isLeaf = isLeaf;
    this.parent = parent;

    for (const child of this.children) {
      child.parent = this;
    }
  }
}