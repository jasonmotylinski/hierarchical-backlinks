import { App, setIcon, Events } from "obsidian";
import HierarchicalBacklinksPlugin from "../main";

export class CollapseButton extends Events  {
    private app: App;
    private plugin: HierarchicalBacklinksPlugin;
    private parent: Element;
    private button :HTMLDivElement;
    constructor(app: App, plugin: HierarchicalBacklinksPlugin, parent: Element) {
        super();
        this.app=app;
        this.plugin=plugin;
        this.parent=parent;
    }

    render(){
        this.button=this.parent.createDiv({cls: "clickable-icon nav-action-button"});
        setIcon( this.button, 'list');

        if(this.plugin.settings.collapseButtonState){
            this.button.addClass("is-active");   
        }
        this.trigger("collapse-click", null);

        this.button.addEventListener("click", (e)=>{ 
            this.button.classList.toggle('is-active');
            this.trigger("collapse-click", e);
            this.plugin.saveData({collapseButtonState: this.isCollapsed()});
        });
    }

    isCollapsed(): boolean{
        return this.button.hasClass("is-active");
    }
   
}