import { SearchMatches } from "obsidian";
import { TreeNode } from "./tree/treeNode";
import { TreeNodeView } from "./tree/treeNodeView";

export interface HierarchicalBacklinksSettings {
  toggleLeafNodes: boolean;
  boldFileNames: boolean;
  useFrontmatterTitle: boolean;
  frontmatterTitleProperty: string;
  hideFolderNote: boolean;
}

export type NodeId = string; // Node path used as unique identifier

// Implemented in TreeNode
export interface TreeNodeData {
  path: string;
  title: string;
  content: string;
  references: ContentReference[];
  children: TreeNode[];
  parent: TreeNode | null;
  isLeaf: boolean;
  tags?: string[];
}

export interface NodeViewState {
  isCollapsed: boolean;
  isVisible: boolean;
  
}
export interface ViewState {
  nodeStates: Map<NodeId, NodeViewState>;
  isLocked: boolean;
}

export interface BacklinksLayoutHandlers {
  createTreeNodeView: (containerEl: HTMLDivElement, node: TreeNode) => TreeNodeView;
  onListToggle: (collapsed: boolean) => void;
  onContentToggle: (collapsed: boolean) => void;
  onSearchChange: (query: string) => void;
  onSortToggle: (descending: boolean) => void;
  onFlattenToggle: (flattened: boolean) => void;
  onLockToggle: (locked: boolean) => void;
  onSearchToggle?: (show: boolean) => void;
  initialFlattened: boolean;
  initialLocked: boolean;
}

export interface Point {
  line: number,
  col: number,
  offset: number,
}

export interface Position {
  start: Point,
  end: Point
}

export interface BacklinkReference {
  position: Position;
  key: string;
  original: string;
}

export interface PropertyMatch {
  key: string;
  original: string;
  subkey: (string | number)[];
  pos: [number, number]
}

export interface ContentReference {
  content: SearchMatches;
  properties: PropertyMatch[];
  path: string;
}

// === Lock snapshot types ===
export type LockedTreeSnapshot = {
  hierarchy: TreeNode[];    // the frozen structure
  viewState: ViewState;     // per-node collapse/visibility
};
