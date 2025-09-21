import { describe, expect, it } from "vitest";

import { parseSearchQuery } from "../parser";
import { makePredicate } from "../evaluator";
import { TreeNode } from "../../tree/treeNode";

const runQuery = (node: TreeNode, query: string): boolean => {
  const normalized = query.trim().toLowerCase();
  const { clauses } = parseSearchQuery(normalized, "default");
  const predicate = makePredicate(clauses, { defaultKey: "default" });
  return predicate(node);
};

interface NodeOptions {
  path?: string;
  content?: string;
  title?: string;
  tags?: string[];
  frontmatter?: Record<string, unknown>;
  references?: unknown;
}

const makeNode = (options: NodeOptions = {}): TreeNode => {
  const node = new TreeNode(
    options.path ?? "note.md",
    options.content ?? "",
    (options.references as any) ?? [],
    [],
    null,
    true,
  );

  if (options.title) node.title = options.title;
  if (options.path) node.path = options.path;

  node.setFrontmatter(options.frontmatter);
  node.setTags(options.tags);

  if (options.references !== undefined) {
    (node as any).references = options.references;
  }

  return node;
};

describe("search predicate", () => {
  it("treats whitespace as AND and supports negation", () => {
    const node = makeNode({ content: "project alpha update" });
    expect(runQuery(node, "project alpha")).toBe(true);
    expect(runQuery(node, "project -alpha")).toBe(false);
  });

  it("matches quoted phrases", () => {
    const node = makeNode({ content: "exact phrase here" });
    expect(runQuery(node, '"exact phrase"')).toBe(true);
    expect(runQuery(node, '"phrase here"')).toBe(true);
    expect(runQuery(node, '"exact\nphrase"')).toBe(false);
  });

  it("handles OR with parentheses", () => {
    const node = makeNode({ content: "alpha and gamma" });
    expect(runQuery(node, "alpha (beta OR gamma)")).toBe(true);
    expect(runQuery(node, "alpha (beta OR delta)")).toBe(false);
  });

  it("matches bare terms against content and title", () => {
    const contentNode = makeNode({ content: "alpha inside content" });
    const titleNode = makeNode({ title: "Alpha summary" });
    const missNode = makeNode({ content: "beta only" });
    expect(runQuery(contentNode, "alpha")).toBe(true);
    expect(runQuery(titleNode, "alpha")).toBe(true);
    expect(runQuery(missNode, "alpha")).toBe(false);
  });

  it("supports field filters", () => {
    const node = makeNode({
      content: "meeting notes",
      path: "clients/acme/Daily Note.md",
    });
    const normalized = 'title:"daily note"';
    const { clauses } = parseSearchQuery(normalized, "default");
    const predicate = makePredicate(clauses, { defaultKey: "default" });
    expect(runQuery(node, 'content:"meeting"')).toBe(true);
    expect(predicate(node)).toBe(true);
    expect(runQuery(node, 'title:"daily note"')).toBe(true);
    expect(runQuery(node, 'file:"daily note"')).toBe(true);
    expect(runQuery(node, 'path:"clients/acme"')).toBe(true);
    expect(runQuery(node, 'content:"missing"')).toBe(false);
  });

  it("matches references via the references filter", () => {
    const node = makeNode({ references: ["project-plan.md"] });
    expect(runQuery(node, 'references:"project-plan"')).toBe(true);
    expect(runQuery(node, 'references:"another"')).toBe(false);
  });

  it("evaluates tag filters with hierarchy and regex support", () => {
    const hierarchical = makeNode({ tags: ["work", "work/project"] });
    const other = makeNode({ tags: ["myjob/workspace"] });
    expect(runQuery(hierarchical, "tag:#work")).toBe(true);
    expect(runQuery(hierarchical, "tag:#workshop")).toBe(false);
    expect(runQuery(other, "tag:/work/")).toBe(true);
  });

  it("supports regex literals across fields", () => {
    const node = makeNode({ content: "AlphaBeta" });
    expect(runQuery(node, "/alphab/i")).toBe(true);
    expect(runQuery(node, "/alphac/i")).toBe(false);
    expect(runQuery(node, 'content:/^alpha/i')).toBe(true);
  });

  it("treats empty field values as neutral", () => {
    const node = makeNode({ content: "alpha" });
    expect(runQuery(node, "content:")).toBe(true);
  });

  describe("property filters", () => {
    const node = makeNode({
      frontmatter: { status: "Active", tags: ["Client", "Internal"] },
    });

    it("checks for property existence with bracket syntax", () => {
      expect(runQuery(node, "[status]")).toBe(true);
      const withoutStatus = makeNode({ frontmatter: {} });
      expect(runQuery(withoutStatus, "[status]")).toBe(false);
    });

    it("evaluates property expressions with boolean logic", () => {
      expect(runQuery(node, "[status:(active OR pending)]")).toBe(true);
      expect(runQuery(node, "[status:(completed OR pending)]")).toBe(false);
    });

    it("supports regex within property expressions", () => {
      expect(runQuery(node, "[status:/^act/i]")).toBe(true);
      expect(runQuery(node, "[status:/^pend/]")).toBe(false);
      expect(runQuery(node, "[tags:/client/i]")).toBe(true);
    });
  });
});
