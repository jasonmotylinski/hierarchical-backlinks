import { App, setIcon } from "obsidian";
import { EventEmitter } from "events";
import { collapseLeafMatchBlocks } from "utils/collapseUtils";

export class CollapseButton extends EventEmitter {
  private button: HTMLDivElement;

  constructor(private app: App, private parent: HTMLElement) {
    super();
  }

  render() {
    this.button = this.parent.createDiv({ cls: "clickable-icon nav-action-button" });
    setIcon(this.button, "list");

    this.button.addEventListener("click", (e) => {
      console.debug("[CollapseButton] Clicked collapse button");
      this.button.classList.toggle("is-active");

      const root = this.parent.closest(".workspace-leaf")?.querySelector(".backlink-pane") as HTMLElement;
      console.debug("[CollapseButton] Scanning from root container:", root);

      if (root) {
        collapseLeafMatchBlocks(root);
      } else {
        console.warn("[CollapseButton] Could not find .backlink-pane");
      }

      this.emit("collapse-click", e);
    });
  }

  isCollapsed(): boolean {
    return this.button.hasClass("is-active");
  }
}