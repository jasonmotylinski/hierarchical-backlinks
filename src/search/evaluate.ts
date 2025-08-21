// src/search/eval.ts
import type { Clause, Term } from "./parse";
import { parseSearchQuery } from "./parse";
import type { TreeNode } from "../treeNode";
import { Logger } from "./../utils/logger";
const ENABLE_LOG_SEARCH = false; // fine-grained toggle for search debug in this file

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

  const _cp = (s: string) =>
    Array.from(s).map(ch => ch.codePointAt(0)!.toString(16).padStart(4, "0")).join(" ");

  const _norm = (s: string) => s.normalize("NFKD");

  const lIncludes = (
    hay: string | undefined,
    needle: string | undefined,
    ctx: { nodePath?: string; key: string; phase: string }
  ): boolean => {
    const hay0 = (hay ?? "").toLowerCase();
    const ndl0 = (needle ?? "").toLowerCase();
    const ok = hay0.includes(ndl0);
    try {
      Logger.debug(
        ENABLE_LOG_SEARCH,
        `[includes:${ctx.key}] ${ctx.phase} node="${ctx.nodePath ?? "<n/a>"}" hay.len=${hay0.length} ndl="${ndl0}" → ${ok}`
      );
      if (!ok && ndl0.length > 0) {
        const hayN = _norm(hay0);
        const ndlN = _norm(ndl0);
        const okN = hayN.includes(ndlN);
        const idx = hay0.indexOf(ndl0);
        const idxN = hayN.indexOf(ndlN);
        Logger.debug(
          ENABLE_LOG_SEARCH,
          `[includes:${ctx.key}:diag] node="${ctx.nodePath ?? "<n/a>"}" raw.hay="${hay0}" raw.ndl="${ndl0}" idx=${idx} cp.hay=[${_cp(hay0)}] cp.ndl=[${_cp(ndl0)}]`
        );
        Logger.debug(
          ENABLE_LOG_SEARCH,
          `[includes:${ctx.key}:norm] hayN.includes(ndlN) → ${okN} | hayN.len=${hayN.length} ndlN="${ndlN}" idxN=${idxN}`
        );
        const haySan = hayN.replace(/[\u00AD\u2010-\u2015_]/g, "-");
        const ndlSan = ndlN.replace(/[\u00AD\u2010-\u2015_]/g, "-");
        const okSan = haySan.includes(ndlSan);
        Logger.debug(
          ENABLE_LOG_SEARCH,
          `[includes:${ctx.key}:san] includes after dash/_ normalize → ${okSan} | haySan="${haySan}" ndlSan="${ndlSan}"`
        );
      }
    } catch {}
    return ok;
  };

  const valueToStrings = (v: unknown): string[] => {
    if (v == null) return [];
    if (Array.isArray(v)) return v.flatMap(valueToStrings);
    if (typeof v === "object") return [JSON.stringify(v)];
    return [String(v)];
  };

  const displayTitle = (n: TreeNode): string => {
    const t = (n as any).title as string | undefined;
    const p = String((n as any).path ?? "");
    const base = p.split("/").pop() ?? "";
    const fallback = base.replace(/\.[^./]+$/, "");
    try {
      Logger.debug(
        ENABLE_LOG_SEARCH,
        `[displayTitle] node="${(n as any).path ?? "<none>"}" fmTitle="${t ?? "<none>"}" fmTitle.len=${t ? String(t).length : 0} base="${base}" fallback="${fallback}"`
      );
    } catch {}
    if (t && t.length) return String(t);
    return fallback;
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

  try {
    Logger.debug(ENABLE_LOG_SEARCH, `[makePredicate] clauses=${JSON.stringify(clauses)}`);
  } catch {}

  const testTerm = (node: TreeNode, term: Term): boolean => {
    let key = term.key === "default" ? defKey : term.key;
    let v = term.value;
    try {
      Logger.debug(
        ENABLE_LOG_SEARCH,
        `[testTerm:enter] node="${(node as any).path}", rawKey="${term.key}", rawValue="${term.value}", resolvedKey="${key}", v="${String(v)}"`
      );
    } catch {}

    // Typing guard: if user typed a key and a colon but no value yet (e.g., "title:"),
    // treat this term as neutral so we don't over-filter while typing.
    if (key !== "prop" && (v == null || String(v).trim() === "")) {
      try { Logger.debug(ENABLE_LOG_SEARCH, `[testTerm:neutral] key="${key}" empty value → neutral`); } catch {}
      return true;
    }

    let ok = true;
    switch (key) {
      case "content": 
        ok = lIncludes(node.content, v, { nodePath: (node as any).path, key: "content", phase: "eval" });
        try { Logger.debug(ENABLE_LOG_SEARCH, `[testTerm:content] node="${(node as any).path}", key="content", value="${v}", ok=${ok}`); } catch {}
        break;
      case "title":
      case "file": {
        const dt = displayTitle(node);
        try {
          const p = String((node as any).path ?? "");
          const base = p.split("/").pop() ?? "";
          const fallback = base.replace(/\.[^./]+$/, "");
          Logger.debug(
            ENABLE_LOG_SEARCH,
            `[title-block] node="${(node as any).path}" dt.raw="${dt}" dt.lc="${String(dt).toLowerCase()}" fallback="${fallback}"`
          );
        } catch {}
        try { Logger.debug(ENABLE_LOG_SEARCH, `[testTerm:title/file] node="${(node as any).path}" titleProp="${(node as any).title ?? "<none>"}" displayTitle="${dt}" v="${v}"`); } catch {}
        ok = lIncludes(dt, v, { nodePath: (node as any).path, key: "title/file", phase: "eval" });
        try { Logger.debug(ENABLE_LOG_SEARCH, `[testTerm:title/file] node="${(node as any).path}", key="title/file", value="${v}", ok=${ok}`); } catch {}
        break;
      }
      case "path": {
        ok = lIncludes(node.path, v, { nodePath: (node as any).path, key: "path", phase: "eval" });
        try { Logger.debug(ENABLE_LOG_SEARCH, `[testTerm:path] node="${(node as any).path}" pathProp="${node.path ?? "<none>"}" v="${v}"`); } catch {}
        try { Logger.debug(ENABLE_LOG_SEARCH, `[testTerm:path] node="${(node as any).path}", key="path", value="${v}", ok=${ok}`); } catch {}
        break;
      }
      case "references":
      case "reference":
      case "refs":
      case "ref": {
        // TreeNode.references can be string | string[] | unknown
        // Normalize to an array of lowercase strings, then fuzzy-include
        const refs = valueToStrings((node as any).references ?? []).map(s => s.toLowerCase());
        try { Logger.debug(ENABLE_LOG_SEARCH, `[testTerm:references] node="${(node as any).path}" refs=${JSON.stringify(refs)} v="${v}"`); } catch {}
        ok = refs.some(r => lIncludes(r, v, { nodePath: (node as any).path, key: "references", phase: "eval" }));
        try { Logger.debug(ENABLE_LOG_SEARCH, `[testTerm:references] node="${(node as any).path}", key="references", value="${v}", ok=${ok}`); } catch {}
        break;
      }
      case "tag": {
        const tags = valueToStrings(node.frontmatter?.tags ?? []);
        try { Logger.debug(ENABLE_LOG_SEARCH, `[testTerm:tag] node="${(node as any).path}" tags=${JSON.stringify(tags)} v="${v}"`); } catch {}
        ok = tags.some(t => lIncludes(t, v, { nodePath: (node as any).path, key: "tag", phase: "eval" }));
        try { Logger.debug(ENABLE_LOG_SEARCH, `[testTerm:tag] node="${(node as any).path}", key="tag", value="${v}", ok=${ok}`); } catch {}
        break;
      }
      case "prop": {
        try {
          const obj = JSON.parse(v) as { name: string; expr?: string };
          const name = (obj.name ?? "").toLowerCase().trim();
          const expr = obj.expr?.trim();

          // While typing [] with no name yet → neutral
          if (!name) { ok = true; break; }

          // Case-insensitive frontmatter lookup
          const fm = (node.frontmatter ?? {}) as Record<string, unknown>;
          const fmKey = Object.keys(fm).find(k => k.toLowerCase() === name);
          try { Logger.debug(ENABLE_LOG_SEARCH, `[testTerm:prop] name="${name}", expr="${expr ?? ""}", fmKey="${fmKey ?? "<none>"}"`); } catch {}
          if (!fmKey) { ok = false; break; }

          if (expr && expr.length > 0) {
            ok = evalPropExpr((fm as any)[fmKey], expr);
          } else {
            // [prop] => existence regardless of value
            try { Logger.debug(ENABLE_LOG_SEARCH, `[testTerm:prop] existence match for "${name}"`); } catch {}
            ok = true;
          }
        } catch { ok = false; }
        try { Logger.debug(ENABLE_LOG_SEARCH, `[testTerm:prop] node="${(node as any).path}", key="prop", value="${v}", ok=${ok}`); } catch {}
        break;
      }
      case "default":
        // Obsidian-like behavior for bare terms: match content OR display title (title or basename)
        const matchContent = lIncludes(node.content, v, { nodePath: (node as any).path, key: "default:content", phase: "eval" });
        const dt2 = displayTitle(node);
        const matchTitle = lIncludes(dt2, v, { nodePath: (node as any).path, key: "default:title", phase: "eval" });
        ok = matchContent || matchTitle;
        try { Logger.debug(ENABLE_LOG_SEARCH, `[testTerm:default] node="${(node as any).path}" titleProp="${(node as any).title ?? "<none>"}" displayTitle="${displayTitle(node)}" v="${v}"`); } catch {}
        try { Logger.debug(ENABLE_LOG_SEARCH, `[testTerm:default] node="${(node as any).path}", key="default", value="${v}", ok=${ok}`); } catch {}
        break;
      default: {
        // unknown key -> try direct field on node
        const anyNode: any = node as any;
        ok = lIncludes(String(anyNode[key] ?? ""), v, { nodePath: (node as any).path, key, phase: "eval" });
        try { Logger.debug(ENABLE_LOG_SEARCH, `[testTerm:default-case] node="${(node as any).path}", key="${key}", value="${v}", ok=${ok}`); } catch {}
      }
    }
    try {
      Logger.debug(ENABLE_LOG_SEARCH, `[testTerm:exit] node="${(node as any).path}", key="${key}", ok=${ok}`);
    } catch {}
    try {
      Logger.debug(ENABLE_LOG_SEARCH, `[testTerm:diag] key="${key}" value="${v}" final_ok=${term.neg ? !ok : ok}`);
    } catch {}
    return term.neg ? !ok : ok;
  };

  return (node: TreeNode) => {
    try {
      Logger.debug(ENABLE_LOG_SEARCH, `[predicate:start] clauses=${JSON.stringify(clauses)}, node="${(node as any).path}", evaluating, clauseCount=${clauses.length}`);
    } catch {}

    const result = clauses.length === 0 || clauses.some((clause) => clause.every((t) => testTerm(node, t)));

    try {
      Logger.debug(ENABLE_LOG_SEARCH, `[predicate:end] node="${(node as any).path}", result=${result}, clauseCount=${clauses.length}`);
    } catch {}

    return result;
  };
}