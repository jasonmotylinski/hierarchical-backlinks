import { describe, expect, it } from "vitest";

import { parseSearchQuery } from "../parser";

const parse = (query: string) => parseSearchQuery(query, "default").clauses;

describe("parseSearchQuery", () => {
  it("treats whitespace as implicit AND", () => {
    const clauses = parse("alpha beta");
    expect(clauses).toEqual([
      [
        { key: "default", value: "alpha", neg: false },
        { key: "default", value: "beta", neg: false },
      ],
    ]);
  });

  it("supports explicit OR with parentheses for precedence", () => {
    const clauses = parse("alpha (beta OR gamma)");
    expect(clauses).toEqual([
      [
        { key: "default", value: "alpha", neg: false },
        { key: "default", value: "beta", neg: false },
      ],
      [
        { key: "default", value: "alpha", neg: false },
        { key: "default", value: "gamma", neg: false },
      ],
    ]);
  });

  it("captures negated terms", () => {
    const clauses = parse("alpha -beta");
    expect(clauses).toEqual([
      [
        { key: "default", value: "alpha", neg: false },
        { key: "default", value: "beta", neg: true },
      ],
    ]);
  });

  it("preserves quoted phrases as single values", () => {
    const clauses = parse('"exact phrase"');
    expect(clauses).toEqual([[{ key: "default", value: "exact phrase", neg: false }]]);
  });

  it("parses bracketed property filters", () => {
    const clauses = parse("[status: active]");
    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toHaveLength(1);
    const term = clauses[0][0];
    expect(term.key).toBe("prop");
    expect(term.neg).toBe(false);
    expect(JSON.parse(term.value)).toEqual({ name: "status", expr: "active" });
  });

  it("parses field-prefixed filters", () => {
    const clauses = parse('title:"daily note"');
    expect(clauses).toEqual([[{ key: "title", value: "daily note", neg: false }]]);
  });

  it("treats bare regex literals as terms", () => {
    const clauses = parse("/foo.*/i");
    expect(clauses).toEqual([[{ key: "default", value: "/foo.*/i", neg: false }]]);
  });
});
