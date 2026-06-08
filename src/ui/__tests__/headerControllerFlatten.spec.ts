// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { HeaderController } from "../headerController";
import { uiState } from "../uiState";
import type { App } from "obsidian";

// `obsidian` is aliased to src/__mocks__/obsidian.ts via vitest.config.ts.

// Polyfill the Obsidian HTMLElement helpers that HeaderController.mount() and
// the nav/search widgets it builds rely on.
beforeAll(() => {
    const proto = HTMLElement.prototype as any;
    function createChild(this: HTMLElement, tag: string, o?: any) {
        const el = document.createElement(tag);
        if (o?.cls) el.className = o.cls;
        if (o?.text) el.textContent = o.text;
        if (o?.type) el.setAttribute("type", o.type);
        if (o?.placeholder) el.setAttribute("placeholder", o.placeholder);
        if (o?.attr) for (const [k, v] of Object.entries(o.attr)) el.setAttribute(k, String(v));
        this.appendChild(el);
        return el;
    }
    proto.createDiv = function (o?: any) { return createChild.call(this, "div", o); };
    proto.createSpan = function (o?: any) { return createChild.call(this, "span", o); };
    proto.createEl = function (tag: string, o?: any) { return createChild.call(this, tag, o); };
    proto.setAttr = function (n: string, v: string) { this.setAttribute(n, v); };
    proto.empty = function () { while (this.firstChild) this.removeChild(this.firstChild); };
    proto.addClass = function (c: string) { this.classList.add(c); };
    proto.removeClass = function (c: string) { this.classList.remove(c); };
    proto.hasClass = function (c: string) { return this.classList.contains(c); };
    proto.toggleClass = function (c: string, on: boolean) { this.classList.toggle(c, on); };
});

function mountInto(flattenedInitially: boolean): { hc: HeaderController; listBtn: HTMLElement } {
    uiState.flattenCollapsed = flattenedInitially;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const hc = new HeaderController({} as App);
    hc.mount(container as HTMLDivElement, false);
    // "Collapse tree" uses the list-collapse icon; it's the first nav button.
    const listBtn = container.querySelector(".nav-buttons-container .nav-action-button") as HTMLElement;
    return { hc, listBtn };
}

describe('HeaderController hides "Collapse tree" while flattened (issue #168)', () => {
    afterEach(() => {
        uiState.flattenCollapsed = false;
        document.body.innerHTML = "";
    });

    it("hides the Collapse tree button when mounted already flattened", () => {
        const { listBtn } = mountInto(true);
        expect(listBtn.style.display).toBe("none");
    });

    it("shows the Collapse tree button when mounted not flattened", () => {
        const { listBtn } = mountInto(false);
        expect(listBtn.style.display).not.toBe("none");
    });

    it("toggles button visibility as flatten state changes", () => {
        const { hc, listBtn } = mountInto(false);
        expect(listBtn.style.display).not.toBe("none");

        hc.setFlattenActive(true);
        expect(listBtn.style.display).toBe("none");

        hc.setFlattenActive(false);
        expect(listBtn.style.display).not.toBe("none");
    });
});
