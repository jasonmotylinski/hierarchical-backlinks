import type { TreeNode, ContentReference } from "./types";

export class TreeNodeModel implements TreeNode {
  path: string;
  title: string;
  content: string;
  children: TreeNodeModel[];
  references: ContentReference[];
  parent: TreeNodeModel | null;
  isLeaf: boolean;
  // Optional: frontmatter properties of the underlying file (from Obsidian metadata cache)
  frontmatter?: Record<string, unknown>;

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

  /** Update frontmatter properties when available. */
  setFrontmatter(fm: Record<string, unknown> | undefined): void {
    if (fm && typeof fm === "object") this.frontmatter = fm;
  }
}