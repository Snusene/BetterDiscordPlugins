/**
 * @name HideSidebar
 * @author Snues
 * @authorId 98862725609816064
 * @description Hides the sidebar when not in use. Move your mouse to the left edge to reveal it.
 * @version 1.3.1
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
    this.sidebarClass = null;
    this.guildsClass = null;
  }

  start() {
    const classes = Webpack.getModule(
      Filters.byKeys("sidebar", "guilds", "base"),
    );
    this.sidebarClass = classes.sidebar;
    this.guildsClass = classes.guilds;

    this.addStyles();
    this.bindEvents();
    this.collapse();
  }

  stop() {
    this.api.DOM.removeStyle("styles");
    this.unbindEvents();
    document.querySelector(`.${this.sidebarClass}`)?.classList.remove("hidden");
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
      const guilds = document.querySelector(`.${this.guildsClass}`);
      const hoveredElements = document.querySelectorAll(":hover");
      const onPopout = Array.from(hoveredElements).some(
        (el) =>
          el.closest('[class*="popout"]') ||
          el.closest('[class*="menu"]') ||
          el.closest('[class*="streamPreview"]') ||
          el.closest('[class*="animator"]') ||
          el.closest('[class*="ResizeHandle"]') ||
          el.closest('[class*="dragging"]'),
      );
      const hovered =
        sidebar?.matches(":hover") || guilds?.matches(":hover") || onPopout;
      if (hovered) {
        this.unhoverTime = 0;
      } else {
        if (!this.unhoverTime) this.unhoverTime = Date.now();
        if (Date.now() - this.unhoverTime > 500) this.collapse();
      }
    }, 200);
  }

  onMouseMove(e) {
    if (e.clientX <= 10 && !this.expanded) {
      this.expand();
    }
  }

  expand() {
    this.expanded = true;
    this.expandTime = Date.now();
    document.querySelector(`.${this.sidebarClass}`)?.classList.remove("hidden");
  }

  collapse() {
    this.expanded = false;
    document.querySelector(`.${this.sidebarClass}`)?.classList.add("hidden");
  }
};
