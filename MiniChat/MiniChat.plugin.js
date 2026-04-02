/**
 * @name MiniChat
 * @description Pop out any chat into a small Always on Top window.
 * @version 0.8.2
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
.mc-popout [class*="upperContainer"] {
  -webkit-app-region: drag;
}
.mc-popout [class*="upperContainer"] * {
  -webkit-app-region: no-drag;
}
.mc-popout [class*="upperContainer"] [class*="children"] {
  -webkit-app-region: drag;
}
.mc-popout [class*="upperContainer"] [class*="titleWrapper"] {
  -webkit-app-region: no-drag;
}
.mc-popout [aria-label="Close"] {
  -webkit-app-region: no-drag !important;
  pointer-events: auto !important;
}
.mc-popout [class*="toolbar"] [class*="iconWrapper"] {
  width: 28px;
  height: 28px;
}
.mc-popout [class*="toolbar"] [class*="iconWrapper"] svg {
  width: 18px;
  height: 18px;
}
.mc-icon {
  width: var(--space-24);
  height: var(--space-24);
  border-radius: 7px;
  margin-right: var(--space-4);
}
.mc-popout [class*="channelIcon"] {
  margin-right: 2px !important;
}
.mc-popout [class*="channelIcon"] svg {
  width: var(--space-16);
  height: var(--space-16);
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
    d: "M15 2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0V4.41l-4.3 4.3a1 1 0 1 1-1.4-1.42L19.58 3H16a1 1 0 0 1-1-1Z",
  }),
  h("path", {
    d: "M5 2a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-6a1 1 0 1 0-2 0v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6a1 1 0 1 0 0-2H5Z",
  }),
);

const CloseIcon = svgIcon(
  h("path", {
    d: "M17.3 18.7a1 1 0 0 0 1.4-1.4L13.42 12l5.3-5.3a1 1 0 0 0-1.42-1.4L12 10.58l-5.3-5.3a1 1 0 0 0-1.4 1.42L10.58 12l-5.3 5.3a1 1 0 1 0 1.42 1.4L12 13.42l5.3 5.3Z",
  }),
);

const NON_CHAT = [2, 13, 15, 16];
const mainDoc = document;
let suspendFake = false;

class Boundary extends React.Component {
  state = { e: 0 };
  static getDerivedStateFromError() {
    return { e: 1 };
  }
  componentDidCatch() {
    setTimeout(() => this.setState({ e: 0 }), 200);
  }
  render() {
    return this.state.e ? h("div", { id: "mc-root" }) : this.props.children;
  }
}

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

function Popout({ SplitView, channelId, guildIcon }) {
  const ref = React.useRef(null);
  const [tc, setTc] = React.useState(getTheme);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || !guildIcon) return;
    const inject = () => {
      const doc = el.ownerDocument;
      if (!doc || doc.querySelector(".mc-icon")) return;
      const target = doc.querySelector('[class*="children__"]');
      if (!target) return;
      const img = doc.createElement("img");
      img.src = guildIcon.url;
      img.alt = guildIcon.name;
      img.className = "mc-icon";
      target.prepend(img);
    };
    inject();
    const obs = new MutationObserver(inject);
    obs.observe(el, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [guildIcon]);

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
    Boundary,
    null,
    h(
      "div",
      { id: "mc-root", className: tc?.app || "", ref },
      tc ? h("div", { className: tc.bg }) : null,
      h(
        "div",
        { className: (tc?.layers || "") + " mc-popout" },
        h(SplitView, { channelId, baseChannelId: channelId }),
      ),
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
      commands: sb.commands ? { ...sb.commands } : undefined,
    };
    sb.gifs.button = sb.stickers.button = sb.stickers.autoSuggest = true;
    if (sb.commands) sb.commands.enabled = false;
  }

  restoreInput() {
    const { ChatInputTypes } = this.modules || {};
    if (!ChatInputTypes?.SIDEBAR || !this._origInput) return;
    const sb = ChatInputTypes.SIDEBAR;
    Object.assign(sb.gifs, this._origInput.gifs);
    Object.assign(sb.stickers, this._origInput.stickers);
    if (this._origInput.commands && sb.commands)
      Object.assign(sb.commands, this._origInput.commands);
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
      if (ret == null && id === null && this.popouts.size && !suspendFake)
        return fake;
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
    const dispatcher = BdApi.Webpack.Stores.UserStore._dispatcher;
    this.api.Patcher.before(dispatcher, "dispatch", (_, [event]) => {
      if (event?.type === "CONNECTION_OPEN") {
        suspendFake = true;
        setTimeout(() => {
          suspendFake = false;
        }, 0);
      }
    });
    const { UserGuildSettingsStore: ugss } = this.modules;
    if (ugss) {
      for (const [fn, fb] of [
        ["getChannelOverrides", {}],
        ["getMessageNotifications", 0],
        ["isMuted", false],
      ]) {
        this.api.Patcher.instead(ugss, fn, (_, a, orig) => {
          try {
            return orig(...a);
          } catch {
            return fb;
          }
        });
      }
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
        IconUtils: {
          filter: Filters.byKeys("getGuildIconURL"),
        },
        Native: {
          filter: (m) =>
            m?.setAlwaysOnTop
              ?.toString?.()
              ?.includes?.("window.setAlwaysOnTop"),
        },
      }),
      PopoutWindowStore: Webpack.getStore("PopoutWindowStore"),
      UserGuildSettingsStore: Webpack.getStore("UserGuildSettingsStore"),
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

  guildIcon(channelId) {
    const { ChannelStore, GuildStore, IconUtils } = this.modules;
    const gid = ChannelStore.getChannel(channelId)?.getGuildId();
    const guild = gid && GuildStore.getGuild(gid);
    if (!guild?.icon || !IconUtils) return null;
    const url = IconUtils.getGuildIconURL({
      id: guild.id,
      icon: guild.icon,
      size: 48,
    });
    return url ? { url, name: guild.name } : null;
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
        props.toolbar = h(Bar.Icon, {
          icon: CloseIcon,
          onClick: () => this.close(popoutChId),
          tooltip: "Close",
          "aria-label": "Close",
        });
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
          h(Popout, {
            SplitView,
            channelId,
            guildIcon: this.guildIcon(channelId),
          }),
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
      if (this.settings?.alwaysOnTop)
        this.modules.Native?.setAlwaysOnTop(wk, true);
    };
    setTimeout(setup, 300);
  }
};
