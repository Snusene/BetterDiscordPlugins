/**
 * @name MiniChat
 * @description Minify your chat or DMs into a small always on top window.
 * @version 0.6.0
 * @author Snues
 * @authorId 98862725609816064
 * @website https://github.com/Snusene/BetterDiscordPlugins/tree/main/MiniChat
 * @source https://raw.githubusercontent.com/Snusene/BetterDiscordPlugins/main/MiniChat/MiniChat.plugin.js
 */

const { React } = BdApi;
const h = React.createElement;

const STYLES = `
  body.mc [class*="sidebar__"] { display: none !important; }
  body.mc [class*="membersWrap"] { display: none !important; }
  body.mc [class*="search__"] { display: none !important; }
  body.mc [class*="base__"] > [class*="bar_"] {
    display: none !important;
  }
  body.mc [class*="base__"] {
    grid-template-rows: [top] 0px [titleBarEnd] 0px [noticeEnd] 1fr [end] !important;
  }
  body.mc [class*="chat_"] {
    overflow: hidden !important;
  }
  body.mc [class*="chat_"] > [class*="uploadArea"] {
    position: absolute !important;
    pointer-events: none !important;
    opacity: 0 !important;
  }
  body.mc [class*="chat_"] > [class*="content_"] {
    flex: 1 1 auto !important;
  }
  body.mc [class*="chat_"] > [class*="content_"] > [class*="container_"]:not([class*="chatContent"]) {
    display: none !important;
  }
  body.mc [class*="chatContent"] {
    flex: 1 1 auto !important;
  }
  body.mc section[class*="title_"] {
    -webkit-app-region: drag;
    padding-left: 10px !important;
  }
  body.mc section[class*="title_"] a,
  body.mc section[class*="title_"] button,
  body.mc section[class*="title_"] [role="button"],
  body.mc section[class*="title_"] [class*="toolbar"] {
    -webkit-app-region: no-drag;
  }
  body.mc section[class*="title_"] [aria-label="Return to Discord"] [class*="icon_"] {
    width: 50px !important;
    height: 50px !important;
  }
  body.mc section[class*="title_"] [aria-label="Return to Discord"] {
    margin-right: 8px !important;
  }
`;

const svgIcon =
  (...children) =>
  (p) =>
    h(
      "svg",
      {
        width: p.width || 24,
        height: p.height || 24,
        viewBox: "0 0 24 24",
        fill: "currentColor",
        className: p.className,
      },
      ...children,
    );

const MiniIcon = svgIcon(
  h("path", {
    d: "M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z",
  }),
);

const ReturnIcon = svgIcon(
  h("path", {
    fillRule: "evenodd",
    d: "M5 2a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V5a3 3 0 0 0-3-3H5zM8 7a1 1 0 0 0-1 1v5a1 1 0 0 0 2 0v-3.59l5.3 5.3a1 1 0 0 0 1.4-1.42L10.42 9H14a1 1 0 0 0 0-2H8z",
  }),
);

const NON_CHAT = [2, 13, 15, 16];

module.exports = class MiniChat {
  constructor(meta) {
    this.meta = meta;
    this.api = new BdApi(meta.name);
    this.saved = null;
  }

  start() {
    this.settings = Object.assign(
      { alwaysOnTop: true },
      this.api.Data.load("settings"),
    );
    const bounds = this.api.Data.load("bounds");
    if (bounds) {
      DiscordNative.window.setMinimumSize(940, 500);
      window.resizeTo(bounds.w, bounds.h);
      window.moveTo(bounds.x, bounds.y);
      if (bounds.maximized) DiscordNative.window.maximize(null);
      this.api.Data.delete("bounds");
    }
    DiscordNative.window.setAlwaysOnTop(null, false);
    this.api.DOM.addStyle(this.meta.name, STYLES);
    this.patchToolbar();
  }

  stop() {
    if (this.saved) this.restore(false);
    this.api.Patcher.unpatchAll();
    this.api.DOM.removeStyle(this.meta.name);
    this.settings = null;
  }

  getSettingsPanel() {
    return BdApi.UI.buildSettingsPanel({
      settings: [
        {
          type: "switch",
          id: "alwaysOnTop",
          name: "Always On Top",
          note: "Keep the window above all others",
          value: this.settings.alwaysOnTop,
        },
      ],
      onChange: (_, id, val) => {
        this.settings[id] = val;
        this.api.Data.save("settings", this.settings);
        if (this.saved) DiscordNative.window.setAlwaysOnTop(null, val);
      },
    });
  }

  patchToolbar() {
    const [mod, key] = BdApi.Webpack.getWithKey((m) => {
      try {
        return (
          typeof m === "function" &&
          m.Icon &&
          m.Title &&
          m.Divider &&
          m.Caret &&
          !m.toString().includes("isAuthenticated")
        );
      } catch {
        return false;
      }
    });
    if (!mod) return;
    const Bar = mod[key];
    this.api.Patcher.before(mod, key, (_, [props]) => {
      if (!props) return;
      if (this.saved) {
        props.toolbar = null;
        props.children = h(
          React.Fragment,
          null,
          h(Bar.Icon, {
            icon: ReturnIcon,
            iconSize: 50,
            onClick: () => this.restore(),
            tooltip: "Return to Discord",
            "aria-label": "Return to Discord",
          }),
          props.children,
        );
        return;
      }
      if (!props.toolbar) return;
      const ch = BdApi.Webpack.Stores.ChannelStore.getChannel(
        BdApi.Webpack.Stores.SelectedChannelStore.getChannelId(),
      );
      if (!ch || NON_CHAT.includes(ch.type)) return;
      props.toolbar = h(
        React.Fragment,
        null,
        h(Bar.Icon, {
          icon: MiniIcon,
          onClick: () => this.mini(),
          tooltip: "Mini Mode",
          "aria-label": "Mini Mode",
        }),
        props.toolbar,
      );
    });
  }

  mini() {
    if (this.saved) return;
    const maximized =
      !!document.fullscreenElement ||
      (window.outerWidth >= screen.availWidth &&
        window.outerHeight >= screen.availHeight);
    this.saved = {
      w: window.outerWidth,
      h: window.outerHeight,
      x: window.screenX,
      y: window.screenY,
      maximized,
    };
    this.api.Data.save("bounds", this.saved);
    document.body.classList.add("mc");
    if (maximized) DiscordNative.window.restore(null);
    DiscordNative.window.setMinimumSize(300, 300);
    if (this.settings.alwaysOnTop)
      DiscordNative.window.setAlwaysOnTop(null, true);
    window.resizeTo(490, 430);
  }

  restore(clearSaved = true) {
    if (!this.saved) return;
    document.body.classList.remove("mc");
    DiscordNative.window.setAlwaysOnTop(null, false);
    DiscordNative.window.setMinimumSize(940, 500);
    window.resizeTo(this.saved.w, this.saved.h);
    window.moveTo(this.saved.x, this.saved.y);
    if (this.saved.maximized) DiscordNative.window.maximize(null);
    if (clearSaved) this.api.Data.delete("bounds");
    this.saved = null;
  }
};
