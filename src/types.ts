export interface TreeNode {
    name: string;
    count: number;
    children: TreeNode[];
    references: ContentReference[];
}

export interface ContentReference {
    exerpt: string;
}