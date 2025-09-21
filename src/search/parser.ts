// src/search/parse.ts
export type Term = { key: string; value: string; neg?: boolean };
export type Clause = Term[];          // AND of terms
export type ParseResult = { clauses: Clause[] };

/**
 * Parser supporting:
 * - key:value
 * - "exact phrase" (with escaped quotes \" inside)
 * - bare words
 * - negation via leading '-'
 * - OR operator (case-insensitive)
 * - parentheses for precedence
 * - property queries: [prop] or [prop: value-expression]
 *   where value-expression itself can contain parentheses, OR, quotes, regex, etc.
 */
export function parseSearchQuery(input: string, defaultKey = "default"): ParseResult {
  type Tok =
    | { t: "TERM"; key: string; value: string; neg: boolean }
    | { t: "OR" }
    | { t: "LP" }
    | { t: "RP" };

  const tokens: Tok[] = [];
  let i = 0;
  const n = input.length;

  const isWS = (c: string) => /\s/.test(c);
  const peek = () => input[i];
  const next = () => input[i++];

  const readQuoted = (): string => {
    const start = i;
    if (peek() !== '"') {
      throw new Error(`parseSearchQuery: expected opening quote at index ${i}`);
    }
    i++; // skip opening quote

    let out = "";
    let closed = false;
    while (i < n) {
      const c = next();
      if (c === '\\') {
        if (i < n) {
          out += next();
        }
      } else if (c === '"') {
        closed = true;
        break;
      } else {
        out += c;
      }
    }

    if (!closed) {
      throw new Error(`parseSearchQuery: unterminated quote starting at index ${start}`);
    }

    return out;
  };

  const readWord = (): string => {
    let out = "";
    while (i < n) {
      const c = peek();
      if (isWS(c) || c === '(' || c === ')' || c === '[' || c === ']') break;
      out += next();
    }
    return out;
  };

  const readUntilMatchingBracket = (): string => {
    const start = i;
    if (peek() !== '[') {
      throw new Error(`parseSearchQuery: expected '[' at index ${i}`);
    }

    let out = "";
    i++; // skip initial '['
    let depth = 1;

    while (i < n) {
      const c = peek();

      if (c === '"') {
        out += '"' + readQuoted() + '"';
        continue;
      }

      if (c === '[') {
        depth++;
        out += next();
        continue;
      }

      if (c === ']') {
        next();
        depth--;
        if (depth === 0) {
          return out.trim();
        }
        out += ']';
        continue;
      }

      out += next();
    }

    throw new Error(`parseSearchQuery: unterminated '[' starting at index ${start}`);
  };

  const pushTerm = (key: string, value: string, neg: boolean) => {
    tokens.push({ t: "TERM", key, value, neg });
  };

  while (i < n) {
    // skip whitespace
    while (i < n && isWS(peek())) i++;
    if (i >= n) break;

    // negation flag for the next token
    let neg = false;
    if (peek() === '-') { neg = true; i++; while (i < n && isWS(peek())) i++; }
    if (i >= n) break;

    const c = peek();

    // parentheses
    if (c === '(') { i++; tokens.push({ t: "LP" }); continue; }
    if (c === ')') { i++; tokens.push({ t: "RP" }); continue; }

    // property bracket
    if (c === '[') {
      const inner = readUntilMatchingBracket();
      // split on first ':' that is not inside quotes or parentheses
      const { left: prop, right: expr } = splitTopLevelColon(inner);
      if (!expr) {
        pushTerm("prop", JSON.stringify({ name: prop.trim() }), neg);
      } else {
        pushTerm("prop", JSON.stringify({ name: prop.trim(), expr: expr.trim() }), neg);
      }
      continue;
    }

    // quoted phrase as a default-key term
    if (c === '"') {
      const phrase = readQuoted();
      pushTerm(defaultKey, phrase, neg);
      continue;
    }

    // word or key:value (value may be quoted)
    const start = i;
    const word = readWord();
    if (!word) { i++; continue; }

    // OR operator (case-insensitive) only when not negated and stands alone
    if (!neg && /^or$/i.test(word)) { tokens.push({ t: "OR" }); continue; }

    const colon = word.indexOf(':');
    if (colon > 0) {
      const key = word.slice(0, colon).toLowerCase();
      let value = word.slice(colon + 1);
      // if the colon was the last char of what we read (e.g., key:"...") and next char starts a quote, read the quoted value now
      if (!value && peek() === '"') {
        value = readQuoted();
      } else if (value.startsWith('"')) {
        // The quoted value may span multiple words (e.g., title:"daily note").
        let body = value.slice(1);
        const isEscaped = (str: string, idx: number) => {
          let backslashes = 0;
          for (let j = idx - 1; j >= 0 && str[j] === '\\'; j--) backslashes++;
          return backslashes % 2 === 1;
        };
        while (true) {
          const len = body.length;
          if (len > 0 && body[len - 1] === '"' && !isEscaped(body, len - 1)) {
            body = body.slice(0, -1);
            break;
          }
          if (i >= n) break;
          body += next();
        }
        value = body.replace(/\\"/g, '"');
      } else {
        value = stripOuterQuotes(value);
      }
      pushTerm(key, value, neg);
    } else {
      pushTerm(defaultKey, stripOuterQuotes(word), neg);
    }
  }

  // Build AST via shunting-yard: implicit AND, precedence AND > OR
  type Node = { kind: "TERM"; term: Term } | { kind: "AND" | "OR"; left: Node; right: Node };
  const out: Node[] = [];
  const ops: ("AND" | "OR" | "LP")[] = [];
  let prevTermOrRp = false;

  const reduceTop = () => {
    const op = ops.pop() as "AND" | "OR";
    const r = out.pop()!; const l = out.pop()!;
    out.push({ kind: op, left: l, right: r });
  };

  for (const t of tokens) {
    if (t.t === "TERM") {
      if (prevTermOrRp) {
        while (ops.length && ops[ops.length - 1] === "AND") reduceTop();
        ops.push("AND");
      }
      out.push({ kind: "TERM", term: { key: t.key, value: t.value, neg: t.neg } });
      prevTermOrRp = true;
    } else if (t.t === "OR") {
      while (ops.length && ops[ops.length - 1] === "AND") reduceTop();
      while (ops.length && ops[ops.length - 1] === "OR") reduceTop();
      ops.push("OR");
      prevTermOrRp = false;
    } else if (t.t === "LP") {
      if (prevTermOrRp) {
        while (ops.length && ops[ops.length - 1] === "AND") reduceTop();
        ops.push("AND");
      }
      ops.push("LP");
      prevTermOrRp = false;
    } else if (t.t === "RP") {
      while (ops.length && ops[ops.length - 1] !== "LP") reduceTop();
      if (ops[ops.length - 1] === "LP") ops.pop();
      prevTermOrRp = true;
    }
  }
  while (ops.length && ops[ops.length - 1] !== "LP") reduceTop();

  const ast = out.pop();
  return { clauses: ast ? astToDNF(ast) : [[]] };
}

function stripOuterQuotes(s: string): string {
  s = s.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).replace(/\\"/g, '"');
  }
  return s;
}

function splitTopLevelColon(inner: string): { left: string; right?: string } {
  let depth = 0;
  let inQuote = false;
  for (let j = 0; j < inner.length; j++) {
    const c = inner[j];
    if (c === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && c === '(') depth++;
    else if (!inQuote && c === ')') depth--;
    else if (!inQuote && depth === 0 && c === ':') {
      return { left: inner.slice(0, j), right: inner.slice(j + 1) };
    }
  }
  return { left: inner };
}

function astToDNF(node: any): Clause[] {
  if (node.kind === "TERM") return [[node.term]];
  if (node.kind === "AND") {
    const L = astToDNF(node.left), R = astToDNF(node.right);
    const out: Clause[] = [];
    for (const l of L) for (const r of R) out.push([...l, ...r]);
    return out;
  }
  if (node.kind === "OR") return [...astToDNF(node.left), ...astToDNF(node.right)];
  return [[]];
}
