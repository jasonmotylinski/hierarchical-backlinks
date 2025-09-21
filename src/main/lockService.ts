import { dbgLS } from "../utils/debugger";
import { App } from "obsidian";
import { HierarchicalBacklinksView, VIEW_TYPE } from "../view/view";
import { LockedTreeSnapshot } from "../types";

export default class LockService {
  private store = new Map<string, LockedTreeSnapshot>();

  constructor(private app: App) {}

  has(noteId: string): boolean {
    return this.store.has(noteId);
  }
  get(noteId: string): LockedTreeSnapshot | undefined {
    return this.store.get(noteId);
  }
  set(noteId: string, snap: LockedTreeSnapshot): void {
    this.store.set(noteId, snap);
  }
  delete(noteId: string): void {
    this.store.delete(noteId);
  }
  size(): number {
    return this.store.size;
  }

  clearAll(): number {
    const count = this.store.size;
    this.store.clear();
    this.refreshOpenViews();
    return count;
  }

  refreshOpenViews(): void {
    const leaves = this.app.workspace.getLeavesOfType?.(VIEW_TYPE) ?? [];
    for (const leaf of leaves) {
      try {
        (leaf.view as HierarchicalBacklinksView).refresh();
      } catch (error) {
        dbgLS("refreshOpenViews(): failed to refresh view", error);
      }
    }
  }
}