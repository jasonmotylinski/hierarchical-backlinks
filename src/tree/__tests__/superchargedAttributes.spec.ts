// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { applySuperchargedAttributes } from "../superchargedAttributes";
import { TreeNode } from "../treeNode";

// Polyfill the Obsidian HTMLElement helpers the decorator uses.
beforeAll(() => {
    const proto = HTMLElement.prototype as any;
    proto.addClass = function (c: string) { this.classList.add(c); };
    proto.setAttr = function (n: string, v: string) { this.setAttribute(n, v); };
});

function node(path: string, frontmatter?: Record<string, unknown>, tags: string[] = []): TreeNode {
    const n = new TreeNode(path, "", [], [], null, true);
    if (frontmatter) n.setFrontmatter(frontmatter);
    n.tags = tags;
    return n;
}

describe("applySuperchargedAttributes (issue #3)", () => {
    it("adds SL icon classes and path/href attributes", () => {
        const el = document.createElement("div");
        applySuperchargedAttributes(el, node("Projects/Alpha.md"));

        expect(el.classList.contains("data-link-icon")).toBe(true);
        expect(el.classList.contains("data-link-icon-after")).toBe(true);
        expect(el.classList.contains("data-link-text")).toBe(true);
        expect(el.getAttribute("data-link-path")).toBe("Projects/Alpha.md");
        expect(el.getAttribute("data-link-data-href")).toBe("Alpha");
    });

    it("maps each frontmatter property to data-link-<prop> and a CSS var", () => {
        const el = document.createElement("div");
        applySuperchargedAttributes(el, node("n.md", { status: "done", priority: 3 }));

        expect(el.getAttribute("data-link-status")).toBe("done");
        expect(el.getAttribute("data-link-priority")).toBe("3");
        expect(el.style.getPropertyValue("--data-link-status")).toBe("done");
    });

    it("hyphenates property names with spaces", () => {
        const el = document.createElement("div");
        applySuperchargedAttributes(el, node("n.md", { "due date": "2026-01-01" }));

        expect(el.getAttribute("data-link-due-date")).toBe("2026-01-01");
    });

    it("joins array values with spaces and skips empty/object values", () => {
        const el = document.createElement("div");
        applySuperchargedAttributes(el, node("n.md", {
            aliases: ["a", "b"],
            empty: null,
            nested: { x: 1 },
        }));

        expect(el.getAttribute("data-link-aliases")).toBe("a b");
        expect(el.hasAttribute("data-link-empty")).toBe(false);
        expect(el.hasAttribute("data-link-nested")).toBe(false);
    });

    it("emits data-link-tags from node.tags and skips frontmatter tag keys", () => {
        const el = document.createElement("div");
        applySuperchargedAttributes(el, node("n.md", { tags: ["ignored-here"], position: { a: 1 } }, ["todo", "project"]));

        expect(el.getAttribute("data-link-tags")).toBe("todo project");
        // `tags` and `position` keys must not become their own attributes
        expect(el.hasAttribute("data-link-position")).toBe(false);
    });
});
