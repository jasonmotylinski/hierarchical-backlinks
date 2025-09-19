import { dbgLayout } from "../utils/debug";
import { App } from "obsidian";
import type { BacklinksLayoutHandlers } from "../types";
import { HeaderController } from "./headerController";
import { TreeRenderer } from "./treeRenderer";
import { TreeNode } from "../tree/treeNode";
import { TreeNodeView } from "../tree/treeNodeView";

export class BacklinksLayout {
  constructor(private app: App) { }

  private header?: HeaderController;
  private tree?: TreeRenderer;
  private callbacks?: BacklinksLayoutHandlers;
  // near other private fields
  private _searchActive: boolean = false;

  private rootEl: HTMLDivElement | null = null;

  public setCallbacks(callbacks: BacklinksLayoutHandlers) {
    dbgLayout("setCallbacks", !!callbacks);
    this.callbacks = callbacks;
    this.header?.setCallbacks(callbacks);
  }

  public mountHeader(
    container: HTMLElement,
    callbacks: BacklinksLayoutHandlers,
    initialLocked: boolean
  ) {
    this.callbacks = callbacks;

    if (!this.rootEl) {
      this.rootEl = container as HTMLDivElement;
      const header = new HeaderController(this.app);
      header.setCallbacks(callbacks);

      const { headerEl, paneEl, scrollContainer } = header.mount(this.rootEl, !!initialLocked);
      this.header = header;
      this.tree = new TreeRenderer(scrollContainer);

      return { elements: { root: this.rootEl, pane: paneEl, scrollContainer, headerEl } };
    } else {
      // header already mounted → just sync lock etc via setters
      this.header?.setLockActive(!!initialLocked);
      const header = this.header;
      if (!header) throw new Error("BacklinksLayout.mountHeader: header missing after initial mount");
      const pane = header.getPaneElement();
      const scroll = header.getScrollContainer();
      const hdrEl = header.getHeaderElement();
      if (!pane || !scroll || !hdrEl) {
        throw new Error("BacklinksLayout.mountHeader: header DOM refs missing");
      }
      return {
        elements: {
          root: this.rootEl!,
          pane,
          scrollContainer: scroll,
          headerEl: hdrEl,
        },
      };
    }
  }

  public renderTree(hierarchy: TreeNode[]): TreeNodeView[] {
    if (!this.tree) {
      throw new Error("BacklinksLayout.renderTree: TreeRenderer missing — call mountHeader() first");
    }
    return this.tree.render(hierarchy, this.callbacks!);
  }

  public mount(
    container: HTMLElement,
    hierarchy: TreeNode[],
    callbacks: BacklinksLayoutHandlers
  ) {
    const { elements } = this.mountHeader(container, callbacks, !!callbacks.initialLocked);
    const views = this.renderTree(hierarchy);
    return { treeNodeViews: views, elements };
  }

  // passthrough setters used by view
  public setListActive(on: boolean) { this.header?.setListActive(on); }
  public setContentActive(on: boolean) { this.header?.setContentActive(on); }
  public setFlattenActive(on: boolean) { this.header?.setFlattenActive(on); }
  public setSortActive(on: boolean) { this.header?.setSortActive(on); }
  public setLockActive(on: boolean) { this.header?.setLockActive(on); }
  public setSearchActive(on: boolean) { this.header?.setSearchActive(on); }

  public isSearchVisible(): boolean {
    return this.header?.isSearchVisible() ?? false;
  }
}
