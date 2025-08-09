import { App } from "obsidian";
import { CollapseButton } from "./collapseButtons";

export class NavButtonsView {
    private app;
    private parent;
    public contentCollapseButton: CollapseButton;
    public listCollapseButton: CollapseButton;
    public searchCollapseButton: CollapseButton;
    public sortCollapseButton: CollapseButton;
    public flattenCollapseButton: CollapseButton;

    constructor(app: App, parent: Element) {
        this.app = app;
        this.parent = parent;
    }

    render() {
        const navButtonsContainer = this.parent.createDiv({ cls: "nav-header" })
            .createDiv({ cls: "nav-buttons-container" });

        this.listCollapseButton = new CollapseButton(this.app, navButtonsContainer, 'list-collapse');
        this.listCollapseButton.render();
        this.contentCollapseButton = new CollapseButton(this.app, navButtonsContainer, 'list');
        this.contentCollapseButton.render();
        this.flattenCollapseButton = new CollapseButton(this.app, navButtonsContainer, 'fold-vertical');
        this.flattenCollapseButton.render();
        this.sortCollapseButton = new CollapseButton(this.app, navButtonsContainer, 'arrow-up-narrow-wide');
        this.sortCollapseButton.render();
        this.searchCollapseButton = new CollapseButton(this.app, navButtonsContainer, 'search');
        this.searchCollapseButton.render();
    }
}