import { App, setIcon } from "obsidian";
import { EventEmitter } from "events";
//import { collapseLeafMatchBlocks } from "utils/collapseUtils";

export class CollapseButton extends EventEmitter  {
  private app: App;
  private parent: Element;
  private button: HTMLDivElement;
  private icon: string;
  constructor(app: App, parent: Element, icon: string) {
      super();
      this.app=app;
      this.parent=parent;
      this.icon=icon;
  }

  render(){
      this.button=this.parent.createDiv({cls: "clickable-icon nav-action-button"});
      setIcon( this.button, this.icon);

      this.button.addEventListener("click", (e)=>{ 
          this.button.classList.toggle('is-active');
          this.emit("collapse-click", e);
      });
  }

  isCollapsed(): boolean{
      return this.button.hasClass("is-active");
  }
 
}