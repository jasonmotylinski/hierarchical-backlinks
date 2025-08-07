import type { TreeNode, ContentReference } from "../types";

export class TreeNodeModel implements TreeNode {
  name: string;
  children: TreeNodeModel[];
  references: ContentReference[];
  content: string;
  isCollapsed: boolean = false;
  parentNode: TreeNodeModel | null = null;

  static contentHidden: boolean = false;

  constructor(
    name: string,
    content: string,
    references: ContentReference[],
    children: TreeNodeModel[] = [],
    parent: TreeNodeModel | null = null
  ) {
    this.name = name;
    this.content = content;
    this.references = references;
    this.children = children;
    this.parentNode = parent;

    for (const child of this.children) {
      child.parentNode = this;
    }
  }

  get isLeaf(): boolean {
    return this.children.length === 0;
  }
}