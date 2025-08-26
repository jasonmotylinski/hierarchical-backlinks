import { App } from "obsidian";
import { NavButtonsView } from "../nav/navButtonsView";
import { SearchBar } from "../nav/searchBar";
import { TreeNode } from "../tree/treeNode";
import { TreeNodeView } from "../tree/treeNodeView";
import { uiState } from "./uiState";
import { Logger } from "../utils/logger";
import type { BacklinksLayoutHandlers } from "./../types";

const ENABLE_LOG = false;

export class BacklinksLayout {
  constructor(private app: App) { }

  private rootContainerEl: HTMLDivElement | null = null;
  private roots: TreeNode[] = [];
  private rootWrappers: Map<string, HTMLElement> = new Map();
  private callbacks?: BacklinksLayoutHandlers;
  private nav?: NavButtonsView | null = null;
  private search?: SearchBar | null = null;
  private lockBadgeEl: HTMLSpanElement | null = null;

  private headerEl: HTMLDivElement | null = null;
  private paneEl: HTMLDivElement | null = null;
  private rootEl: HTMLDivElement | null = null;

  public setCallbacks(callbacks: BacklinksLayoutHandlers) {
    console.log('[HB][layout] setCallbacks called', !!callbacks);
    this.callbacks = callbacks;
  }

  /**
   * Mount the header (nav buttons + search + badge) once and keep it.
   * Also prepares the pane & scroll container; does not render the tree.
   */
  public mountHeader(
    container: HTMLElement,
    callbacks: BacklinksLayoutHandlers,
    initialLocked: boolean
  ): {
    elements: { root: HTMLDivElement; pane: HTMLDivElement; scrollContainer: HTMLDivElement; headerEl: HTMLDivElement };
  } {
    this.callbacks = callbacks;

    if (!this.rootEl) {
      // Prepare the outer .view-content
      const root = (container as HTMLDivElement);
      root.empty();
      root.style.display = "flex";
      root.style.flexDirection = "column";
      root.style.height = "100%";
      root.style.overflow = "hidden"; // only inner pane scrolls
      this.rootEl = root;

      // Header (nav buttons + search), outside the scroll area
      const headerWrapper = root.createDiv();
      const navButtonsView = new NavButtonsView(this.app, headerWrapper);
      navButtonsView.render();
      this.nav = navButtonsView;
      this.headerEl = (headerWrapper.querySelector('.nav-header') as HTMLDivElement) || (headerWrapper as HTMLDivElement);

      // Keep editor focus + prevent leaf activation when clicking the navbar (bubble phase)
      this.headerEl.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
      this.headerEl.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });

      // Locked badge (hidden by default)
      this.lockBadgeEl = this.headerEl.createSpan({ cls: 'hb-locked-badge', text: 'Locked' });
      this.lockBadgeEl.addClass('hb-lock-btn');

      // Backlink pane (container for header+scroll)
      const pane = root.createDiv({ cls: 'backlink-pane node-insert-event' });
      const paneDiv = pane as HTMLDivElement;
      paneDiv.style.position = 'relative';
      paneDiv.style.display = 'flex';
      paneDiv.style.flexDirection = 'column';
      paneDiv.style.paddingRight = '0';
      paneDiv.style.marginRight = '0';
      paneDiv.style.flex = '1 1 auto';
      this.paneEl = paneDiv;

      // Scroll container holds the section header + results
      const scrollContainer = paneDiv.createDiv({ cls: 'search-result-container' });
      const scDiv = scrollContainer as HTMLDivElement;
      scDiv.style.flex = '1 1 auto';
      scDiv.style.overflow = 'auto';
      scDiv.style.paddingRight = '0';
      scDiv.style.marginRight = '0';
      this.rootContainerEl = scDiv;

      // Restore toggle states from uiState
      this.nav.listCollapseButton.setCollapsed(uiState.listCollapsed);
      this.nav.contentCollapseButton.setCollapsed(uiState.contentCollapsed);
      this.nav.sortCollapseButton.setCollapsed(uiState.sortCollapsed);
      this.nav.flattenCollapseButton.setCollapsed(uiState.flattenCollapsed);
      // Reflect snapshot/locked state provided by the view
      this.nav.lockCollapseButton.setCollapsed(!!initialLocked);

      // Apply locked visuals
      if (initialLocked) {
        this.rootContainerEl.classList.add('hb-locked');
        if (this.lockBadgeEl) this.lockBadgeEl.style.display = '';
        this.nav.lockCollapseButton.getElement().addClass('hb-lock-active');
      } else {
        if (this.lockBadgeEl) this.lockBadgeEl.style.display = 'none';
        this.rootContainerEl.classList.remove('hb-locked');
        this.nav.lockCollapseButton.getElement().removeClass('hb-lock-active');
      }

      // Wire navbar callbacks to the current `this.callbacks`
      this.nav.listCollapseButton.on('collapse-click', () => {
        const isOn = this.nav!.listCollapseButton.isCollapsed();
        uiState.listCollapsed = isOn;
        this.callbacks?.onListToggle(isOn);
      });

      this.nav.contentCollapseButton.on('collapse-click', () => {
        const isOn = this.nav!.contentCollapseButton.isCollapsed();
        uiState.contentCollapsed = isOn;
        this.callbacks?.onContentToggle(isOn);
      });

      this.nav.sortCollapseButton.on('collapse-click', () => {
        const isOn = this.nav!.sortCollapseButton.isCollapsed();
        uiState.sortCollapsed = isOn;
        this.callbacks?.onSortToggle(isOn);
      });

      this.nav.flattenCollapseButton.on('collapse-click', () => {
        const isOn = this.nav!.flattenCollapseButton.isCollapsed();
        uiState.flattenCollapsed = isOn;
        this.callbacks?.onFlattenToggle(isOn);
      });

      this.nav.lockCollapseButton.on('collapse-click', () => {
        const locked = this.nav!.lockCollapseButton.isCollapsed();
        if (locked) {
          this.rootContainerEl?.classList.add('hb-locked');
          if (this.lockBadgeEl) this.lockBadgeEl.style.display = '';
          this.nav!.lockCollapseButton.getElement().addClass('hb-lock-active');
        } else {
          this.rootContainerEl?.classList.remove('hb-locked');
          if (this.lockBadgeEl) this.lockBadgeEl.style.display = 'none';
          this.nav!.lockCollapseButton.getElement().removeClass('hb-lock-active');
        }
        this.callbacks?.onLockToggle?.(locked);
      });

      // Search bar lives inside the header
      const searchBar = new SearchBar(this.headerEl, 'Search...');
      this.search = searchBar;
      searchBar.setValue(uiState.query ?? '');

      const show = uiState.searchCollapsed ?? false;
      this.nav.searchCollapseButton.setCollapsed(show);
      searchBar.containerEl.style.display = show ? '' : 'none';

      this.nav.searchCollapseButton.on('collapse-click', () => {
        const isOn = this.nav!.searchCollapseButton.isCollapsed();
        uiState.searchCollapsed = isOn;
        if (isOn) {
          this.setSearchActive(true);
        } else {
          this.clearSearch();
          this.setSearchActive(false);
        }
      });

      searchBar.onChange((value) => {
        const q = (value ?? '').toLowerCase();
        uiState.query = q;
        // Debug: confirm we are dispatching into the latest callbacks
        // layout.ts (inside searchBar.onChange handler)
        console.log('[HB][layout] search input ->', q, 'callbacks?', !!this.callbacks);
        try { console.log('[HB][layout] search input ->', q, 'callbacks?', !!this.callbacks); } catch (_) { }
        this.callbacks?.onSearchChange?.(q);
      });
    } else {
      // Header already mounted; just sync lock visuals to the requested initial state
      this.setLockActive(!!initialLocked);
      // Sync other buttons to current globals
      this.setListActive(!!uiState.listCollapsed);
      this.setContentActive(!!uiState.contentCollapsed);
      this.setFlattenActive(!!uiState.flattenCollapsed);
      this.setSortActive(!!uiState.sortCollapsed);
      // Keep search visibility
      if (this.search) {
        const show = uiState.searchCollapsed ?? false;
        this.nav?.searchCollapseButton.setCollapsed(show);
        this.search.containerEl.style.display = show ? '' : 'none';
      }
    }

    return {
      elements: {
        root: this.rootEl!,
        pane: this.paneEl!,
        scrollContainer: this.rootContainerEl!,
        headerEl: this.headerEl!,
      },
    };
  }

  /** Render (or re-render) the tree only; header stays mounted. */
  public renderTree(hierarchy: TreeNode[]): TreeNodeView[] {
    if (!this.rootContainerEl) throw new Error('BacklinksLayout.renderTree: scroll container not mounted');

    console.log('[HB][layout] renderTree: start, hierarchy.len =', hierarchy?.length);

    this.roots = hierarchy;

    // Clear current contents
    this.rootContainerEl.empty();
    console.log('[HB][layout] renderTree: after empty, child count =', this.rootContainerEl.childElementCount);


    // Section header
    const headerContainer = this.rootContainerEl.createDiv({ cls: 'linked-mentions-header-container' });
    headerContainer.style.marginBottom = '10px';
    const linkedHeader = headerContainer.createDiv({ cls: 'tree-item-self' });
    linkedHeader.style.paddingLeft = '0';
    linkedHeader.style.marginLeft = '0';
    linkedHeader.createEl('div', { text: 'Linked mentions' }).style.fontWeight = 'bold';

    const treeNodeViews: TreeNodeView[] = [];
    this.rootWrappers = new Map();

    if (hierarchy.length === 0) {
      this.rootContainerEl.createDiv({ cls: 'search-empty-state', text: 'No backlinks found.' });
    } else {
      hierarchy.forEach((node) => {
        const wrapper = this.rootContainerEl!.createDiv({ cls: 'hb-root-wrapper', attr: { 'data-node-path': node.path } });
        const v = this.callbacks!.createTreeNodeView(wrapper as HTMLDivElement, node);
        v.render();
        treeNodeViews.push(v);
        this.rootWrappers.set(node.path, wrapper);
      });
    }

    console.log('[HB][layout] renderTree: built node DOM, child count =', this.rootContainerEl.childElementCount);
    // If there is an active query, ask the view to filter again
    if (uiState.query && uiState.query.trim().length > 0) {
      this.callbacks?.onSearchChange(uiState.query);
    }

    return treeNodeViews;
  }

  mount(
    container: HTMLElement,
    hierarchy: TreeNode[],
    callbacks: BacklinksLayoutHandlers
  ): {
    treeNodeViews: TreeNodeView[];
    elements: { root: HTMLDivElement; pane: HTMLDivElement; scrollContainer: HTMLDivElement; headerEl: HTMLDivElement };
  } {
    // Mount header once, then render tree
    const { elements } = this.mountHeader(container, callbacks, !!callbacks.initialLocked);
    const treeNodeViews = this.renderTree(hierarchy);
    return { treeNodeViews, elements };
  }

  /** Toggle the search bar: show & focus if hidden; hide & clear if visible. */
  public focusSearch() {
    const nav = this.nav;
    const sb = this.search;
    if (!nav || !sb) return;

    // In this UI, `isCollapsed()` returns whether the control is toggled ON (visible)
    const isOn = nav.searchCollapseButton.isCollapsed();

    if (!isOn) {
      // Show the search bar and focus input
      nav.searchCollapseButton.setCollapsed(true);
      sb.containerEl.style.display = "";
      const inp = sb.containerEl.querySelector("input") as HTMLInputElement | null;
      try { inp?.focus(); } catch (_) { }
    } else {
      // Hide the search bar and clear value
      nav.searchCollapseButton.setCollapsed(false);
      sb.containerEl.style.display = "none";
      sb.setValue("");
      uiState.query = "";
      this.callbacks?.onSearchChange?.("");
    }
  }

  public isSearchVisible(): boolean {
    return !!this.nav?.searchCollapseButton?.isCollapsed?.();
  }

  /** Navbar setters — flip UI state without remounting */
  public setListActive(on: boolean) {
    this.nav?.listCollapseButton?.setCollapsed(on);
  }

  public setContentActive(on: boolean) {
    this.nav?.contentCollapseButton?.setCollapsed(on);
  }

  public setFlattenActive(on: boolean) {
    this.nav?.flattenCollapseButton?.setCollapsed(on);
  }

  public setSortActive(on: boolean) {
    this.nav?.sortCollapseButton?.setCollapsed(on);
  }

  public setLockActive(on: boolean) {
    this.nav?.lockCollapseButton?.setCollapsed(on);
    const sc = this.rootContainerEl;
    const btnEl = this.nav?.lockCollapseButton?.getElement();
    if (on) {
      sc?.classList.add('hb-locked');
      if (this.lockBadgeEl) this.lockBadgeEl.style.display = '';
      btnEl?.addClass('hb-lock-active');
    } else {
      sc?.classList.remove('hb-locked');
      if (this.lockBadgeEl) this.lockBadgeEl.style.display = 'none';
      btnEl?.removeClass('hb-lock-active');
    }
  }

  /** Show/hide the search row and (optionally) focus the input when showing. */
  public setSearchActive(active: boolean) {
    const sb = this.search;
    const nav = this.nav;
    if (!sb || !nav) return;
    // Keep navbar button in sync
    nav.searchCollapseButton.setCollapsed(!!active);
    // Show/hide the container
    sb.containerEl.style.display = active ? '' : 'none';
    if (active) {
      setTimeout(() => {
        try { (sb.containerEl.querySelector('input') as HTMLInputElement | null)?.focus(); } catch (_) { }
      }, 0);
    }
  }

  /** Clear the search input and notify the view so it can re-filter to empty. */
  public clearSearch() {
    const sb = this.search;
    if (!sb) return;
    sb.setValue('');
    uiState.query = '';
    // Notify view to remove filters
    this.callbacks?.onSearchChange?.('');
  }
}