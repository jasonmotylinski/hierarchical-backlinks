// Public API: one small function with explicit deps
export type HistoryHotkeyOptions = {
    containerEl: HTMLElement;
    refocus: (force?: boolean) => void;
    register: (t: any, ev: string, h: any, opts?: any) => void; // view.registerDomEvent
    exec: (id: string) => void;                                  // app.commands.executeCommandById
    enableEnterRefocus?: boolean;           // default true
    searchInputClass?: string;              // default 'search-input'
  };
  
  export function installHistoryHotkeys(opts: HistoryHotkeyOptions): void {
    const { containerEl, refocus, register, exec, enableEnterRefocus = true, searchInputClass = 'search-input' } = opts;
  
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

    if (enableEnterRefocus) {
      const onEnter = (ev: KeyboardEvent) => {
        if (ev.key !== 'Enter') return;
        const ae = document.activeElement as HTMLElement | null;
        if (!ae || !ae.classList?.contains(searchInputClass)) return;
        ev.stopPropagation();
        ev.preventDefault();
        refocus(true);
      };
      register(window, 'keydown', onEnter, { capture: true } as any);
    }
  }