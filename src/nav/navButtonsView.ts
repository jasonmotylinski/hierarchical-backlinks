import { App } from "obsidian";
import { CollapseButton } from "./collapseButton";
import HierarchicalBacklinksPlugin from "../main";

export class NavButtonsView {
    private app;
    private plugin: HierarchicalBacklinksPlugin;
    private parent;
    public collapseButton: CollapseButton;
    constructor(app: App, plugin: HierarchicalBacklinksPlugin, parent: Element) {
        this.app=app;
        this.plugin=plugin;
        this.parent=parent;
    }

    create(){
        const navButtonsContainer=this.parent.createDiv({cls:"nav-header"})
                                             .createDiv({cls: "nav-buttons-container"});
        this.collapseButton=new CollapseButton(this.app, this.plugin,navButtonsContainer);
    }

    render(){
        this.collapseButton.render();
    }
}