// src/search/eval.ts
import type { Clause, Term } from "./parse";
import { parseSearchQuery } from "./parse";
import type { TreeNodeModel } from "../treeNodeModel";
import { Logger } from "./../utils/logger";
const ENABLE_LOG = true; // Set to false to disable logging in this file 

export function makePredicate(clauses: Clause[], opts?: { defaultKey?: string }) {
  const defKey = (opts?.defaultKey ?? "content").toLowerCase();

  const includes = (hay?: string, needle?: string) =>
    (hay ?? "").toLowerCase().includes((needle ?? "").toLowerCase());

  const testRegex = (s: string, pattern: string): boolean => {
    // Accept /.../ or /.../i
    const m = pattern.match(/^\/(.*)\/(i)?$/);
    if (!m) return includes(s, pattern);
    try { return new RegExp(m[1], m[2] ? "i" : undefined).test(s); } catch { return false; }
  };

  const valueToStrings = (v: unknown): string[] => {
    if (v == null) return [];
    if (Array.isArray(v)) return v.flatMap(valueToStrings);
    if (typeof v === "object") return [JSON.stringify(v)];
    return [String(v)];
  };

  const evalPropExpr = (fmVal: unknown, expr: string): boolean => {
    const { clauses: propClauses } = parseSearchQuery(expr, "default");
    const values = valueToStrings(fmVal).map((s) => s.toLowerCase());
    if (values.length === 0) return false;

    const testTermAgainstValue = (term: Term, s: string): boolean => {
      const v = term.value; // already raw; do case-insensitive compare here
      // regex support if /.../
      if (/^\/.+\/(i)?$/.test(v)) return testRegex(s, v);
      return s.includes(v.toLowerCase());
    };

    // OR over clauses, AND within clause; any value can satisfy a clause
    return propClauses.some((clause) =>
      values.some((s) => clause.every((t) => (t.neg ? !testTermAgainstValue(t, s) : testTermAgainstValue(t, s))))
    );
  };

  const testTerm = (node: TreeNodeModel, term: Term): boolean => {
    const key = term.key === "default" ? defKey : term.key;
    const v = term.value;
    let ok = true;
    switch (key) {
      case "content": ok = includes(node.content, v); break;
      case "file": ok = includes(node.title, v); break;
      case "path": ok = (node.path ?? "").toLowerCase().includes(v.toLowerCase()); 
        Logger.debug(ENABLE_LOG,`[testTerm] path="${node.path}"`, "Checking path:", node.path, "against", v);
        break;
      case "tag": {
        const tags = valueToStrings(node.frontmatter?.tags ?? []);
        ok = tags.some(t => includes(t, v));
        break;
      }
      case "prop": {
        try {
          const obj = JSON.parse(v) as { name: string; expr?: string };
          const fm = node.frontmatter ?? {} as Record<string, unknown>;
          if (!Object.prototype.hasOwnProperty.call(fm, obj.name)) { ok = false; break; }
          if (obj.expr && obj.expr.trim()) ok = evalPropExpr((fm as any)[obj.name], obj.expr);
          else ok = true; // existence only
        } catch { ok = false; }
        break;
      }
      case "default":
        // Obsidian-like behavior for bare terms: match content OR filename
        ok = includes(node.content, v) || includes(node.title, v);
        break;
      default: {
        // unknown key -> try direct field on node
        const anyNode: any = node as any;
        ok = includes(String(anyNode[key] ?? ""), v);
      }
    }
    return term.neg ? !ok : ok;
  };

  return (node: TreeNodeModel) =>
    clauses.length === 0 || clauses.some((clause) => clause.every((t) => testTerm(node, t)));
}