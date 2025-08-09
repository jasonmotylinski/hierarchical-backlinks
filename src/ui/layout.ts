import { App } from "obsidian";
import { NavButtonsView } from "../nav/navButtonsView";
import { SearchBar } from "../nav/searchBar";
import { TreeNodeModel } from "../treeNodeModel";
import { TreeNodeView } from "../treeNodeView";
import { uiState } from "../uiState";
import { Logger } from "../utils/logger";

const ENABLE_LOG = true;

export type BacklinksLayoutCallbacks = {
  createTreeNodeView: (containerEl: HTMLDivElement, node: TreeNodeModel) => TreeNodeView;
  onListToggle: (collapsed: boolean) => void;
  onContentToggle: (collapsed: boolean) => void;
  onSearchChange: (query: string) => void;
};

export class BacklinksLayout {
  constructor(private app: App) {}

  /**
   * Builds the entire backlinks pane UI inside the provided container.
   * Handles:
   *  - Preparing `.view-content` (flex column, hidden overflow)
   *  - Header (nav buttons + search)
   *  - Scroll container and section header
   *  - Rendering nodes via a factory callback
   *  - Applying current toggle states
   *  - Emitting search changes to let the view filter
   */
  mount(
    container: HTMLElement,
    hierarchy: TreeNodeModel[],
    callbacks: BacklinksLayoutCallbacks
  ): {
    treeNodeViews: TreeNodeView[];
    elements: {
      root: HTMLDivElement;
      pane: HTMLDivElement;
      scrollContainer: HTMLDivElement;
      headerEl: HTMLDivElement;
    };
  } {
    // Prepare the outer .view-content like the original initialize()
    const root = container as HTMLDivElement;
    root.empty();
    root.style.display = "flex";
    root.style.flexDirection = "column";
    root.style.height = "100%";
    root.style.overflow = "hidden"; // only the inner pane should scroll

    // Header (nav buttons + search), outside the scroll area
    const headerWrapper = root.createDiv();
    const navButtonsView = new NavButtonsView(this.app, headerWrapper);
    navButtonsView.render();
    const headerEl =
      (headerWrapper.querySelector(".nav-header") as HTMLDivElement) ||
      (headerWrapper as HTMLDivElement);

    // Restore toggle states from uiState
    navButtonsView.listCollapseButton.setCollapsed(uiState.listCollapsed);
    navButtonsView.contentCollapseButton.setCollapsed(uiState.contentCollapsed);

    navButtonsView.listCollapseButton.on("collapse-click", () => {
      const isOn = navButtonsView.listCollapseButton.isCollapsed();
      uiState.listCollapsed = isOn;
      callbacks.onListToggle(isOn);
    });

    navButtonsView.contentCollapseButton.on("collapse-click", () => {
      const isOn = navButtonsView.contentCollapseButton.isCollapsed();
      uiState.contentCollapsed = isOn;
      callbacks.onContentToggle(isOn);
    });

    // Search bar lives inside the header
    const searchBar = new SearchBar(headerEl, "Search...");
    searchBar.setValue(uiState.query ?? "");

    const show = uiState.searchCollapsed ?? false;
    navButtonsView.searchToggleButton.setCollapsed(show);
    searchBar.containerEl.style.display = show ? "" : "none";

    navButtonsView.searchToggleButton.on("collapse-click", () => {
      const isOn = navButtonsView.searchToggleButton.isCollapsed();
      uiState.searchCollapsed = isOn;
      searchBar.containerEl.style.display = isOn ? "" : "none";
      if (isOn) {
        const inp = searchBar.containerEl.querySelector("input") as HTMLInputElement | null;
        inp?.focus();
      } else {
        searchBar.setValue("");
        uiState.query = "";
        callbacks.onSearchChange("");
      }
    });

    searchBar.onChange((value) => {
      const q = value.toLowerCase();
      uiState.query = q;
      callbacks.onSearchChange(q);
    });

    // Backlink pane (container for header+scroll)
    const pane = root.createDiv({ cls: "backlink-pane node-insert-event" });
    const paneDiv = pane as HTMLDivElement;
    paneDiv.style.position = "relative";
    paneDiv.style.display = "flex";
    paneDiv.style.flexDirection = "column";
    // Ensure no right padding/margin so scrollbar is flush
    paneDiv.style.paddingRight = "0";
    paneDiv.style.marginRight = "0";
    paneDiv.style.flex = "1 1 auto"; // fill remaining height under the header

    // Scroll container holds the section header + results
    const scrollContainer = paneDiv.createDiv({ cls: "search-result-container" });
    const scDiv = scrollContainer as HTMLDivElement;
    scDiv.style.flex = "1 1 auto";
    scDiv.style.overflow = "auto"; // only this area scrolls
    scDiv.style.paddingRight = "0";
    scDiv.style.marginRight = "0";

    // Section header lives inside the scroll container
    const linkedHeader = scDiv.createDiv({ cls: "tree-item-self" });
    linkedHeader.style.paddingLeft = "0";
    linkedHeader.style.marginLeft = "0";
    linkedHeader.createEl("div", { text: "Linked mentions" }).style.fontWeight = "bold";

    // Render nodes after the header
    const treeNodeViews: TreeNodeView[] = [];
    Logger.debug(ENABLE_LOG, "[BacklinksLayout] nodes incoming", hierarchy.length);

    if (hierarchy.length === 0) {
      scDiv.createDiv({ cls: "search-empty-state", text: "No backlinks found." });
    } else {
      hierarchy.forEach((node) => {
        const v = callbacks.createTreeNodeView(scDiv, node);
        v.render();
        treeNodeViews.push(v);
      });
    }

    // Apply current toggle states (UI concern)
    if (uiState.listCollapsed) {
      treeNodeViews.forEach((n) => n.listToggleOn());
    } else {
      treeNodeViews.forEach((n) => n.listToggleOff());
    }
    if (uiState.contentCollapsed) {
      treeNodeViews.forEach((n) => n.contentHiddenToggleOn());
    } else {
      treeNodeViews.forEach((n) => n.contentHiddenToggleOff());
    }

    // If there is an active query on mount, ask the view to filter
    if (uiState.query && uiState.query.trim().length > 0) {
      callbacks.onSearchChange(uiState.query);
    }

    return {
      treeNodeViews,
      elements: { root, pane: paneDiv, scrollContainer: scDiv, headerEl },
    };
  }
}