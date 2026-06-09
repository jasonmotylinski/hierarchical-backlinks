// Supercharged Links interop (issue #3).
//
// The Supercharged Links plugin colors links by reading the destination note's
// frontmatter/tags and writing `data-link-*` attributes (plus matching
// `--data-link-*` CSS variables) onto the link element; users then write CSS
// snippets that target those attributes. Its own Hierarchical Backlinks support
// (SL PR #236) decorates our `.tree-item-inner` rows directly — proving no <a>
// refactor is needed. This module reproduces SL's decoration so the rows are
// styled by the user's existing SL snippets without depending on SL at all.

import { TreeNode } from "./treeNode";

// Frontmatter keys that should never become attributes: Obsidian's internal
// position marker, and tag keys (covered by the merged `data-link-tags` below).
const SKIP_KEYS = new Set(["position", "tag", "tags"]);

// Classes SL adds to every decorated element (used by SL CSS for icon slots).
const SL_CLASSES = ["data-link-icon", "data-link-icon-after", "data-link-text"];

/** Coerce a frontmatter value to a DOM-attribute string, or null to skip it. */
function toAttrValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) {
        const parts = value.filter(v => v !== null && v !== undefined).map(v => String(v));
        return parts.length ? parts.join(" ") : null;
    }
    if (typeof value === "object") return null; // nested objects aren't styleable
    return String(value);
}

/**
 * Apply Supercharged Links-style attributes to `el` from `node`'s metadata.
 * `el` is the row's `.tree-item-inner`, matching the element SL targets.
 */
export function applySuperchargedAttributes(el: HTMLElement, node: TreeNode): void {
    for (const cls of SL_CLASSES) el.addClass(cls);

    const basename = node.path.split("/").pop()?.replace(/\.md$/, "") ?? node.title;
    el.setAttr("data-link-path", node.path);
    el.setAttr("data-link-data-href", basename);

    if (node.tags && node.tags.length > 0) {
        el.setAttr("data-link-tags", node.tags.join(" "));
    }

    if (node.frontmatter) {
        for (const [key, raw] of Object.entries(node.frontmatter)) {
            if (SKIP_KEYS.has(key.toLowerCase())) continue;
            const value = toAttrValue(raw);
            if (value === null) continue;
            const domKey = key.replace(/ /g, "-");
            el.setAttr(`data-link-${domKey}`, value);
            el.style.setProperty(`--data-link-${domKey}`, value);
        }
    }
}
