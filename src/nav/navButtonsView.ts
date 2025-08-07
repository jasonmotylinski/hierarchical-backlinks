import { App } from "obsidian";
import { CollapseButton } from "./collapseButtons";

export class NavButtonsView {
    private app;
    private parent;
    public contentCollapseButton: CollapseButton;
    public totalCollapseButton: CollapseButton;

    constructor(app: App, parent: Element) {
        this.app=app;
        this.parent=parent;
    }

    render(){
        const navButtonsContainer=this.parent.createDiv({cls:"nav-header"})
                                             .createDiv({cls: "nav-buttons-container"});
        
        this.totalCollapseButton = new CollapseButton(this.app, navButtonsContainer,'list');
        this.totalCollapseButton.render();
        this.contentCollapseButton=new CollapseButton(this.app, navButtonsContainer, 'file-minus');
        this.contentCollapseButton.render();
    }
}