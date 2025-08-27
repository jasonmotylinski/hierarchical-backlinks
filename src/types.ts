import { SearchMatches } from "obsidian";

export interface TreeNode {
    name: string;
    count: number;
    children: TreeNode[];
	content: string;
    references: ContentReference[];
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

export interface PluginSettings {
    collapseButtonState: boolean | false;
  }
