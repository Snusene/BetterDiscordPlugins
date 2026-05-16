/**
 * @name AutoTranslate
 * @author Snues
 * @authorId 98862725609816064
 * @description Automatically translate messages in chat.
 * @version 0.2.1
 * @invite xp2f3YFKMY
 * @source https://github.com/Snusene/BetterDiscordPlugins/tree/main/AutoTranslate
 * @donate https://ko-fi.com/snues
 */

const { React } = BdApi;
const h = React.createElement;

const TYPES = new Set([0, 19, 20, 21, 23]);

const ASCII_RE = /^[\x20-\x7E]+$/;
const SKIP_RE =
  /^(wdym|wym|wyd|wyll|wyp|omw|otw|omfg|uwu|owo|idgaf|dgaf|idek|ime|istg|iykyk|hmu|ama|til|kys|sus|soz|urw|ynk|zoomer|gigachad|nepo|eta|vid|hru|ezpz|lmaoo|lmaooo|sussy|sumthn|ggez|lulw|imk|iono|icymi|og|smol|ngmi|copium|hopium|mald|wojak|omegalul|monkaw|kekw|rekt|fanum|wonk|bussin|sadge|baes|imba|defo|presh|yote|yike|finna|wat|probly|okies|okayy|ahaha|yaas|mwah|kbai|kbye|wildin|simpin|grindin|daammn|ymd|brainrot)[!?.,]*$/i;
const CONS_RE = /^[bcdfghjklmnpqrstvwxz]{2,6}[!?.,]*$/i;
const HASH_RE = /^[A-Fa-f0-9]{12,}$/;
const RULE_RE = /^[\s\-=*_~`>|[\]x()]+$/;
const DICE_RE = /^\d+d\d+(\s*[,+\-=].*)?$/i;
const CJK_RE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;

const NOISE_RE =
  /https?:\/\/\S+|```[\s\S]*?```|`[^`]+`|\|\||<a?:[a-zA-Z0-9_]+:\d+>|<@!?&?\d+>|<#\d+>|<t:-?\d+(?::[tTdDfFR])?>|<\/[^\s>][^>]*:\d+>/gi;

const MARK = String.fromCharCode(0xe000);
const MARK_RE = new RegExp(MARK + "(\\d+)" + MARK, "g");

function mask(text) {
  const tokens = [];
  return {
    masked: text.replace(NOISE_RE, (m) => MARK + (tokens.push(m) - 1) + MARK),
    tokens,
  };
}

function unmask(text, tokens) {
  return text.replace(MARK_RE, (full, i) =>
    +i < tokens.length ? tokens[+i] : full,
  );
}

function junk(text) {
  if (SKIP_RE.test(text) || CONS_RE.test(text)) return true;
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    if (/(.)\1{3,}/.test(text)) return true;
    if (ASCII_RE.test(text) && text.replace(/(.)\1+/g, "$1").length < 3)
      return true;
  }
  const letters = text.match(/\p{L}/gu);
  if (!letters || (letters.length < 2 && !CJK_RE.test(text))) return true;
  if (HASH_RE.test(text) || RULE_RE.test(text) || DICE_RE.test(text))
    return true;
  if (text.length >= 8 && letters.length / text.length < 0.4) return true;
  return words.length >= 3 && words.every((w) => w === words[0]);
}

function shouldSkip(raw, translated) {
  const rawLower = raw.toLowerCase();
  const rawWords = rawLower.match(/\p{L}+/gu);
  if (!rawWords?.length) return false;
  const transLower = translated.toLowerCase();
  const transWords = new Set(transLower.match(/\p{L}+/gu) || []);
  const rawSet = new Set(rawWords);
  if (
    rawWords.every((w) =>
      w.length >= 3 ? transLower.includes(w) : transWords.has(w),
    )
  )
    return true;
  if (
    [...transWords].every((w) =>
      w.length >= 3 ? rawLower.includes(w) : rawSet.has(w),
    )
  )
    return true;
  const removed = [...rawSet].filter((w) => !transWords.has(w));
  return (
    removed.length > 0 &&
    removed.every((w) => SKIP_RE.test(w) || CONS_RE.test(w))
  );
}

function osLocale() {
  return (navigator.language || "en").split("-")[0];
}

function cap(map, key, value, limit) {
  map.delete(key);
  map.set(key, value);
  while (map.size > limit) map.delete(map.keys().next().value);
}

function Pills({ options, value, onChange }) {
  return h(
    "div",
    { className: "at-pills" },
    options.map((o) =>
      h(
        "div",
        {
          key: o.label,
          className: "at-pill",
          onClick: () => onChange(o.value),
          ...(o.value === value && { "data-on": "" }),
        },
        o.label,
      ),
    ),
  );
}

function Translated({ msg, original, plugin }) {
  const id = msg.id;
  const [, force] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    let set = plugin.setters.get(id);
    if (!set) plugin.setters.set(id, (set = new Set()));
    set.add(force);
    return () => {
      set.delete(force);
      if (!set.size) plugin.setters.delete(id);
    };
  }, [id]);
  React.useEffect(() => {
    if (plugin.consider(msg)) force();
  }, [msg]);
  const t = plugin.cache.get(id);
  if (t && t.raw === (msg.content || "")) return plugin.render(t);
  return original;
}

module.exports = class AutoTranslate {
  constructor(meta) {
    this.api = new BdApi(meta.name);
    this.cache = new Map();
    this.retries = new Map();
    this.queue = [];
    this.pending = new Set();
    this.skipped = new Map();
    this.controllers = new Set();
    this.setters = new Map();
    this.active = this.paused = this.busy = false;
    this.backoff = 0;
    this.langNames = {};
    const saved = this.api.Data.load("settings");
    this.settings = {
      skipLangs: saved?.skipLangs || [],
      invert: saved?.invert || false,
      targetLang: saved?.targetLang || null,
      dms: saved?.dms ?? false,
      seen: saved?.seen ?? false,
    };
  }

  start() {
    this.LocaleStore = BdApi.Webpack.Stores.LocaleStore;
    this.UserStore = BdApi.Webpack.Stores.UserStore;
    this.ChannelStore = BdApi.Webpack.Stores.ChannelStore;
    this.active = true;
    this.targetLang = this.resolve(this.settings.targetLang);
    this.prepLang();

    this.api.DOM.addStyle(`
      .at-orig { display: none; }
      [id^="chat-messages-"]:hover .at-orig { display: inline; }
      [id^="chat-messages-"]:hover .at-trans { display: none; }
      .at-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 6px 4px 10px;
        background: var(--background-mod-strong);
        color: var(--text-default);
        border-radius: 3px;
        font-size: 0.875rem;
      }
      .at-close {
        cursor: pointer;
        padding: 0 4px;
        font-size: 1rem;
        line-height: 1;
        opacity: 0.7;
      }
      .at-close:hover {
        opacity: 1;
      }
      .at-panel :is(.bd-setting-note:empty, .bd-setting-divider) { display: none; }
      .at-card {
        background: var(--background-mod-muted);
        border: 1px solid var(--border-muted);
        border-radius: 6px;
        padding: 16px;
        margin-top: 16px;
      }
      .at-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .at-body { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
      .at-add { display: inline-flex; }
      .at-add .bd-select {
        display: inline-flex;
        padding: 3px 10px;
        background: transparent;
        border: 1px dashed var(--border-normal);
        border-radius: 3px;
        min-width: 0;
        font-size: 0.875rem;
        line-height: 20px;
        color: var(--text-muted);
        transition: border-color 0.15s ease, color 0.15s ease;
      }
      .at-add .bd-select-arrow { display: none; }
      .at-add .bd-select:hover { color: var(--text-default); border-color: var(--border-strong); }
      .at-pills {
        display: inline-flex;
        background: var(--background-mod-subtle);
        border-radius: 4px;
        padding: 2px;
      }
      .at-pill {
        padding: 5px 12px;
        color: var(--text-muted);
        border-radius: 3px;
        cursor: pointer;
        text-align: center;
        transition: background 0.2s, color 0.15s ease;
      }
      .at-pill[data-on] { background: var(--control-brand-foreground); color: var(--white); }
      .at-pill:hover:not([data-on]) { color: var(--text-default); }
      .at-hint { font-style: italic; font-size: 12px; }
    `);

    this.wait = new AbortController();
    BdApi.Webpack.waitForModule(
      (e) => {
        const s = e?.type?.toString();
        return (
          s?.includes("SEND_FAILED") && s.includes("contentRef") && e.compare
        );
      },
      { signal: this.wait.signal },
    ).then((MessageContent) => {
      if (!this.active || !MessageContent) return;
      const W = BdApi.Webpack;
      const Parser = W.getModule(W.Filters.byKeys("parse", "parseTopic"));
      const styles = W.getModule(
        (m) => m?.edited && m?.messageContent && m?.contents,
      );
      if (!Parser || !styles) {
        this.api.Logger.error("Parser or styles module missing");
        return;
      }
      this.edited = styles.edited;
      this.modules = { MessageContent, Parser };
      if (this.settings.seen) this.patch();
      else this.notice();
    });

    this.onLocale = () => {
      const cur = this.settings.targetLang;
      if (cur && cur !== "_discord") return;
      const loc = this.resolve(cur);
      if (!loc || loc === this.targetLang) return;
      this.targetLang = loc;
      this.reset();
      this.prepLang();
    };
    this.LocaleStore.addChangeListener(this.onLocale);
  }

  stop() {
    this.active = false;
    this.wait?.abort();
    for (const c of this.controllers) c.abort();
    this.controllers.clear();
    this.LocaleStore?.removeChangeListener(this.onLocale);
    clearTimeout(this.pauseTimer);
    clearTimeout(this.drainTimer);
    this.pauseTimer = this.drainTimer = null;
    this.paused = false;
    this.api.Patcher.unpatchAll();
    this.api.DOM.removeStyle();
    this.reset();
    this.setters.clear();
    this.modules = null;
    this.parser = null;
    this.edited = null;
    this.langNames = {};
  }

  reset() {
    this.cache.clear();
    this.queue = [];
    this.retries.clear();
    this.backoff = 0;
    this.pending.clear();
    this.skipped.clear();
  }

  async prepLang() {
    const target = this.targetLang;
    this.label = "translated";

    this.translate(["translated"], target)
      .then((r) => {
        if (!this.active || this.targetLang !== target) return;
        const t = r?.results?.[0]?.text;
        if (t) this.label = t.toLowerCase();
      })
      .catch((e) => {
        if (this.active) this.api.Logger.error(e);
      });

    const ctrl = new AbortController();
    this.controllers.add(ctrl);
    try {
      const r = await BdApi.Net.fetch(
        `https://translate.googleapis.com/translate_a/l?client=gtx&hl=${target}`,
        { timeout: 10000, signal: ctrl.signal },
      );
      if (!r.ok || !this.active || this.targetLang !== target) return;
      const body = await r.json();
      this.langNames = body.tl || body.sl || {};
      this.refreshPanel?.();
    } catch (e) {
      if (this.active) this.api.Logger.error(e);
    } finally {
      this.controllers.delete(ctrl);
    }
  }

  patch() {
    const { MessageContent, Parser } = this.modules;
    this.parser = Parser;

    this.api.Patcher.after(MessageContent, "type", (_, [props], ret) => {
      const msg = props?.message;
      if (!msg?.id) return;
      if (props.className?.includes("repliedTextContent")) return;
      if (!Array.isArray(ret?.props?.children)) return;
      const orig = ret.props.children[0];
      ret.props.children[0] = h(
        BdApi.Components.ErrorBoundary,
        { name: "AutoTranslate", fallback: orig },
        h(Translated, { key: "at-content", msg, original: orig, plugin: this }),
      );
    });
  }

  consider(msg) {
    const id = msg.id;
    const raw = msg.content || "";
    const channel_id = msg.channel_id;
    const translation = this.cache.get(id);
    if (translation && translation.raw === raw) return;

    const skipEntry = this.skipped.get(id);
    if (skipEntry && skipEntry.raw === raw) return;
    if (this.pending.has(id)) return;

    const stripped = raw.replace(NOISE_RE, "").trim();

    if (translation) {
      if (stripped === translation.stripped) {
        translation.raw = raw;
        translation.parsed = null;
        return true;
      }
      this.cache.delete(id);
      this.retries.delete(id);
    }

    if (skipEntry) {
      if (stripped === skipEntry.stripped) {
        skipEntry.raw = raw;
        return;
      }
      this.skipped.delete(id);
    }

    if (this.skip(msg, stripped)) {
      cap(this.skipped, id, { raw, stripped, channel_id }, 1000);
      return;
    }

    this.pending.add(id);
    this.enqueue(id, stripped, raw, channel_id);
  }

  skip(msg, stripped) {
    if (!this.allowed(this.ChannelStore.getChannel(msg.channel_id)))
      return true;
    const text = msg.content?.trim();
    const cjk = !!text && CJK_RE.test(text);
    return (
      !TYPES.has(msg.type ?? 0) ||
      msg.author?.id === this.UserStore.getCurrentUser()?.id ||
      msg.author?.bot ||
      (msg.webhookId && !msg.applicationId) ||
      (!cjk && (!text || text.length < 2 || stripped.length < 2)) ||
      junk(stripped)
    );
  }

  allowed(c) {
    return !!c?.isPrivate && (!c.isPrivate() || this.settings.dms);
  }

  enqueue(msgId, stripped, raw, channel_id) {
    this.queue.push({ msgId, stripped, raw, channel_id });
    if (this.paused || this.busy || this.drainTimer) return;
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      this.drain();
    }, 50);
  }

  async drain() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length > 0 && this.active && !this.paused) {
        const batch = [];
        let size = 0;
        do {
          const enc = encodeURIComponent(this.queue[0].raw).length;
          if (batch.length && size + enc > 4500) break;
          batch.push(this.queue.shift());
          size += enc;
        } while (this.queue.length && batch.length < 50);
        await this.runBatch(batch);
      }
    } finally {
      this.busy = false;
    }
  }

  async runBatch(batch) {
    if (!this.active) return;
    const target = this.targetLang;

    const firstIdx = new Map();
    const unique = [];
    for (const item of batch) {
      if (firstIdx.has(item.raw)) continue;
      firstIdx.set(item.raw, unique.length);
      unique.push(item);
    }

    const masks = unique.map((b) => mask(b.raw));
    const result = await this.translate(
      masks.map((x) => x.masked),
      target,
    ).catch((e) => {
      if (this.active) this.api.Logger.error(e);
      return null;
    });
    if (!this.active || target !== this.targetLang) return;

    if (result?.rateLimited) {
      this.paused = true;
      const ra = Number(result.retryAfter);
      const base =
        Number.isFinite(ra) && ra > 0
          ? Math.min(ra, 120)
          : Math.min((this.backoff || 2.5) * 2, 60);
      this.backoff = base;
      const wait = (base + Math.random()) * 1000;
      BdApi.UI.showToast(
        `AutoTranslate: paused, retrying in ${Math.round(wait / 1000)}s`,
        { type: "warning" },
      );
      this.pauseTimer = setTimeout(() => {
        this.paused = false;
        this.pauseTimer = null;
        if (this.queue.length) this.drain();
      }, wait);
      this.queue.unshift(...batch);
      return;
    }

    if (!result) {
      for (const { msgId, stripped, raw, channel_id } of batch) {
        this.pending.delete(msgId);
        this.retry(msgId, stripped, raw, channel_id);
      }
      return;
    }

    this.backoff = 0;
    for (const { msgId, stripped, raw, channel_id } of batch) {
      const idx = firstIdx.get(raw);
      const r = result.results[idx];
      this.pending.delete(msgId);

      if (!r?.text) {
        this.retry(msgId, stripped, raw, channel_id);
        continue;
      }
      const text = unmask(r.text, masks[idx].tokens);
      if (this.blocked(r.src) || shouldSkip(raw, text)) {
        cap(
          this.skipped,
          msgId,
          { raw, stripped, src: r.src, channel_id },
          1000,
        );
        continue;
      }

      this.retries.delete(msgId);
      cap(
        this.cache,
        msgId,
        { text, src: r.src, stripped, raw, channel_id, parsed: null },
        1000,
      );
      this.setters.get(msgId)?.forEach((f) => f());
    }
  }

  async translate(texts, target) {
    const query = new URLSearchParams({
      client: "gtx",
      dt: "t",
      sl: "auto",
      tl: target,
      ie: "UTF-8",
      oe: "UTF-8",
    });
    const body = new URLSearchParams();
    for (const t of texts) body.append("q", t);
    const ctrl = new AbortController();
    this.controllers.add(ctrl);
    let resp;
    try {
      resp = await BdApi.Net.fetch(
        `https://translate.googleapis.com/translate_a/t?${query}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
          timeout: 10000,
          signal: ctrl.signal,
        },
      );
    } finally {
      this.controllers.delete(ctrl);
    }
    if (resp.status === 429 || resp.status === 503) {
      const ra = resp.headers.get("retry-after");
      return { rateLimited: true, retryAfter: ra ? parseInt(ra, 10) : null };
    }
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!Array.isArray(data) || data.length !== texts.length) return null;
    return {
      results: data.map((e) =>
        Array.isArray(e) ? { text: e[0], src: e[1] } : { text: e, src: "auto" },
      ),
    };
  }

  retry(msgId, stripped, raw, channel_id) {
    const count = (this.retries.get(msgId) || 0) + 1;
    if (count > 2) {
      this.retries.delete(msgId);
      cap(this.skipped, msgId, { raw, stripped, channel_id }, 1000);
      return;
    }
    cap(this.retries, msgId, count, 500);
    this.pending.add(msgId);
    this.enqueue(msgId, stripped, raw, channel_id);
  }

  blocked(src) {
    const { skipLangs, invert } = this.settings;
    if (!skipLangs.length) return false;
    return invert ? !skipLangs.includes(src) : skipLangs.includes(src);
  }

  apply() {
    for (const [id, { raw, stripped, src, channel_id }] of [...this.cache]) {
      if (
        !this.allowed(this.ChannelStore.getChannel(channel_id)) ||
        (src && this.blocked(src))
      ) {
        this.cache.delete(id);
        cap(this.skipped, id, { raw, stripped, src, channel_id }, 1000);
        this.setters.get(id)?.forEach((f) => f());
      }
    }
    for (const [id, s] of this.skipped) {
      if (
        this.allowed(this.ChannelStore.getChannel(s.channel_id)) &&
        (!s.src || !this.blocked(s.src))
      ) {
        this.skipped.delete(id);
        this.setters.get(id)?.forEach((f) => f());
      }
    }
  }

  setSkipLangs(list) {
    this.settings.skipLangs = list;
    this.api.Data.save("settings", this.settings);
    this.apply();
  }

  setInvert(value) {
    this.settings.invert = value;
    this.api.Data.save("settings", this.settings);
    this.apply();
  }

  setDms(v) {
    this.settings.dms = v;
    this.api.Data.save("settings", this.settings);
    this.apply();
  }

  resolve(c) {
    return c === "_discord"
      ? this.LocaleStore?.locale?.split("-")[0] || osLocale()
      : c || osLocale();
  }

  setTargetLang(code) {
    this.settings.targetLang = code || null;
    this.api.Data.save("settings", this.settings);
    const next = this.resolve(code || null);
    if (!next || next === this.targetLang) return;
    this.targetLang = next;
    this.reset();
    this.prepLang();
  }

  notice() {
    if (!this.active || this.settings.seen) return;
    BdApi.UI.showConfirmationModal(
      "AutoTranslate",
      h(
        "div",
        { style: { lineHeight: 1.5 } },
        h(
          "p",
          { style: { marginBottom: 10 } },
          "For privacy reasons you should know that this plugin sends most incoming messages to Google, even ones already in your language.",
        ),
        h(
          "p",
          null,
          h("b", null, "DMs and group DMs are off by default"),
          " since they're more private. Servers are on. DMs can be enabled in settings.",
        ),
      ),
      {
        confirmText: "I understand",
        cancelText: "Disable",
        onConfirm: () => {
          this.settings.seen = true;
          this.api.Data.save("settings", this.settings);
          if (this.active) this.patch();
        },
        onCancel: () => BdApi.Plugins.disable("AutoTranslate"),
      },
    );
  }

  render(t) {
    if (!t.parsed) {
      t.parsed = {
        text: this.parser.parse(t.text),
        raw: this.parser.parse(t.raw),
        srcLabel: (this.langNames[t.src] || t.src)
          .toLowerCase()
          .replace(/[()]/g, ""),
      };
    }
    const p = t.parsed;
    return h(
      "span",
      null,
      h("span", { className: "at-trans" }, p.text),
      h("span", { className: "at-orig" }, p.raw),
      " ",
      h(
        "span",
        {
          className: this.edited,
          style: { color: "var(--chat-text-muted)" },
        },
        "(",
        h("span", { className: "at-trans" }, this.label),
        h("span", { className: "at-orig" }, p.srcLabel),
        ")",
      ),
    );
  }

  getSettingsPanel() {
    const self = this;
    function Panel() {
      const [list, setList] = React.useState(self.settings.skipLangs);
      const [invert, setInvState] = React.useState(self.settings.invert);
      const [target, setTargetState] = React.useState(self.settings.targetLang);
      const [dms, setDmsState] = React.useState(self.settings.dms);
      const [, force] = BdApi.Hooks.useForceUpdate();
      React.useEffect(() => {
        self.refreshPanel = force;
        return () => {
          self.refreshPanel = null;
        };
      }, []);
      const up = (v) => {
        setList(v);
        self.setSkipLangs(v);
      };
      const flip = (v) => {
        setInvState(v);
        self.setInvert(v);
      };
      const pick = (v) => {
        setTargetState(v || null);
        self.setTargetLang(v || null);
      };
      const toggleDms = (v) => {
        setDmsState(v);
        self.setDms(v);
      };

      const osCode = osLocale();
      let osName = "";
      try {
        osName =
          new Intl.DisplayNames([osCode], { type: "language" }).of(osCode) ||
          "";
      } catch {}
      const sysLabel = osName
        ? `System language (${osName})`
        : "System language";

      const discordCode = self.LocaleStore?.locale?.split("-")[0];
      const discordOption =
        discordCode && discordCode !== osCode
          ? [
              {
                label: `Discord language (${self.langNames[discordCode] || discordCode})`,
                value: "_discord",
              },
            ]
          : [];

      const tlOptions = Object.entries(self.langNames)
        .filter(([c]) => c !== "auto")
        .map(([c, name]) => ({ label: name, value: c }))
        .sort((a, b) => a.label.localeCompare(b.label, self.targetLang));

      const addOptions = tlOptions.filter(
        (o) => o.value !== self.targetLang && !list.includes(o.value),
      );

      const card = h(
        "div",
        { className: "at-card" },
        h(
          "div",
          { className: "at-head" },
          h("span", { className: "bd-setting-title" }, "Translation filter"),
          h(Pills, {
            options: [
              { label: "Skip", value: false },
              { label: "Only", value: true },
            ],
            value: invert,
            onChange: flip,
          }),
        ),
        h(
          "div",
          { className: "at-body" },
          list.map((code) =>
            h(
              "span",
              { key: code, className: "at-tag" },
              self.langNames[code] || code,
              h(
                "span",
                {
                  className: "at-close",
                  onClick: () => up(list.filter((c) => c !== code)),
                },
                "×",
              ),
            ),
          ),
          h(
            "div",
            { className: "at-add" },
            h(BdApi.Components.DropdownInput, {
              key: list.length,
              value: "_add",
              options: [
                { label: "+ Add language", value: "_add" },
                ...addOptions,
              ],
              onChange: (v) => {
                if (v && v !== "_add") up([...list, v]);
              },
            }),
          ),
        ),
        h(
          "div",
          { className: "bd-setting-note at-hint" },
          invert
            ? "Only messages in these languages will be translated"
            : "Messages in these languages won't be translated",
        ),
      );

      return h(
        "div",
        { className: "at-panel" },
        h(
          BdApi.Components.SettingItem,
          { name: "Target language", inline: true },
          h(BdApi.Components.DropdownInput, {
            value: target || "",
            options: [
              { label: sysLabel, value: "" },
              ...discordOption,
              ...tlOptions,
            ],
            onChange: pick,
          }),
        ),
        h(
          BdApi.Components.SettingItem,
          { name: "Translate direct messages", inline: true },
          h(BdApi.Components.SwitchInput, { value: dms, onChange: toggleDms }),
        ),
        card,
      );
    }
    return h(Panel);
  }
};
