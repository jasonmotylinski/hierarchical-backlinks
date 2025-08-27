// Public API: one small function with explicit deps
export type HistoryHotkeyOptions = {
    containerEl: HTMLElement;
    refocus: (force?: boolean) => void;
    register: (t: any, ev: string, h: any, opts?: any) => void; // view.registerDomEvent
    exec: (id: string) => void;                                  // app.commands.executeCommandById
  };
  
  export function installHistoryHotkeys(opts: HistoryHotkeyOptions): void {
    const { containerEl, refocus, register, exec } = opts;
  
    const isHistoryChord = (ev: KeyboardEvent) => {
      const k = ev.key;
      if (k !== "ArrowLeft" && k !== "ArrowRight") return false;
      const isMac = navigator.platform?.toLowerCase().includes("mac");
      const cmdLike = isMac ? ev.metaKey : ev.ctrlKey;
      return cmdLike && ev.altKey;
    };
  
    const shouldAssist = () => {
      if (document.querySelector(".modal-container, .prompt, .modal")) return false;
      const ae = document.activeElement as HTMLElement | null;
      const inside = !!(ae && containerEl.contains(ae));
      const onBody = ae === document.body || !ae;
      return inside || onBody;
    };
  
    const handler = (ev: KeyboardEvent) => {
      if (!isHistoryChord(ev) || !shouldAssist()) return;
  
      const cmdId = ev.key === "ArrowLeft" ? "app:go-back" : "app:go-forward";
      refocus(true);
      ev.stopPropagation();
      ev.preventDefault();
      setTimeout(() => exec(cmdId), 0);
    };
  
    register(window, "keydown", handler, { capture: true } as any);
  }