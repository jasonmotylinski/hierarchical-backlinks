import { } from "obsidian";

export class SearchBar {
    public readonly containerEl: HTMLDivElement;
    private readonly inputEl: HTMLInputElement;
    private readonly clearBtnEl: HTMLDivElement;
    private onChangeCallback?: (value: string) => void;

    constructor(parent: HTMLElement, placeholder = "Search...") {
        this.containerEl = parent.createDiv({ cls: "search-input-container" });
    
        this.inputEl = this.containerEl.createEl("input", {
          type: "search",
          cls: "search-input",
          placeholder,
        });
        this.inputEl.setAttr("enterkeyhint", "search");
        this.inputEl.setAttr("spellcheck", "false");
    
        this.clearBtnEl = this.containerEl.createDiv({
          cls: "search-input-clear-button",
          attr: { "aria-label": "Clear search" },
        });

        this.inputEl.addEventListener("input", (event) => {
            this.onChangeCallback?.(this.inputEl.value);
        });

        this.clearBtnEl.addEventListener("click", () => {
            this.setValue("");
            this.onChangeCallback?.("");
            this.inputEl.focus();
        });
    }

    public onChange(callback: (value: string) => void) {
        this.onChangeCallback = callback;
    }

    public setValue(value: string) {
        this.inputEl.value = value;
    }

    public getValue() {
        return this.inputEl.value;
    }
}