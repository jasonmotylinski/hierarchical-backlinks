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
	position: Position
}

export interface ContentReference {
    searchMatches: SearchMatches;
	path: string;
}

