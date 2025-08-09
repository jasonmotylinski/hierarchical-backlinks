// src/ui/layout.ts
export type BacklinksLayout = {
    root: HTMLDivElement;
    headerEl: HTMLDivElement;
    paneEl: HTMLDivElement;
    scrollEl: HTMLDivElement;
    linkedHeaderEl: HTMLDivElement;
  };
  
  export function buildBacklinksLayout(container: HTMLElement): BacklinksLayout {
    const root = container as HTMLDivElement;
    root.addClass("hbv-root");
  
    const headerEl = root.createDiv({ cls: "hbv-header" });
  
    const paneEl = root.createDiv({ cls: "hbv-pane backlink-pane node-insert-event" });
  
    const scrollEl = paneEl.createDiv({ cls: "hbv-scroll search-result-container" });
  
    const linkedHeaderEl = scrollEl.createDiv({ cls: "hbv-section-header tree-item-self" });
    linkedHeaderEl.createEl("div", { text: "Linked mentions", cls: "hbv-section-title" });
  
    return { root, headerEl, paneEl, scrollEl, linkedHeaderEl };
  }