import { SearchMatches } from "obsidian";
import { TreeNodeModel } from "./treeNodeModel";
import { TreeNodeView } from "./treeNodeView";

export type NodeId = string; // Node path used as unique identifier

// Implemented in TreeNodeModel
export interface TreeNode {
  path: string;
  title: string;
  content: string;
  references: ContentReference[];
  children: TreeNode[];
  parent: TreeNode | null;
  isLeaf: boolean;
}

export interface NodeViewState {
  isCollapsed: boolean;
  isVisible: boolean;
}
export interface ViewState {
  nodeStates: Map<NodeId, NodeViewState>;
}

export interface BacklinksLayoutCallbacks {
  createTreeNodeView: (containerEl: HTMLDivElement, node: TreeNodeModel) => TreeNodeView;
  onListToggle: (collapsed: boolean) => void;
  onContentToggle: (collapsed: boolean) => void;
  onSearchChange: (query: string) => void;
  onSortToggle: (descending: boolean) => void;
  onFlattenToggle: (flattened: boolean) => void;
  initialFlattened: boolean;
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

