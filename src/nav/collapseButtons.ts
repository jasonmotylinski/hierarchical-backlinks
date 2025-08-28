import { dbgButton } from "../utils/debug";
import { App, setIcon } from "obsidian";
import { EventEmitter } from "events";

export class CollapseButton extends EventEmitter {
    private app: App;
    private parent: Element;
    private button: HTMLDivElement;
    private icon: string;
    constructor(app: App, parent: Element, icon: string) {
        super();
        this.app = app;
        this.parent = parent;
        this.icon = icon;
    }

    render() {
        this.button = this.parent.createDiv({ cls: "clickable-icon nav-action-button" });
        setIcon(this.button, this.icon);

        // Prevent navbar buttons from stealing editor focus
        this.button.addEventListener("mousedown", (e) => {
            dbgButton("mousedown prevented for", this.icon);
            e.preventDefault();
        });

        // collapseButtons.ts — inside render(), in the click listener:
        this.button.addEventListener("click", (e) => {
            dbgButton("click:", this.icon, "active before =", document.activeElement?.tagName, document.activeElement?.className);
            dbgButton("click path =", e.composedPath().map((el:any)=>el?.className || el?.tagName));
            this.button.classList.toggle('is-active');
            this.emit("collapse-click", e);
            // after the view handles it (often async), check again on next tick
            setTimeout(() => {
                const ae = document.activeElement as HTMLElement | null;
                dbgButton("after toggle:", this.icon, "active =", ae?.tagName, ae?.className);
            }, 0);
        });
    }

    isCollapsed(): boolean {
        return this.button.hasClass("is-active");
    }

    setCollapsed(collapsed: boolean) {
        if (collapsed) {
            this.button.addClass("is-active");
        } else {
            this.button.removeClass("is-active");
        }
    }
    public getElement(): HTMLDivElement {
        return this.button;
    }
}