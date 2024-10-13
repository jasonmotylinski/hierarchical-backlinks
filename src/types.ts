export interface TreeNode {
    name: string;
    count: number;
    children: TreeNode[];
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

export interface ContentReference {
    ranges: Position[];
    contents: string;
}
