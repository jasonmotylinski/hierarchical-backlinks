import { App } from "obsidian";
import { CollapseButton } from "./collapseButtons";

export class NavButtonsView {
    private app;
    private parent;
    public contentCollapseButton: CollapseButton;
    public listCollapseButton: CollapseButton;
    public searchToggleButton: CollapseButton;
    public sortOrderButton: CollapseButton;
    public flattenToggleButton: CollapseButton;

    constructor(app: App, parent: Element) {
        this.app=app;
        this.parent=parent;
    }

    render(){
        const navButtonsContainer=this.parent.createDiv({cls:"nav-header"})
                                             .createDiv({cls: "nav-buttons-container"});
        
        this.listCollapseButton = new CollapseButton(this.app, navButtonsContainer,'list');
        this.listCollapseButton.render();
        this.contentCollapseButton=new CollapseButton(this.app, navButtonsContainer, 'file-minus');
        this.contentCollapseButton.render();
        this.searchToggleButton = new CollapseButton(this.app, navButtonsContainer, 'search');
        this.searchToggleButton.render();
        // this.sortOrderButton = new CollapseButton(this.app, navButtonsContainer, 'arrow-down-up');
        // this.sortOrderButton.render();
        // this.flattenToggleButton = new CollapseButton(this.app, navButtonsContainer, 'fold-horizontal');
        // this.flattenToggleButton.render();
    }
}