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
    public lockCollapseButton: CollapseButton;

    constructor(app: App, parent: Element) {
        this.app = app;
        this.parent = parent;
    }

    render() {
        const navButtonsContainer = this.parent.createDiv({ cls: "nav-header" })
            .createDiv({ cls: "nav-buttons-container" });

        this.listCollapseButton = new CollapseButton(this.app, navButtonsContainer, 'list-collapse', 'Collapse tree');
        this.listCollapseButton.render();
        this.contentCollapseButton = new CollapseButton(this.app, navButtonsContainer, 'list', 'Collapse results');
        this.contentCollapseButton.render();
        this.flattenCollapseButton = new CollapseButton(this.app, navButtonsContainer, 'fold-vertical', 'Flatten tree');
        this.flattenCollapseButton.render();
        this.sortCollapseButton = new CollapseButton(this.app, navButtonsContainer, 'arrow-up-narrow-wide', 'Change sort order');
        this.sortCollapseButton.render();
        this.searchCollapseButton = new CollapseButton(this.app, navButtonsContainer, 'search', 'Show search filter');
        this.searchCollapseButton.render();
        this.lockCollapseButton = new CollapseButton(this.app, navButtonsContainer, 'lock', 'Lock view');
        this.lockCollapseButton.render();
        this.lockCollapseButton.getElement().addClass('hb-lock-btn');
    }
}