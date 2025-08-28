import { dbgHC } from "../utils/debug";
import { App } from "obsidian";
import { NavButtonsView } from "../nav/navButtonsView";
import { SearchBar } from "../nav/searchBar";
import { uiState } from "./uiState";
import type { BacklinksLayoutHandlers } from "../types";

export type HeaderElements = {
  headerEl: HTMLDivElement;
  paneEl: HTMLDivElement;
  scrollContainer: HTMLDivElement;
};

export class HeaderController {
  constructor(private app: App) { }

  private callbacks?: BacklinksLayoutHandlers;
  private headerEl: HTMLDivElement | null = null;
  private paneEl: HTMLDivElement | null = null;
  private scrollEl: HTMLDivElement | null = null;

  private nav?: NavButtonsView | null = null;
  private search?: SearchBar | null = null;
  private lockBadgeEl: HTMLSpanElement | null = null;

  setCallbacks(cb: BacklinksLayoutHandlers) {
    dbgHC("setCallbacks", !!cb);
    this.callbacks = cb;
  }

  mount(container: HTMLDivElement, initialLocked: boolean): HeaderElements {
    // wipe and scaffold
    container.empty();
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.height = "100%";
    container.style.overflow = "hidden";

    // header (nav + search)
    const headerWrapper = container.createDiv();
    const nav = new NavButtonsView(this.app, headerWrapper);
    nav.render();
    this.nav = nav;
    this.headerEl =
      (headerWrapper.querySelector(".nav-header") as HTMLDivElement) ||
      (headerWrapper as HTMLDivElement);

    // let search clicks through; block others to avoid leaf activation
    this.headerEl.addEventListener("pointerdown", (e) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest(".hb-search")) return;
      e.preventDefault();
      e.stopPropagation();
    });
    this.headerEl.addEventListener("mousedown", (e) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest(".hb-search")) return;
      e.preventDefault();
      e.stopPropagation();
    });

    // lock badge
    this.lockBadgeEl = this.headerEl.createSpan({
      cls: "hb-locked-badge",
      text: "Locked",
    });
    this.lockBadgeEl.addClass("hb-lock-btn");

    // pane + scroll container
    const pane = container.createDiv({ cls: "backlink-pane node-insert-event" }) as HTMLDivElement;
    pane.style.position = "relative";
    pane.style.display = "flex";
    pane.style.flexDirection = "column";
    pane.style.paddingRight = "0";
    pane.style.marginRight = "0";
    pane.style.flex = "1 1 auto";
    this.paneEl = pane;

    const sc = pane.createDiv({ cls: "search-result-container" }) as HTMLDivElement;
    sc.style.flex = "1 1 auto";
    sc.style.overflow = "auto";
    sc.style.paddingRight = "0";
    sc.style.marginRight = "0";
    this.scrollEl = sc;

    // restore toggles from uiState
    nav.listCollapseButton.setCollapsed(uiState.listCollapsed);
    nav.contentCollapseButton.setCollapsed(uiState.contentCollapsed);
    nav.sortCollapseButton.setCollapsed(uiState.sortCollapsed);
    nav.flattenCollapseButton.setCollapsed(uiState.flattenCollapsed);
    nav.lockCollapseButton.setCollapsed(!!initialLocked);

    // locked visuals
    this.applyLockVisuals(initialLocked);

    // wire button → callbacks & uiState
    nav.listCollapseButton.on("collapse-click", () => {
      const on = nav.listCollapseButton.isCollapsed();
      uiState.listCollapsed = on;
      this.callbacks?.onListToggle(on);
    });
    nav.contentCollapseButton.on("collapse-click", () => {
      const on = nav.contentCollapseButton.isCollapsed();
      uiState.contentCollapsed = on;
      this.callbacks?.onContentToggle(on);
    });
    nav.sortCollapseButton.on("collapse-click", () => {
      const on = nav.sortCollapseButton.isCollapsed();
      uiState.sortCollapsed = on;
      this.callbacks?.onSortToggle(on);
    });
    nav.flattenCollapseButton.on("collapse-click", () => {
      const on = nav.flattenCollapseButton.isCollapsed();
      uiState.flattenCollapsed = on;
      this.callbacks?.onFlattenToggle(on);
    });
    nav.lockCollapseButton.on("collapse-click", () => {
      const locked = nav.lockCollapseButton.isCollapsed();
      this.applyLockVisuals(locked);
      this.callbacks?.onLockToggle?.(locked);
    });

    // search bar
    const search = new SearchBar(this.headerEl!, "Search...");
    search.containerEl.addClass("hb-search");
    search.setValue(uiState.query ?? "");
    this.search = search;

    const hadQuery = !!(uiState.query && uiState.query.trim().length > 0);
    const show = (uiState.searchCollapsed ?? false) || hadQuery;
    nav.searchCollapseButton.setCollapsed(show);
    search.containerEl.style.display = show ? "" : "none";

    nav.searchCollapseButton.on("collapse-click", () => {
      const isOn = nav.searchCollapseButton.isCollapsed();
      uiState.searchCollapsed = isOn;
      if (isOn) {
        this.setSearchActive(true);
      } else {
        this.clearSearch();
        this.setSearchActive(false);
      }
    });

    search.onChange((value) => {
      const q = (value ?? "").toLowerCase();
      uiState.query = q;
      dbgHC("search →", q, "callbacks?", !!this.callbacks);
      this.callbacks?.onSearchChange?.(q);
    });

    return {
      headerEl: this.headerEl!,
      paneEl: this.paneEl!,
      scrollContainer: this.scrollEl!,
    };
  }

  /** UI setters (navbar button state & lock visuals) */
  setListActive(on: boolean) { this.nav?.listCollapseButton?.setCollapsed(on); }
  setContentActive(on: boolean) { this.nav?.contentCollapseButton?.setCollapsed(on); }
  setFlattenActive(on: boolean) { this.nav?.flattenCollapseButton?.setCollapsed(on); }
  setSortActive(on: boolean) { this.nav?.sortCollapseButton?.setCollapsed(on); }

  setLockActive(on: boolean) {
    this.nav?.lockCollapseButton?.setCollapsed(on);
    this.applyLockVisuals(on);
  }

  /** Search helpers */
  focusSearch() {
    const nav = this.nav, sb = this.search;
    if (!nav || !sb) return;
    const isOn = nav.searchCollapseButton.isCollapsed();
    if (!isOn) {
      nav.searchCollapseButton.setCollapsed(true);
      sb.containerEl.style.display = "";
      (sb.containerEl.querySelector("input") as HTMLInputElement | null)?.focus();
    } else {
      nav.searchCollapseButton.setCollapsed(false);
      sb.containerEl.style.display = "none";
      sb.setValue("");
      uiState.query = "";
      this.callbacks?.onSearchChange?.("");
    }
  }
  setSearchActive(active: boolean) {
    const sb = this.search, nav = this.nav;
    if (!sb || !nav) return;
    nav.searchCollapseButton.setCollapsed(!!active);
    sb.containerEl.style.display = active ? "" : "none";
    if (active) setTimeout(() => (sb.containerEl.querySelector("input") as HTMLInputElement | null)?.focus(), 0);
  }
  clearSearch() {
    if (!this.search) return;
    this.search.setValue("");
    uiState.query = "";
    this.callbacks?.onSearchChange?.("");
  }

  /** Accessors used by layout.ts */
  getScrollContainer(): HTMLDivElement | null { return this.scrollEl; }

  private applyLockVisuals(locked: boolean) {
    const sc = this.scrollEl;
    const btnEl = this.nav?.lockCollapseButton?.getElement();
    if (locked) {
      sc?.classList.add("hb-locked");
      if (this.lockBadgeEl) this.lockBadgeEl.style.display = "";
      btnEl?.addClass("hb-lock-active");
    } else {
      sc?.classList.remove("hb-locked");
      if (this.lockBadgeEl) this.lockBadgeEl.style.display = "none";
      btnEl?.removeClass("hb-lock-active");
    }
  }
}