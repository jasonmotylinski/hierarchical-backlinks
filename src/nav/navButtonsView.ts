import { App } from "obsidian";
import { ContentCollapseButton, TotalCollapseButton } from "./collapseButtons";

export class NavButtonsView {
    private app;
    private parent;
    public contentCollapseButton: ContentCollapseButton;
    public totalCollapseButton: TotalCollapseButton;

    constructor(app: App, parent: Element) {
        this.app=app;
        this.parent=parent;
    }

    render(){
        const navButtonsContainer=this.parent.createDiv({cls:"nav-header"})
                                             .createDiv({cls: "nav-buttons-container"});
        
        this.totalCollapseButton = new TotalCollapseButton(this.app, navButtonsContainer);
        this.totalCollapseButton.render();
        this.contentCollapseButton=new ContentCollapseButton(this.app, navButtonsContainer);
        this.contentCollapseButton.render();
    }
}