import { SearchMatches } from "obsidian";

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
    query: string;
    listCollapsed: boolean;
    contentCollapsed: boolean;
    nodeStates: Map<NodeId, NodeViewState>;
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

export interface BacklinkReference{
	position: Position;
	key: string;
	original: string;
}

export interface PropertyMatch{
	key: string;
	original: string;
	subkey: (string | number)[];
	pos: [number, number]
}

export interface ContentReference {
    content: SearchMatches;
	properties: PropertyMatch [];
	path: string;
}

