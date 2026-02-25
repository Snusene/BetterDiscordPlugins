/**
 * @name MiniChat
 * @description Minify your chat or DMs into a small always on top window.
 * @version 0.5.0
 * @author Snues
 * @authorId 98862725609816064
 * @website https://github.com/Snusene/BetterDiscordPlugins/tree/main/MiniChat
 * @source https://raw.githubusercontent.com/Snusene/BetterDiscordPlugins/main/MiniChat/MiniChat.plugin.js
 */

const { React } = BdApi;

const STYLES = `
  body.pc [class*="sidebar__"] { display: none !important; }
  body.pc [class*="membersWrap"] { display: none !important; }
  body.pc [class*="search__"] { display: none !important; }
  body.pc [class*="base__"] > [class*="bar_"] {
    display: none !important;
  }
  body.pc [class*="base__"] {
    grid-template-rows: [top] 0px [titleBarEnd] 0px [noticeEnd] 1fr [end] !important;
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
  body.pc section[class*="title_"] [aria-label="Return to Discord"] [class*="icon_"] {
    width: 50px !important;
    height: 50px !important;
  }
  body.pc section[class*="title_"] [aria-label="Return to Discord"] {
    margin-right: 8px !important;
  }
`;

const MiniIcon = (props) =>
  React.createElement(
    "svg",
    {
      width: props.width || 24,
      height: props.height || 24,
      viewBox: "0 0 24 24",
      fill: "currentColor",
      className: props.className,
    },
    React.createElement("path", {
      d: "M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z",
    }),
  );

const ReturnIcon = (props) =>
  React.createElement(
    "svg",
    {
      width: props.width || 24,
      height: props.height || 24,
      viewBox: "0 0 24 24",
      fill: "currentColor",
      className: props.className,
    },
    React.createElement("path", {
      fillRule: "evenodd",
      d: "M5 2a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V5a3 3 0 0 0-3-3H5zM8 7a1 1 0 0 0-1 1v5a1 1 0 0 0 2 0v-3.59l5.3 5.3a1 1 0 0 0 1.4-1.42L10.42 9H14a1 1 0 0 0 0-2H8z",
    }),
  );

const VOICE_CHANNEL_TYPES = [2, 13, 15, 16];

module.exports = class MiniChat {
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
    DiscordNative.window.setAlwaysOnTop(null, false);
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
        if (!m.Icon || !m.Title || !m.Divider || !m.Caret) return false;
        return !m.toString().includes("isAuthenticated");
      } catch (e) {
        return false;
      }
    });
    if (!mod || !key) return;

    const HeaderBar = mod[key];
    const plugin = this;

    this.api.Patcher.before(mod, key, (_, [props]) => {
      if (!props || !props.toolbar) return;
      const ch = BdApi.Webpack.Stores.ChannelStore.getChannel(
        BdApi.Webpack.Stores.SelectedChannelStore.getChannelId(),
      );
      if (!ch || VOICE_CHANNEL_TYPES.includes(ch.type)) return;
      if (plugin.active) {
        props.toolbar = null;
        props.children = React.createElement(
          React.Fragment,
          null,
          React.createElement(HeaderBar.Icon, {
            icon: ReturnIcon,
            iconSize: 50,
            onClick: () => plugin.restore(),
            tooltip: "Return to Discord",
            "aria-label": "Return to Discord",
          }),
          props.children,
        );
      } else {
        props.toolbar = React.createElement(
          React.Fragment,
          null,
          React.createElement(HeaderBar.Icon, {
            icon: MiniIcon,
            onClick: () => plugin.mini(),
            tooltip: "Mini Mode",
            "aria-label": "Mini Mode",
          }),
          props.toolbar,
        );
      }
    });
  }

  mini() {
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
