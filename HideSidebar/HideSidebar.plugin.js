/**
 * @name HideSidebar
 * @author Snues
 * @authorId 98862725609816064
 * @description Hides the sidebar when not in use. Move your mouse to the left edge to reveal it.
 * @version 1.6.0
 * @website https://github.com/Snusene/BetterDiscordPlugins
 * @source https://raw.githubusercontent.com/Snusene/BetterDiscordPlugins/main/HideSidebar/HideSidebar.plugin.js
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
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.expandTime = 0;
    this.bounds = null;
    this.pending = false;
  }

  start() {
    const classes = Webpack.getModule(
      Filters.byKeys("sidebar", "guilds", "base"),
    );
    this.sidebarClass = classes.sidebar;
    this.sidebarListClass = classes.sidebarList;
    this.guildsClass = classes.guilds;

    this.stopped = false;
    this.addStyles();
    this.bindEvents();
    this.waitForElements();
  }

  stop() {
    this.stopped = true;
    this.api.DOM.removeStyle("HideSidebar");
    this.api.DOM.removeStyle("HideSidebar-state");
    this.unbindEvents();
    this.bounds = null;
    this.onMove = null;
    this.onLeave = null;
  }

  waitForElements() {
    const tryCollapse = () => {
      if (this.stopped) return;
      const sidebarList = document.querySelector(`.${this.sidebarListClass}`);
      const guilds = document.querySelector(`.${this.guildsClass}`);
      if (sidebarList && guilds) {
        this.applyHiddenStyle();
      } else {
        requestAnimationFrame(tryCollapse);
      }
    };
    tryCollapse();
  }

  getBounds() {
    const sidebarEl = document.querySelector(`.${this.sidebarClass}`);
    const guildsEl = document.querySelector(`.${this.guildsClass}`);
    if (!sidebarEl || !guildsEl) return null;
    const sb = sidebarEl.getBoundingClientRect();
    const g = guildsEl.getBoundingClientRect();
    return { right: Math.max(sb.right, g.right) };
  }

  addStyles() {
    const css = `
      .${this.sidebarListClass},
      .${this.guildsClass} {
        transition: width 200ms ease-out, transform 200ms ease-out !important;
        will-change: width, transform;
        overflow: hidden !important;
      }

      .${this.sidebarListClass} > *,
      .${this.guildsClass} > * {
        min-width: max-content !important;
        flex-shrink: 0 !important;
      }
    `;
    this.api.DOM.addStyle("HideSidebar", css);
  }

  applyHiddenStyle() {
    const hiddenCss = `
      .${this.sidebarListClass},
      .${this.guildsClass} {
        width: 0 !important;
        transform: translateX(-50px) !important;
        overflow: hidden !important;
        pointer-events: none !important;
      }
    `;
    this.api.DOM.addStyle("HideSidebar-state", hiddenCss);
  }

  removeHiddenStyle() {
    this.api.DOM.removeStyle("HideSidebar-state");
  }

  bindEvents() {
    this.onMove = this.onMouseMove.bind(this);
    this.onLeave = this.onMouseLeave.bind(this);
    document.addEventListener("mousemove", this.onMove, { passive: true });
    document.addEventListener("mouseleave", this.onLeave);
  }

  unbindEvents() {
    document.removeEventListener("mousemove", this.onMove);
    document.removeEventListener("mouseleave", this.onLeave);
    if (this.collapseTimeout) {
      clearTimeout(this.collapseTimeout);
      this.collapseTimeout = null;
    }
  }

  onMouseLeave() {
    if (this.expanded) {
      this.collapse();
    }
  }

  onMouseMove(e) {
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    if (e.clientX <= 15 && !this.expanded) {
      this.expand();
      return;
    }

    if (!this.expanded || this.pending) return;

    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.checkHover();
    });
  }

  checkHover() {
    if (!this.expanded) return;
    if (Date.now() - this.expandTime < 300) return;

    if (!this.bounds) {
      this.bounds = this.getBounds();
    }

    if (this.lastMouseX <= this.bounds.right) {
      if (this.collapseTimeout) {
        clearTimeout(this.collapseTimeout);
        this.collapseTimeout = null;
      }
    } else if (!this.collapseTimeout) {
      this.collapseTimeout = setTimeout(() => this.tryCollapse(), 150);
    }
  }

  tryCollapse() {
    this.collapseTimeout = null;
    const el = document.elementFromPoint(this.lastMouseX, this.lastMouseY);
    const onPopout = el?.closest(
      '[class*="popout"],' +
        '[class*="menu"],' +
        '[class*="layerContainer"],' +
        '[class*="streamPreview"],' +
        '[class*="animator"],' +
        '[class*="ResizeHandle"],' +
        '[class*="dragging"],' +
        '[class*="tooltip"],' +
        '[class*="modal"]',
    );

    if (onPopout) {
      this.collapseTimeout = setTimeout(() => this.tryCollapse(), 200);
    } else {
      this.collapse();
    }
  }

  expand() {
    if (this.expanded) return;
    this.expanded = true;
    this.expandTime = Date.now();
    this.removeHiddenStyle();
  }

  collapse() {
    if (!this.expanded) return;
    this.expanded = false;
    this.bounds = null;

    if (this.collapseTimeout) {
      clearTimeout(this.collapseTimeout);
      this.collapseTimeout = null;
    }

    this.applyHiddenStyle();
  }
};
