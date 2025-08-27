// src/view/state.ts

import { TreeNode } from "../tree/treeNode";
import { ViewState, NodeViewState, LockedTreeSnapshot } from "../types";
import { cloneHierarchy } from "./treeUtils";

/** Shape of a lightweight snapshot for per-node UI state (collapsed/visible). */
export type NodeStateSnapshot = Map<string, { isCollapsed: boolean; isVisible: boolean }>;

/**
 * Ensure a ViewState instance exists and return it. If `base` is provided,
 * it’s returned unchanged; otherwise a fresh one is created (unlocked).
 */
export function ensureViewState(base?: ViewState | null): ViewState {
  return base ?? { nodeStates: new Map<string, NodeViewState>(), isLocked: false };
}

/**
 * Get or create a NodeViewState for the given node id.
 * This mirrors the inline helper you had in view.ts, but as a pure function.
 */
export function getOrCreateNodeViewState(viewState: ViewState, nodeId: string): NodeViewState {
  let st = viewState.nodeStates.get(nodeId);
  if (!st) {
    st = { isCollapsed: false, isVisible: true };
    viewState.nodeStates.set(nodeId, st);
  }
  return st;
}

/**
 * Take a compact snapshot of collapsed/visible flags for all known nodes.
 */
export function snapshotNodeStates(viewState: ViewState): NodeStateSnapshot {
  const snap: NodeStateSnapshot = new Map();
  for (const [path, st] of viewState.nodeStates.entries()) {
    snap.set(path, {
      isCollapsed: !!st.isCollapsed,
      isVisible: st.isVisible !== false,
    });
  }
  return snap;
}

/**
 * Restore collapsed/visible flags from a snapshot into the given ViewState.
 * Existing entries are overwritten; missing entries are (re)created.
 */
export function restoreNodeStatesFrom(
  viewState: ViewState,
  snapshot: NodeStateSnapshot
): void {
  for (const [path, st] of snapshot.entries()) {
    viewState.nodeStates.set(path, {
      isCollapsed: !!st.isCollapsed,
      isVisible: st.isVisible !== false,
    });
  }
}

/**
 * Deep-clone a ViewState (node flags only). The clone is typically marked
 * locked=true because it’s used for frozen/snapshot trees.
 */
export function cloneViewStateLocked(viewState: ViewState): ViewState {
  const map = new Map<string, NodeViewState>();
  for (const [k, v] of viewState.nodeStates.entries()) {
    map.set(k, { isCollapsed: !!v.isCollapsed, isVisible: v.isVisible !== false });
  }
  return { nodeStates: map, isLocked: true };
}

/**
 * Build a full LockedTreeSnapshot from a source hierarchy and a ViewState.
 * The hierarchy is deep-cloned so the snapshot is immutable.
 */
export function captureSnapshotFrom(
  sourceHierarchy: TreeNode[],
  viewState: ViewState
): LockedTreeSnapshot {
  return {
    hierarchy: cloneHierarchy(sourceHierarchy),
    viewState: cloneViewStateLocked(viewState),
  };
}