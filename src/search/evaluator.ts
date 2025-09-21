import { dbgEval, DEBUG_FLAGS } from "../utils/debugger";
import type { Clause, Term } from "./parser";
import { parseSearchQuery } from "./parser";
import type { TreeNode } from "../tree/treeNode";

export function makePredicate(clauses: Clause[], opts?: { defaultKey?: string }) {
  const defKey = (opts?.defaultKey ?? "content").toLowerCase();

  const includes = (hay?: string, needle?: string) =>
    (hay ?? "").toLowerCase().includes((needle ?? "").toLowerCase());

  const parseRegexLiteral = (raw: string | undefined): RegExp | null => {
    if (!raw || raw.length < 2 || raw[0] !== "/") return null;

    let flagStart = raw.length;
    while (flagStart > 1 && /[gimsuy]/.test(raw[flagStart - 1])) {
      flagStart--;
    }

    const closing = flagStart - 1;
    if (closing <= 0 || raw[closing] !== "/") return null;

    let backslashes = 0;
    for (let idx = closing - 1; idx >= 1 && raw[idx] === "\\"; idx--) backslashes++;
    if (backslashes % 2 === 1) return null;

    const pattern = raw.slice(1, closing);
    const flags = raw.slice(closing + 1);
    if (!/^[gimsuy]*$/.test(flags)) return null;

    try {
      return new RegExp(pattern, flags);
    } catch {
      return null;
    }
  };

  const _cp = (s: string) =>
    Array.from(s).map(ch => ch.codePointAt(0)!.toString(16).padStart(4, "0")).join(" ");

  const _norm = (s: string) => s.normalize("NFKD");

  const lIncludes = (
    hay: string | undefined,
    needle: string | undefined,
    ctx: { nodePath?: string; key: string; phase: string }
  ): boolean => {
    const hay0 = hay ?? "";
    const ndl0 = needle ?? "";
    const regex = parseRegexLiteral(ndl0);
    if (regex) {
      const result = regex.test(hay0);
      try {
        dbgEval(
          `regex key=${ctx.key} phase=${ctx.phase} node="${ctx.nodePath ?? "<n/a>"}" pattern="${ndl0}" source.len=${hay0.length} → ${result}`
        );
      } catch {}
      return result;
    }

    const hayLower = hay0.toLowerCase();
    const ndlLower = ndl0.toLowerCase();
    const ok = hayLower.includes(ndlLower);
    try {
      dbgEval(`includes key=${ctx.key} phase=${ctx.phase} node="${ctx.nodePath ?? "<n/a>"}" hay.len=${hayLower.length} ndl="${ndlLower}" → ${ok}`);
      if (!ok && ndlLower.length > 0 && DEBUG_FLAGS.eval) {
        const hayN = _norm(hayLower);
        const ndlN = _norm(ndlLower);
        const okN = hayN.includes(ndlN);
        const idx = hayLower.indexOf(ndlLower);
        const idxN = hayN.indexOf(ndlN);
        dbgEval(`includes key=${ctx.key} diag node="${ctx.nodePath ?? "<n/a>"}" raw.hay="${hayLower}" raw.ndl="${ndlLower}" idx=${idx} cp.hay=[${_cp(hayLower)}] cp.ndl=[${_cp(ndlLower)}]`);
        dbgEval(`includes key=${ctx.key} norm hayN.includes(ndlN) → ${okN} | hayN.len=${hayN.length} ndlN="${ndlN}" idxN=${idxN}`);
        const haySan = hayN.replace(/[\u00AD\u2010-\u2015_]/g, "-");
        const ndlSan = ndlN.replace(/[\u00AD\u2010-\u2015_]/g, "-");
        const okSan = haySan.includes(ndlSan);
        dbgEval(`includes key=${ctx.key} san includes after dash/_ normalize → ${okSan} | haySan="${haySan}" ndlSan="${ndlSan}"`);
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
      dbgEval(`displayTitle node="${(n as any).path ?? "<none>"}" fmTitle="${t ?? "<none>"}" fmTitle.len=${t ? String(t).length : 0} base="${base}" fallback="${fallback}"`);
    } catch {}
    if (t && t.length) return String(t);
    return fallback;
  };

  const evalPropExpr = (fmVal: unknown, expr: string): boolean => {
    const { clauses: propClauses } = parseSearchQuery(expr, "default");
    const values = valueToStrings(fmVal);
    if (values.length === 0) return false;

    const testTermAgainstValue = (term: Term, s: string): boolean => {
      const v = term.value; // already raw; do case-insensitive compare here
      const regex = parseRegexLiteral(v);
      if (regex) return regex.test(s);
      return includes(s, v);
    };

    // OR over clauses, AND within clause; any value can satisfy a clause
    return propClauses.some((clause) =>
      values.some((s) => clause.every((t) => (t.neg ? !testTermAgainstValue(t, s) : testTermAgainstValue(t, s))))
    );
  };

  try {
    dbgEval(`makePredicate clauses=${JSON.stringify(clauses)}`);
  } catch {}

  const testTerm = (node: TreeNode, term: Term): boolean => {
    let key = term.key === "default" ? defKey : term.key;
    let v = term.value;
    try {
      dbgEval(`testTerm enter node="${(node as any).path}" rawKey="${term.key}" rawValue="${term.value}" resolvedKey="${key}" v="${String(v)}"`);
    } catch {}

    // Typing guard: if user typed a key and a colon but no value yet (e.g., "title:"),
    // treat this term as neutral so we don't over-filter while typing.
    if (key !== "prop" && (v == null || String(v).trim() === "")) {
      try { dbgEval(`testTerm neutral key="${key}" empty value → neutral`); } catch {}
      return true;
    }

    let ok = true;
    switch (key) {
      case "content": 
        ok = lIncludes(node.content, v, { nodePath: (node as any).path, key: "content", phase: "eval" });
        try { dbgEval(`testTerm content node="${(node as any).path}" key="content" value="${v}" ok=${ok}`); } catch {}
        break;
      case "title":
      case "file": {
        const dt = displayTitle(node);
        try {
          const p = String((node as any).path ?? "");
          const base = p.split("/").pop() ?? "";
          const fallback = base.replace(/\.[^./]+$/, "");
          dbgEval(`title-block node="${(node as any).path}" dt.raw="${dt}" dt.lc="${String(dt).toLowerCase()}" fallback="${fallback}"`);
        } catch {}
        try { dbgEval(`testTerm title/file node="${(node as any).path}" titleProp="${(node as any).title ?? "<none>"}" displayTitle="${dt}" v="${v}"`); } catch {}
        ok = lIncludes(dt, v, { nodePath: (node as any).path, key: "title/file", phase: "eval" });
        try { dbgEval(`testTerm title/file node="${(node as any).path}" key="title/file" value="${v}" ok=${ok}`); } catch {}
        break;
      }
      case "path": {
        ok = lIncludes(node.path, v, { nodePath: (node as any).path, key: "path", phase: "eval" });
        try { dbgEval(`testTerm path node="${(node as any).path}" pathProp="${node.path ?? "<none>"}" v="${v}"`); } catch {}
        try { dbgEval(`testTerm path node="${(node as any).path}" key="path" value="${v}" ok=${ok}`); } catch {}
        break;
      }
      case "references":
      case "reference":
      case "refs":
      case "ref": {
        // TreeNode.references can be string | string[] | unknown
        const refs = valueToStrings((node as any).references ?? []);
        try { dbgEval(`testTerm references node="${(node as any).path}" refs=${JSON.stringify(refs)} v="${v}"`); } catch {}
        ok = refs.some(r => lIncludes(r, v, { nodePath: (node as any).path, key: "references", phase: "eval" }));
        try { dbgEval(`testTerm references node="${(node as any).path}" key="references" value="${v}" ok=${ok}`); } catch {}
        break;
      }
      case "tag": {
        const tags = (((node as any).tags as string[] | undefined) ?? []).map(t => t.toLowerCase());
        const rawQuery = typeof v === "string" ? v : String(v ?? "");
        const regex = parseRegexLiteral(rawQuery);
        if (regex) {
          ok = tags.some(t => regex.test(t) || regex.test(`#${t}`));
        } else {
          const query = rawQuery.replace(/^#/, "").trim().toLowerCase();
          try {
            dbgEval(`testTerm tag node="${(node as any).path}" tags=${JSON.stringify(tags)} rawQuery="${rawQuery}" normalizedQuery="${query}"`);
          } catch {}
          if (!query) {
            ok = true;
          } else {
            ok = tags.some((t) => t === query || t.startsWith(`${query}/`));
          }
        }
        try { dbgEval(`testTerm tag node="${(node as any).path}" key="tag" value="${v}" ok=${ok}`); } catch {}
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
          try { dbgEval(`testTerm prop name="${name}" expr="${expr ?? ""}" fmKey="${fmKey ?? "<none>"}"`); } catch {}
          if (!fmKey) { ok = false; break; }

          if (expr && expr.length > 0) {
            ok = evalPropExpr((fm as any)[fmKey], expr);
          } else {
            // [prop] => existence regardless of value
            try { dbgEval(`testTerm prop existence match for "${name}"`); } catch {}
            ok = true;
          }
        } catch { ok = false; }
        try { dbgEval(`testTerm prop node="${(node as any).path}" key="prop" value="${v}" ok=${ok}`); } catch {}
        break;
      }
      case "default":
        // Obsidian-like behavior for bare terms: match content OR display title (title or basename)
        const matchContent = lIncludes(node.content, v, { nodePath: (node as any).path, key: "default:content", phase: "eval" });
        const dt2 = displayTitle(node);
        const matchTitle = lIncludes(dt2, v, { nodePath: (node as any).path, key: "default:title", phase: "eval" });
        ok = matchContent || matchTitle;
        try { dbgEval(`testTerm default node="${(node as any).path}" titleProp="${(node as any).title ?? "<none>"}" displayTitle="${displayTitle(node)}" v="${v}"`); } catch {}
        try { dbgEval(`testTerm default node="${(node as any).path}" key="default" value="${v}" ok=${ok}`); } catch {}
        break;
      default: {
        // unknown key -> try direct field on node
        const anyNode: any = node as any;
        ok = lIncludes(String(anyNode[key] ?? ""), v, { nodePath: (node as any).path, key, phase: "eval" });
        try { dbgEval(`testTerm default-case node="${(node as any).path}" key="${key}" value="${v}" ok=${ok}`); } catch {}
      }
    }
    try {
      dbgEval(`testTerm exit node="${(node as any).path}" key="${key}" ok=${ok}`);
    } catch {}
    try {
      dbgEval(`testTerm diag key="${key}" value="${v}" final_ok=${term.neg ? !ok : ok}`);
    } catch {}
    return term.neg ? !ok : ok;
  };

  return (node: TreeNode) => {
    try {
      dbgEval(`predicate start clauses=${JSON.stringify(clauses)} node="${(node as any).path}" evaluating clauseCount=${clauses.length}`);
    } catch {}

    const result = clauses.length === 0 || clauses.some((clause) => clause.every((t) => testTerm(node, t)));

    try {
      dbgEval(`predicate end node="${(node as any).path}" result=${result} clauseCount=${clauses.length}`);
    } catch {}

    return result;
  };
}
