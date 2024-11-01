import { App, setIcon } from "obsidian";
import { EventEmitter } from "events";

export class CollapseButton extends EventEmitter  {
    private app: App;
    private parent: Element;
    private button :HTMLDivElement;
    constructor(app: App, parent: Element) {
        super();
        this.app=app;
        this.parent=parent;
    }

    render(){
        this.button=this.parent.createDiv({cls: "clickable-icon nav-action-button"});
        setIcon( this.button, 'list');

        this.button.addEventListener("click", (e)=>{ 
            this.button.classList.toggle('is-active');
            this.emit("collapse-click", e);
        });
    }

    isCollapsed(): boolean{
        return this.button.hasClass("is-active");
    }
   
}