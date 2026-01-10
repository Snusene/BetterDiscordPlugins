/**
 * @name HideSidebar
 * @author Snues
 * @authorId 98862725609816064
 * @description Hides the sidebar when not in use. Move your mouse to the left edge to reveal it.
 * @version 1.2.0
 * @website https://github.com/Snusene/BetterDiscordPlugins
 * @source https://github.com/Snusene/BetterDiscordPlugins/tree/main/HideSidebar
 */

const {
  Webpack,
  Webpack: { Filters },
} = BdApi;

module.exports = class HideSidebar {
  constructor(meta) {
    this.api = new BdApi(meta.name);
    this.expanded = false;
    this.collapseTimeout = null;
    this.sidebarClass = null;
  }

  start() {
    this.sidebarClass = Webpack.getModule(
      Filters.byKeys("sidebar", "guilds", "base"),
    ).sidebar;

    this.addStyles();
    this.bindEvents();
    this.collapse();
  }

  stop() {
    this.api.DOM.removeStyle("styles");
    this.unbindEvents();
    clearTimeout(this.collapseTimeout);
    document
      .querySelector(`.${this.sidebarClass}`)
      ?.classList.remove("hidden");
  }

  addStyles() {
    const css = `
      .${this.sidebarClass} {
        transition: transform 250ms ease, opacity 250ms ease !important;
      }

      .hidden.${this.sidebarClass} {
        transform: translateX(-100%) !important;
        position: absolute !important;
        opacity: 0 !important;
        pointer-events: none !important;
        transition-delay: 100ms !important;
      }
    `;

    this.api.DOM.addStyle("styles", css);
  }

  bindEvents() {
    this.onMove = this.onMouseMove.bind(this);
    document.addEventListener("mousemove", this.onMove);
    this.startPolling();
  }

  unbindEvents() {
    document.removeEventListener("mousemove", this.onMove);
    clearInterval(this.pollId);
  }

  startPolling() {
    this.expandTime = 0;
    this.unhoverTime = 0;
    this.pollId = setInterval(() => {
      if (!this.expanded) return;
      if (Date.now() - this.expandTime < 300) return;
      const sidebar = document.querySelector(`.${this.sidebarClass}`);
      const sidebarRight = sidebar?.getBoundingClientRect().right || 350;
      const popout = document.querySelector(
        '[class*="layer-"]:hover, [class*="popout"]:hover',
      );
      const hovered =
        sidebar?.matches(":hover") ||
        (popout && popout.getBoundingClientRect().left < sidebarRight + 50);
      if (hovered) {
        this.unhoverTime = 0;
      } else {
        if (!this.unhoverTime) this.unhoverTime = Date.now();
        if (Date.now() - this.unhoverTime > 500) this.collapse();
      }
    }, 200);
  }

  onMouseMove(e) {
    const x = e.clientX;
    const el = document.elementFromPoint(x, e.clientY);
    const sidebar = document.querySelector(`.${this.sidebarClass}`);
    const sidebarRight = sidebar?.getBoundingClientRect().right || 312;
    const inSidebar = x <= 10 || (this.expanded && x <= sidebarRight);
    const popout = el?.closest('[class*="layer-"], [class*="popout"]');
    const inPopout = popout && popout.getBoundingClientRect().left < sidebarRight + 50;

    if (inSidebar || inPopout) {
      clearTimeout(this.collapseTimeout);
      this.collapseTimeout = null;
      if (!this.expanded) this.expand();
    } else if (this.expanded && !this.collapseTimeout) {
      this.collapseTimeout = setTimeout(() => {
        this.collapse();
        this.collapseTimeout = null;
      }, 500);
    }
  }

  expand() {
    this.expanded = true;
    this.expandTime = Date.now();
    document
      .querySelector(`.${this.sidebarClass}`)
      ?.classList.remove("hidden");
  }

  collapse() {
    this.expanded = false;
    document
      .querySelector(`.${this.sidebarClass}`)
      ?.classList.add("hidden");
  }
};
