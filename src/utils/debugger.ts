import { Logger } from "./logger";

/**
 * Central switches for debug scopes.
 * Flip these on/off or expose setters to toggle at runtime.
 */
export const DEBUG_FLAGS = {
  eval: false,
  search: false,
  hb: false,
  sort: false,
  filter: false,
  events: false,
  tnv: false,
  button: false,
  layout: false,
  tr: false,
  hc: false,
  main: false,
  diag: false,
  lockService: false,
};

/**
 * Create a scoped debugger that prefixes messages and is gated by a flag.
 *
 * Usage:
 *   const dbgParse = createDebugger("parse", "[parse]");
 *   dbgParse("tokens", toks);
 */
export function createDebugger<
  K extends keyof typeof DEBUG_FLAGS
>(flag: K, prefix: string) {
  return (...args: any[]) => {
    Logger.debug(DEBUG_FLAGS[flag], prefix, ...args);
  };
}

/**
 * Create a scoped tracer: when the flag is enabled, it opens a console group,
 * prints a stack trace, and closes the group. The label is appended to the
 * prefix for readability.
 */
export function createTracer<
  K extends keyof typeof DEBUG_FLAGS
>(flag: K, prefix: string) {
  return (label: string = "TRACE") => {
    if (!DEBUG_FLAGS[flag]) return;
    try {
      console.group(`${prefix} ${label}`);
      console.trace();
      console.groupEnd();
    } catch {}
  };
}

/**
 * Change flags at runtime if needed.
 * Example: setDebugFlag("parse", false)
 */
export function setDebugFlag<K extends keyof typeof DEBUG_FLAGS>(
  flag: K,
  enabled: boolean,
) {
  DEBUG_FLAGS[flag] = enabled;
}

/**
 * Helper to pretty-print JSON safely.
 */
export function j(obj: unknown, space: number = 2) {
  try {
    return JSON.stringify(obj, null, space);
  } catch {
    return String(obj);
  }
}

/**
 * Convenience: create common scoped debuggers.
 */
export const dbgEval   = createDebugger("eval",   "[evaluate]");
export const dbgSearch = createDebugger("search", "[search]");
export const dbgHB = createDebugger("hb", "[HB]");
export const dbgHBTrace = createTracer("hb", "[HB]");
export const dbgSort = createDebugger("sort", "[sort]");
export const dbgFilter = createDebugger("filter", "[filter]");
export const dbgEvents = createDebugger("events", "[events]");
export const dbgTNV = createDebugger("tnv", "[TNV]");
export const dbgButton = createDebugger("button", "[button]");
export const dbgLayout = createDebugger("layout", "[layout]");
export const dbgTR = createDebugger("tr", "[TR]");
export const dbgHC = createDebugger("hc", "[HC]");
export const dbgMain = createDebugger("main", "[main]");
export const dbgDiag = createDebugger("diag", "[diag]");
export const dbgLS = createDebugger("lockService", "[LockService]");