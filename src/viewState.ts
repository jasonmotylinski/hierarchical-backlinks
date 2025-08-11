export type NodeId = string;
import type { NodeViewState } from "./types";
import type { ViewState } from "./types";

export function getOrCreateNodeViewState(
  viewState: ViewState,
  id: NodeId
): NodeViewState {
  let state = viewState.nodeStates.get(id);
  if (!state) {
    state = { isCollapsed: false, isVisible: true };
    viewState.nodeStates.set(id, state);
  }
  return state;
}