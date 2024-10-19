import { App } from "obsidian";
import { CollapseButton } from "./collapseButton";

export class NavButtonsView {
    private app;
    private parent;
    public collapseButton: CollapseButton;
    constructor(app: App, parent: Element) {
        this.app=app;
        this.parent=parent;
    }

    render(){
        const navButtonsContainer=this.parent.createDiv({cls:"nav-header"})
                                             .createDiv({cls: "nav-buttons-container"});
        this.collapseButton=new CollapseButton(this.app, navButtonsContainer);
        this.collapseButton.render();
        
    }
}