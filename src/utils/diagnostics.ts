import { Logger } from "../utils/logger";

export function activeSummary(): string {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return "null";
    const id = el.id ? `#${el.id}` : "";
    const cls = el.className ? `.${String(el.className).trim().replace(/\s+/g, ".")}` : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
}

/**
 * Installs one-time debug hooks on the HB view container.
 * We keep this separate to reduce noise in view.ts.
 *
 * @param containerEl   the ItemView.containerEl of the HB view
 * @param onHeaderInteraction  callback to suppress initialize() bursts when navbar/header is clicked
 * @param enableLog     feature flag used by Logger.debug to gate logs
 */
export function installDebugHooks(
    containerEl: HTMLElement,
    onHeaderInteraction: () => void,
    enableLog: boolean
): void {
    containerEl.addEventListener("focusin", (e) => {
        const t = e.target as HTMLElement | null;
        Logger.debug(
            enableLog,
            "[HB] focusin in HB view — target =", t?.tagName, t?.className,
            "| active=", activeSummary()
        );
    }, true);
    containerEl.addEventListener("focusout", (e) => {
        const t = e.target as HTMLElement | null;
        Logger.debug(
            enableLog,
            "[HB] focusout in HB view — target =", t?.tagName, t?.className,
            "| active=", activeSummary()
        );
    }, true);

    // Mouse path diagnostics (capture phase) to see what bubbles up
    containerEl.addEventListener(
        "pointerdown",
        (e) => {
            const header = containerEl.querySelector(".nav-header") as HTMLElement | null;
            if (header && header.contains(e.target as Node)) onHeaderInteraction();
            const t = e.target as HTMLElement | null;
            Logger.debug(enableLog, "[HB] pointerdown in HB view (capture) — target =", t?.tagName, t?.className);
        },
        true
    );
    containerEl.addEventListener(
        "mousedown",
        (e) => {
            const header = containerEl.querySelector(".nav-header") as HTMLElement | null;
            if (header && header.contains(e.target as Node)) onHeaderInteraction();
            const t = e.target as HTMLElement | null;
            Logger.debug(enableLog, "[HB] mousedown in HB view (capture) — target =", t?.tagName, t?.className);
        },
        true
    );
    containerEl.addEventListener(
        "click",
        (e) => {
            const header = containerEl.querySelector(".nav-header") as HTMLElement | null;
            if (header && header.contains(e.target as Node)) onHeaderInteraction();
            const t = e.target as HTMLElement | null;
            Logger.debug(enableLog, "[HB] click in HB view (capture) — target =", t?.tagName, t?.className);
        },
        true
    );
}