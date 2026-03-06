/**
 * @name MiniChat
 * @description Pop out any chat into a small Always on Top window.
 * @version 0.7.0
 * @author Snues
 * @authorId 98862725609816064
 * @source https://raw.githubusercontent.com/Snusene/BetterDiscordPlugins/main/MiniChat/MiniChat.plugin.js
 * @donate https://ko-fi.com/snues
 */

const { React } = BdApi;
const h = React.createElement;

const STYLES = `
#mc-root {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.mc-popout {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}
.mc-popout > * {
  min-width: 0;
  width: 100%;
}
.mc-popout [class*="toolbar"] {
  display: none !important;
}
.mc-popout [class*="upperContainer"] {
  -webkit-app-region: drag;
}
.mc-popout [class*="upperContainer"] * {
  -webkit-app-region: no-drag;
}
.mc-popout [class*="upperContainer"] [class*="children"],
.mc-popout [class*="upperContainer"] [class*="title"] {
  -webkit-app-region: drag;
}
.mc-popout [aria-label="Close"] [class*="icon_"] {
  width: 50px !important;
  height: 50px !important;
}
.mc-popout [aria-label="Close"] {
  margin-right: 8px !important;
  -webkit-app-region: no-drag;
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
const mainDoc = document;

function syncBdStyles(doc) {
  doc.querySelectorAll("[data-mc-synced]").forEach((el) => el.remove());
  mainDoc.querySelectorAll("bd-head style").forEach((el) => {
    doc.head.appendChild(el.cloneNode(true)).setAttribute("data-mc-synced", "");
    try {
      if (!el.sheet) return;
      for (const rule of el.sheet.cssRules) {
        if (rule.type === CSSRule.IMPORT_RULE && rule.href) {
          const link = doc.createElement("link");
          link.rel = "stylesheet";
          link.href = rule.href;
          link.setAttribute("data-mc-synced", "");
          doc.head.appendChild(link);
        }
      }
    } catch (e) {}
  });
}

function getTheme() {
  const mainBg = mainDoc.querySelector('[class*="bg__"]');
  if (!mainBg) return null;
  const bgParent = mainBg.parentElement;
  const layers = bgParent?.querySelector('[class*="layers"]');
  return {
    app: bgParent?.className || "",
    bg: mainBg.className,
    layers: layers?.className || "",
  };
}

function Popout({ SplitView, channelId }) {
  const ref = React.useRef(null);
  const [tc, setTc] = React.useState(getTheme);

  React.useEffect(() => {
    const doc = ref.current?.ownerDocument;
    if (!doc || doc === mainDoc || doc.querySelector("#mc-popout-style"))
      return;

    doc.documentElement.className = mainDoc.documentElement.className;
    const mainMount = mainDoc.getElementById("app-mount");
    const popMount = doc.getElementById("app-mount");
    if (mainMount && popMount) popMount.className = mainMount.className;

    const s = doc.createElement("style");
    s.id = "mc-popout-style";
    s.textContent = STYLES;
    doc.head.appendChild(s);

    syncBdStyles(doc);

    let timer = null;
    const resync = () => {
      syncBdStyles(doc);
      doc.documentElement.className = mainDoc.documentElement.className;
      if (mainMount && popMount) popMount.className = mainMount.className;
      setTc(getTheme());
    };
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(resync, 100);
    });
    const bdHead = mainDoc.querySelector("bd-head");
    if (bdHead)
      observer.observe(bdHead, {
        childList: true,
        subtree: true,
        characterData: true,
      });

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return h(
    "div",
    { id: "mc-root", className: tc?.app || "", ref },
    tc ? h("div", { className: tc.bg }) : null,
    h(
      "div",
      { className: (tc?.layers || "") + " mc-popout" },
      h(SplitView, { channelId, baseChannelId: channelId }),
    ),
  );
}

module.exports = class MiniChat {
  constructor(meta) {
    this.api = new BdApi(meta.name);
    this.modules = null;
    this.popouts = new Map();
    this._abort = null;
  }

  start() {
    this.modules = MiniChat.getModules();
    this.settings = { alwaysOnTop: true, ...this.api.Data.load("settings") };
    if (!this.modules.PopoutWindow) {
      this._abort = new AbortController();
      BdApi.Webpack.waitForModule(MiniChat.popoutFilter, {
        signal: this._abort.signal,
        searchExports: true,
      })
        .then((mod) => {
          if (this.modules) this.modules.PopoutWindow = mod;
        })
        .catch(() => {});
    }
    this.patchInput();
    this.patchSplitView();
    this.patchToolbar();
    this.startAck();
  }

  stop() {
    this._abort?.abort();
    this._abort = null;
    this.restoreInput();
    this.stopAck();
    const pa = this.modules?.PopoutActions;
    if (pa) for (const wk of this.popouts.values()) pa.close(wk);
    this.popouts.clear();
    this.api.Patcher.unpatchAll();
    this.modules = this.settings = null;
  }

  startAck() {
    const { AckActions } = this.modules;
    if (!AckActions) return;
    this._dispatcher = BdApi.Webpack.Stores.UserStore._dispatcher;
    this._onMessage = (e) => {
      if (this.popouts.has(e.channelId)) AckActions.ack(e.channelId);
    };
    this._dispatcher.subscribe("MESSAGE_CREATE", this._onMessage);
  }

  stopAck() {
    this._dispatcher?.unsubscribe("MESSAGE_CREATE", this._onMessage);
    this._dispatcher = this._onMessage = null;
  }

  patchInput() {
    const { ChatInputTypes } = this.modules;
    if (!ChatInputTypes?.SIDEBAR) return;
    const sb = ChatInputTypes.SIDEBAR;
    this._origInput = {
      gifs: { ...sb.gifs },
      stickers: { ...sb.stickers },
      gifts: sb.gifts,
    };
    sb.gifs.button = true;
    sb.stickers.button = true;
    sb.stickers.autoSuggest = true;
    sb.gifts = { button: true };
  }

  restoreInput() {
    const { ChatInputTypes } = this.modules || {};
    if (!ChatInputTypes?.SIDEBAR || !this._origInput) return;
    const sb = ChatInputTypes.SIDEBAR;
    Object.assign(sb.gifs, this._origInput.gifs);
    Object.assign(sb.stickers, this._origInput.stickers);
    sb.gifts = this._origInput.gifts;
    this._origInput = null;
  }

  patchSplitView() {
    const { GuildStore } = this.modules;
    if (!GuildStore) return;
    const defaults = {
      name: "DM",
      roles: {},
      emojis: [],
      stickers: [],
      features: new Set(),
    };
    const fake = new Proxy(defaults, { get: (t, p) => (p in t ? t[p] : null) });
    this.api.Patcher.instead(GuildStore, "getGuild", (_, [id], original) => {
      const ret = original(id);
      if (ret == null && id === null) return fake;
      return ret;
    });
    const [threadMod, threadKey] = BdApi.Webpack.getWithKey(
      BdApi.Webpack.Filters.byStrings("Thread must have a parent ID"),
    );
    if (threadMod) {
      this.api.Patcher.instead(
        threadMod,
        threadKey,
        (_, [channel, opts], original) => {
          if (channel?.parent_id == null) return;
          return original(channel, opts);
        },
      );
    }
  }

  static popoutFilter = (e) => {
    try {
      const s = e?.render?.toString();
      return s?.includes("guestWindow") && s.includes("windowKey");
    } catch {
      return false;
    }
  };

  static getModules() {
    const {
      Webpack,
      Webpack: { Filters },
    } = BdApi;
    return {
      ...Webpack.getBulkKeyed({
        SplitView: {
          filter: Filters.byStrings("channelViewSource", "Split View"),
          searchExports: true,
        },
        ChatInputTypes: {
          filter: Filters.byKeys("FORM", "SIDEBAR"),
          searchExports: true,
        },
        PopoutActions: {
          filter: Filters.byKeys("open", "close", "setAlwaysOnTop"),
        },
        AckActions: {
          filter: Filters.byKeys("ack"),
        },
        PopoutWindow: { filter: MiniChat.popoutFilter, searchExports: true },
      }),
      PopoutWindowStore: Webpack.getStore("PopoutWindowStore"),
      GuildStore: Webpack.Stores.GuildStore,
      ChannelStore: Webpack.Stores.ChannelStore,
      SelectedChannelStore: Webpack.Stores.SelectedChannelStore,
    };
  }

  getSettingsPanel() {
    return BdApi.UI.buildSettingsPanel({
      settings: [
        {
          type: "switch",
          id: "alwaysOnTop",
          name: "Always On Top",
          note: "Keep popout windows above all others",
          value: this.settings.alwaysOnTop,
        },
      ],
      onChange: (_, id, val) => {
        this.settings[id] = val;
        this.api.Data.save("settings", this.settings);
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
      const popoutChId = props.toolbar?.props?.baseChannelId;
      if (popoutChId && this.popouts.has(popoutChId)) {
        props.toolbar = null;
        props.children = h(
          React.Fragment,
          null,
          h(Bar.Icon, {
            icon: ReturnIcon,
            iconSize: 50,
            onClick: () => this.close(popoutChId),
            tooltip: "Close",
            "aria-label": "Close",
          }),
          props.children,
        );
        return;
      }
      if (!props.toolbar) return;
      const chId = this.modules.SelectedChannelStore.getChannelId();
      const ch = this.modules.ChannelStore.getChannel(chId);
      if (!ch || NON_CHAT.includes(ch.type)) return;
      props.toolbar = h(
        React.Fragment,
        null,
        h(Bar.Icon, {
          icon: MiniIcon,
          onClick: () => this.open(ch.id),
          tooltip: "MiniChat",
          "aria-label": "MiniChat",
        }),
        props.toolbar,
      );
    });
  }

  close(channelId) {
    const wk = this.popouts.get(channelId);
    if (!wk) return;
    this.modules.PopoutActions.close(wk);
    this.popouts.delete(channelId);
  }

  open(channelId) {
    const {
      SplitView,
      PopoutActions,
      PopoutWindow,
      PopoutWindowStore,
      ChannelStore,
    } = this.modules;
    const wk = "DISCORD_MC_" + channelId;
    if (PopoutWindowStore.getWindowOpen(wk)) {
      this.close(channelId);
      return;
    }
    this.popouts.delete(channelId);
    if (!PopoutWindow) return;

    const channel = ChannelStore.getChannel(channelId);
    const name = channel ? channel.name || "DM" : "Chat";
    PopoutActions.open(
      wk,
      () =>
        h(
          PopoutWindow,
          { windowKey: wk, withTitleBar: false, title: name, channelId },
          h(Popout, { SplitView, channelId }),
        ),
      { width: 500, height: 450 },
    );
    this.popouts.set(channelId, wk);

    let tries = 0;
    const setup = () => {
      if (!this.popouts.has(channelId) || tries++ > 20) return;
      const w = PopoutWindowStore.getWindow(wk);
      if (!w) return setTimeout(setup, 100);
      w.resizeTo(500, 450);
      if (this.settings?.alwaysOnTop) PopoutActions.setAlwaysOnTop(wk, true);
    };
    setTimeout(setup, 300);
  }
};
