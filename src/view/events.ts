import { dbgEvents } from "../utils/debugger";
import type { HierarchicalBacklinksView } from "./view";
import { MarkdownView } from "obsidian";

/**
 * Registers workspace & metadata events for the HierarchicalBacklinksView.
 * Extracted from view.ts to reduce file size and isolate event wiring.
 */
export function registerViewEvents(
  view: HierarchicalBacklinksView
) {
  const app = view.app;

  // metadataCache.changed -> initialize (unless suppressed)
  view.registerEvent(
    app.metadataCache.on("changed", (file) => {
      const shouldSuppress = (view as any).shouldSuppressInit?.call(view);
      if (shouldSuppress) {
        dbgEvents("initialize() suppressed: cause=metadataCache.changed", file?.path);
        return;
      }
      dbgEvents("initialize cause = metadataCache.changed", file?.path);
      (view as any).initialize?.();
    })
  );

  // workspace.file-open -> remember editor leaf and initialize (unless suppressed)
  view.registerEvent(
    app.workspace.on("file-open", (file) => {
      const shouldSuppress = (view as any).shouldSuppressInit?.call(view);
      if (shouldSuppress) {
        dbgEvents("initialize() suppressed: cause=workspace.file-open", file?.path);
        return;
      }

      const activeEditor = app.workspace.getActiveViewOfType(MarkdownView);
      if (activeEditor?.leaf) (view as any).lastEditorLeaf = activeEditor.leaf;

      dbgEvents("initialize cause = workspace.file-open", file?.path);
      (view as any).initialize?.();
    })
  );

  // Keep lastEditorLeaf fresh on active-leaf-change
  view.registerEvent(
    app.workspace.on("active-leaf-change", (leaf) => {
      const v = leaf?.view;
      // @ts-ignore runtime type check
      if (v && v instanceof MarkdownView) {
        (view as any).lastEditorLeaf = leaf!;
      }
    })
  );
}