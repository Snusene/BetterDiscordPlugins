/**
 * @name PopoutChat
 * @description Pop out your chat or DMs into a small always on top window.
 * @version 0.3.0
 * @author Snues
 * @authorId 98862725609816064
 * @website https://github.com/Snusene/BetterDiscordPlugins/tree/main/PopoutChat
 * @source https://raw.githubusercontent.com/Snusene/BetterDiscordPlugins/main/PopoutChat/PopoutChat.plugin.js
 */

const STYLES = `
  body.pc [class*="sidebar__"] { display: none !important; }
  body.pc [class*="membersWrap"] { display: none !important; }
  body.pc [class*="base__"] > [class*="bar_"] a:has([aria-label="Help"]) {
    display: none !important;
  }
  body.pc [class*="chat_"] {
    overflow: hidden !important;
  }
  body.pc [class*="chat_"] > [class*="uploadArea"] {
    position: absolute !important;
    pointer-events: none !important;
    opacity: 0 !important;
  }
  body.pc [class*="chat_"] > [class*="content_"] {
    flex: 1 1 auto !important;
  }
  body.pc [class*="chat_"] > [class*="content_"] > [class*="container_"]:not([class*="chatContent"]) {
    display: none !important;
  }
  body.pc [class*="chatContent"] {
    flex: 1 1 auto !important;
  }
  body.pc section[class*="title_"] {
    -webkit-app-region: drag;
  }
  body.pc section[class*="title_"] a,
  body.pc section[class*="title_"] button,
  body.pc section[class*="title_"] [role="button"],
  body.pc section[class*="title_"] [class*="toolbar"] {
    -webkit-app-region: no-drag;
  }
  .pc-btn {
    cursor: pointer;
    color: var(--channels-default, #b5bac1);
    display: flex;
    align-items: center;
    padding: 0 4px;
    -webkit-app-region: no-drag;
  }
  .pc-btn:hover { color: var(--white, #f2f3f5); }
`;

module.exports = class PopoutChat {
  constructor(meta) {
    this.meta = meta;
    this.api = new BdApi(meta.name);
    this.active = false;
    this.bounds = null;
    this.maximized = false;
    this.settings = Object.assign(
      { alwaysOnTop: true },
      this.api.Data.load("settings"),
    );
  }

  start() {
    this.api.DOM.addStyle(this.meta.name, STYLES);
    this.patchToolbar();
  }

  stop() {
    if (this.active) this.restore();
    this.api.Patcher.unpatchAll();
    this.api.DOM.removeStyle(this.meta.name);
    this.settings = null;
    this.bounds = null;
  }

  getSettingsPanel() {
    return BdApi.UI.buildSettingsPanel({
      settings: [
        {
          type: "switch",
          id: "alwaysOnTop",
          name: "Always on Top",
          note: "Keep the popout window above all other windows",
          value: this.settings.alwaysOnTop,
        },
      ],
      onChange: (_, id, val) => {
        this.settings[id] = val;
        this.api.Data.save("settings", this.settings);
        if (this.active) DiscordNative.window.setAlwaysOnTop(null, val);
      },
    });
  }

  patchToolbar() {
    const [mod, key] = BdApi.Webpack.getWithKey((m) => {
      try {
        if (typeof m !== "function") return false;
        var s = m.toString();
        return (
          s.includes("toolbar") &&
          s.includes("innerClassName") &&
          s.includes("childrenBottom")
        );
      } catch (e) {
        return false;
      }
    }) || [null, null];
    if (!mod || !key) return;

    const plugin = this;
    const { React } = BdApi;
    const Tooltip = BdApi.Components.Tooltip;

    this.api.Patcher.before(mod, key, (_, [props]) => {
      if (!props || !props.toolbar) return;
      var ch = BdApi.Webpack.Stores.ChannelStore.getChannel(
        BdApi.Webpack.Stores.SelectedChannelStore.getChannelId(),
      );
      if (
        !ch ||
        ch.type === 2 ||
        ch.type === 13 ||
        ch.type === 15 ||
        ch.type === 16
      )
        return;
      if (plugin.active) {
        var returnBtn = React.createElement(
          Tooltip,
          { text: "Return to Discord" },
          (tooltipProps) =>
            React.createElement(
              "div",
              Object.assign({}, tooltipProps, {
                className: "pc-btn",
                role: "button",
                "aria-label": "Return to Discord",
                onClick: () => plugin.restore(),
              }),
              React.createElement(
                "svg",
                {
                  width: "24",
                  height: "24",
                  viewBox: "0 0 24 24",
                  fill: "none",
                },
                React.createElement("path", {
                  fill: "currentColor",
                  d: "M5 2a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-6a1 1 0 1 0-2 0v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6a1 1 0 1 0 0-2H5Z",
                }),
                React.createElement("path", {
                  fill: "currentColor",
                  d: "M15 13a1 1 0 0 1 0 2H9a1 1 0 0 1-1-1V8a1 1 0 1 1 2 0v3.59l8.3-8.3a1 1 0 1 1 1.4 1.42L11.42 13H15Z",
                }),
              ),
            ),
        );
        props.toolbar = React.createElement(React.Fragment, null, returnBtn);
      } else {
        var btn = React.createElement(
          Tooltip,
          { text: "Pop Out" },
          (tooltipProps) =>
            React.createElement(
              "div",
              Object.assign({}, tooltipProps, {
                className: "pc-btn",
                role: "button",
                "aria-label": "Pop Out",
                onClick: () => plugin.popout(),
              }),
              React.createElement(
                "svg",
                {
                  width: "24",
                  height: "24",
                  viewBox: "0 0 24 24",
                  fill: "currentColor",
                },
                React.createElement("path", {
                  d: "M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z",
                }),
              ),
            ),
        );
        props.toolbar = React.createElement(
          React.Fragment,
          null,
          btn,
          props.toolbar,
        );
      }
    });
  }

  popout() {
    if (this.active) return;
    this.bounds = {
      w: window.outerWidth,
      h: window.outerHeight,
      x: window.screenX,
      y: window.screenY,
    };
    document.body.classList.add("pc");
    this.maximized =
      document.fullscreenElement != null ||
      (window.outerWidth >= screen.availWidth &&
        window.outerHeight >= screen.availHeight);
    if (this.maximized) DiscordNative.window.restore(null);
    DiscordNative.window.setMinimumSize(300, 300);
    if (this.settings.alwaysOnTop)
      DiscordNative.window.setAlwaysOnTop(null, true);
    window.resizeTo(550, 450);
    this.active = true;
  }

  restore() {
    if (!this.active) return;
    document.body.classList.remove("pc");
    DiscordNative.window.setAlwaysOnTop(null, false);
    DiscordNative.window.setMinimumSize(940, 500);
    if (this.bounds) {
      window.resizeTo(this.bounds.w, this.bounds.h);
      window.moveTo(this.bounds.x, this.bounds.y);
    }
    if (this.maximized) DiscordNative.window.maximize(null);
    this.active = false;
    this.bounds = null;
    this.maximized = false;
  }
};
