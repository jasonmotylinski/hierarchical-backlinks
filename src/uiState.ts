// src/uiState.ts
export type UIStateSnapshot = {
    listCollapsed: boolean;
    contentCollapsed: boolean;
    searchCollapsed: boolean;
    sortCollapsed: boolean;
    flattenCollapsed: boolean;
    query: string;
};

class UIState {
    private state: UIStateSnapshot = {
        listCollapsed: false,
        contentCollapsed: false,
        searchCollapsed: false,
        sortCollapsed: false,
        flattenCollapsed: false,
        query: "",
    };

    get listCollapsed() { return this.state.listCollapsed; }
    set listCollapsed(v: boolean) { this.state.listCollapsed = v; }

    get contentCollapsed() { return this.state.contentCollapsed; }
    set contentCollapsed(v: boolean) { this.state.contentCollapsed = v; }

    get searchCollapsed() { return this.state.searchCollapsed; }
    set searchCollapsed(v: boolean) { this.state.searchCollapsed = v; }

    get sortCollapsed() { return this.state.sortCollapsed; }
    set sortCollapsed(v: boolean) { this.state.sortCollapsed = v; }

    get flattenCollapsed() { return this.state.flattenCollapsed; }
    set flattenCollapsed(v: boolean) { this.state.flattenCollapsed = v; }

    get query() { return this.state.query; }
    set query(v: string) { this.state.query = v; }

    load(snapshot?: Partial<UIStateSnapshot>) {
        if (snapshot) this.state = { ...this.state, ...snapshot };
    }
    serialize(): UIStateSnapshot {
        return { ...this.state };
    }
}

export const uiState = new UIState();