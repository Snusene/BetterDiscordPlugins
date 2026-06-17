/**
 * @name AutoTranslate
 * @author Snues
 * @authorId 98862725609816064
 * @description Automatically translate messages in chat.
 * @version 0.3.2
 * @invite xp2f3YFKMY
 * @source https://github.com/Snusene/BetterDiscordPlugins/tree/main/AutoTranslate
 * @donate https://ko-fi.com/snues
 */

const { React } = BdApi;
const h = React.createElement;

const TYPES = new Set([0, 19, 20, 21, 23]);

const ASCII_RE = /^[\x20-\x7E]+$/;
const SKIP_RE =
  /^(wdym|wym|wyd|wyll|wyp|omw|otw|omfg|uwu|owo|idgaf|dgaf|idek|ime|istg|iykyk|hmu|ama|til|kys|sus|soz|urw|ynk|zoomer|gigachad|nepo|eta|vid|hru|ezpz|lmaoo|lmaooo|sussy|sumthn|ggez|lulw|imk|iono|icymi|og|smol|ngmi|copium|hopium|mald|wojak|omegalul|monkaw|kekw|rekt|fanum|wonk|bussin|sadge|baes|imba|defo|presh|yote|yike|finna|wat|probly|okies|okayy|ahaha|yaas|mwah|kbai|kbye|wildin|simpin|grindin|daammn|ymd|brainrot|lol|lmao|rofl|smh|ngl|tbh|btw|fyi|pog|bruh)[!?.,]*$/i;
const CONS_RE = /^[bcdfghjklmnpqrstvwxz]{2,6}[!?.,]*$/i;
const HASH_RE = /^[A-Fa-f0-9]{12,}$/;
const RULE_RE = /^[\s\-=*_~`>|[\]()]+$/;
const DICE_RE = /^\d+d\d+(\s*[,+\-=].*)?$/i;
const CJK_RE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;

const NOISE_RE =
  /[ \t]{2,}|https?:\/\/\S+|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+|\b\d{1,3}(?:\.\d{1,3}){3}\b|\+\d[\d\s().-]{6,}\d|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S*|```[\s\S]*?```|`[^`]+`|\|\||<a?:[a-zA-Z0-9_]+:\d+>|<@!?&?\d+>|<#\d+>|<t:-?\d+(?::[tTdDfFR])?>|<\/[^\s>][^>]*:\d+>|<[^>\n]*>|</gi;

const MARK = "ZZZATMK";
const MARK_RE = /Z+ATMK(\d+)Z+ATMK/gi;

function mask(text, offset = 0) {
  const tokens = [];
  return {
    masked: text.replace(
      NOISE_RE,
      (m) => MARK + (tokens.push(m) - 1 + offset) + MARK,
    ),
    tokens,
    offset,
  };
}

function unmask(text, tokens, offset = 0) {
  return text.replace(MARK_RE, (_, i) => tokens[+i - offset] ?? "");
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
  return navigator.language.split("-")[0];
}

function langName(code) {
  try {
    return new Intl.DisplayNames([code], { type: "language" }).of(code) || code;
  } catch {
    return code;
  }
}

function cap(map, key, value, limit) {
  map.delete(key);
  map.set(key, value);
  while (map.size > limit) map.delete(map.keys().next().value);
}

const unwanted = (msg, myId) =>
  !TYPES.has(msg.type ?? 0) ||
  msg.author?.id === myId ||
  msg.author?.bot ||
  !!(msg.webhookId && !msg.applicationId);

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

function Translated({ msg, original, extras, plugin }) {
  const id = msg.id;
  const ref = React.useRef(null);
  const subscribe = React.useCallback((cb) => plugin.sub(id, cb), [id]);
  React.useSyncExternalStore(subscribe, () => plugin.subs.get(id)?.v ?? 0);
  React.useEffect(() => {
    const node = ref.current?.closest('[id^="chat-messages-"]');
    if (!node) return;
    plugin.watch(node, msg);
    return () => plugin.unwatch(node);
  }, [msg]);
  const t = plugin.cache.get(id);
  const ready = t && t.raw === (msg.content || "");
  const content = ready ? plugin.render(t, extras) : [original, ...extras];
  return h("span", { ref, style: { display: "contents" } }, content);
}

const CSS = `
      .at-outer {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
      }
      .at-trans,
      .at-orig {
        grid-area: 1 / 1;
        min-width: 0;
      }
      .at-orig { visibility: hidden; }
      [id^="chat-messages-"]:hover .at-orig { visibility: visible; }
      [id^="chat-messages-"]:hover .at-trans { visibility: hidden; }
      .at-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 6px 4px 10px;
        background: var(--background-mod-strong);
        color: var(--text-default);
        border-radius: 3px;
        font-size: 0.875rem;
        line-height: 20px;
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
        border-radius: 8px;
        padding: 16px;
        margin-top: 16px;
      }
      .at-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .at-label { display: flex; align-items: center; gap: 8px; }
      .at-body { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
      .at-add { display: inline-flex; }
      .at-add .bd-select {
        display: inline-flex;
        padding: 4px 10px;
        background: var(--background-mod-subtle);
        border: none;
        border-radius: 3px;
        min-width: 0;
        font-size: 0.875rem;
        line-height: 20px;
        color: var(--text-muted);
        transition: background 0.15s ease, color 0.15s ease;
      }
      .at-add .bd-select-arrow { display: none; }
      .at-add .bd-select:hover { background: var(--background-mod-strong); color: var(--text-default); }
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
      .at-pill[data-on] { background: var(--bd-brand); color: var(--white); }
      .at-pill:hover:not([data-on]) { color: var(--text-default); }
      .at-title {
        color: var(--text-muted);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .at-hint { font-size: 12px; line-height: 1.5; color: var(--text-muted); }
      .at-adv {
        margin-top: 16px;
        border: 1px solid var(--border-muted);
        border-radius: 8px;
        overflow: hidden;
      }
      .at-adv-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px;
        background: var(--background-mod-subtle);
        cursor: pointer;
        user-select: none;
      }
      .at-adv-head:hover { filter: brightness(0.9); }
      .at-adv-title {
        color: var(--text-strong);
        font-size: 14px;
        font-weight: 600;
      }
      .at-adv-body { padding: 12px; background: var(--background-mod-muted); }
      .at-arrow {
        color: var(--text-muted);
        transition: transform 0.2s;
      }
      .at-arrow.at-open { transform: rotate(90deg); }
      .at-srv-list {
        max-height: clamp(140px, 60vh - 430px, 280px);
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--scrollbar-auto-thumb) transparent;
      }
      .at-srv {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px;
        border-radius: 4px;
      }
      .at-srv:hover { background: var(--interactive-background-hover); }
      .at-srv-icon { flex-shrink: 0; }
      .at-srv-name {
        flex: 1;
        color: var(--text-default);
        font-size: 14px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `;

module.exports = class AutoTranslate {
  constructor(meta) {
    this.api = new BdApi(meta.name);
    this.cache = new Map();
    this.retries = new Map();
    this.queue = [];
    this.pending = new Set();
    this.skipped = new Map();
    this.controllers = new Set();
    this.subs = new Map();
    this.active = this.paused = this.busy = false;
    this.backoff = 0;
    this.label = null;
    this.langNames = {};
    const saved = this.api.Data.load("settings");
    this.settings = {
      skipLangs: saved?.skipLangs || [],
      invert: saved?.invert || false,
      targetLang: saved?.targetLang || null,
      dms: saved?.dms ?? false,
      disabledGuilds: saved?.disabledGuilds || [],
      seen: saved?.seen ?? false,
    };
  }

  start() {
    this.LocaleStore = BdApi.Webpack.Stores.LocaleStore;
    this.UserStore = BdApi.Webpack.Stores.UserStore;
    this.ChannelStore = BdApi.Webpack.Stores.ChannelStore;
    this.GuildStore = BdApi.Webpack.Stores.GuildStore;
    this.SortedGuildStore = BdApi.Webpack.Stores.SortedGuildStore;
    this.MessageStore = BdApi.Webpack.Stores.MessageStore;
    this.SelectedChannelStore = BdApi.Webpack.Stores.SelectedChannelStore;
    this.myId = this.UserStore.getCurrentUser()?.id;
    this.active = true;
    this.visible = new Set();
    this.observed = new WeakMap();
    this.observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const msg = this.observed.get(e.target);
        if (!msg) continue;
        if (e.isIntersecting) {
          this.visible.add(msg.id);
          if (this.consider(msg)) this.notify(msg.id);
        } else this.visible.delete(msg.id);
      }
    });
    this.targetLang = this.resolve(this.settings.targetLang);
    this.prepLang();

    this.api.DOM.addStyle(CSS);

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
      this.GuildIcon = W.getModule(
        (m) => {
          if (typeof m !== "function") return false;
          const s = m.toString();
          return s.includes("getGuildIconURL") && s.includes("acronym");
        },
        { searchExports: true },
      );
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
      this.refresh();
    };
    this.LocaleStore.addChangeListener(this.onLocale);
  }

  stop() {
    this.active = false;
    this.wait?.abort();
    for (const c of this.controllers) c.abort();
    this.controllers.clear();
    this.observer?.disconnect();
    this.observer = null;
    this.observed = null;
    this.visible = null;
    this.LocaleStore?.removeChangeListener(this.onLocale);
    clearTimeout(this.pauseTimer);
    clearTimeout(this.drainTimer);
    this.pauseTimer = this.drainTimer = null;
    this.paused = this.busy = false;
    this.api.Patcher.unpatchAll();
    this.api.DOM.removeStyle();
    this.reset();
    this.subs.clear();
    this.refreshPanel = null;
  }

  reset() {
    this.cache.clear();
    this.queue = [];
    this.retries.clear();
    this.backoff = 0;
    this.pending.clear();
    this.skipped.clear();
    this.label = null;
    this.langNames = {};
  }

  patch() {
    const { MessageContent, Parser } = this.modules;
    this.parser = Parser;

    this.api.Patcher.after(MessageContent, "type", (_, [props], ret) => {
      const msg = props?.message;
      if (!msg?.id) return;
      if (props.className?.includes("repliedTextContent")) return;
      if (!Array.isArray(ret?.props?.children)) return;
      if (unwanted(msg, this.myId)) return;
      const kids = ret.props.children;
      const i = kids.findIndex((c) => Array.isArray(c));
      if (i < 0) return;
      const orig = kids[i];
      const extras = kids.filter((_, j) => j !== i);
      ret.props.children = [
        h(
          BdApi.Components.ErrorBoundary,
          { name: "AutoTranslate", fallback: orig },
          h(Translated, {
            key: "at-content",
            msg,
            original: orig,
            extras,
            plugin: this,
          }),
        ),
      ];
    });
  }

  consider(msg) {
    if (!this.visible?.has(msg.id)) return;
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

  watch(node, msg) {
    if (!this.observer) return;
    this.observed.set(node, msg);
    this.observer.observe(node);
  }

  unwatch(node) {
    if (!this.observer) return;
    const msg = this.observed.get(node);
    if (msg) this.visible.delete(msg.id);
    this.observed.delete(node);
    this.observer.unobserve(node);
  }

  sub(id, cb) {
    let s = this.subs.get(id);
    if (!s) this.subs.set(id, (s = { v: 0, cbs: new Set() }));
    s.cbs.add(cb);
    return () => {
      s.cbs.delete(cb);
      if (!s.cbs.size) this.subs.delete(id);
    };
  }

  notify(id) {
    const s = this.subs.get(id);
    if (!s) return;
    s.v++;
    s.cbs.forEach((cb) => cb());
  }

  skip(msg, stripped) {
    if (!this.allowed(this.ChannelStore.getChannel(msg.channel_id)))
      return true;
    const text = msg.content?.trim();
    const cjk = !!text && CJK_RE.test(text);
    return (
      (!cjk && (!text || text.length < 2 || stripped.length < 2)) ||
      junk(stripped)
    );
  }

  allowed(c) {
    if (!c?.isPrivate) return false;
    if (c.isPrivate()) return this.settings.dms;
    return !this.settings.disabledGuilds.includes(c.guild_id);
  }

  render(t, extras = []) {
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
    const tag = (txt) =>
      h(
        "span",
        {
          className: this.edited,
          style: { color: "var(--chat-text-muted)" },
        },
        " (",
        txt,
        ")",
      );
    const clone = (pfx) =>
      extras.map((el, i) =>
        el?.props
          ? React.cloneElement(el, { key: `at-${pfx}-${el.key || i}` })
          : el,
      );
    return h(
      "span",
      { className: "at-outer" },
      h(
        "span",
        { className: "at-trans" },
        p.text,
        tag(this.label || "translated"),
        ...clone("t"),
      ),
      h(
        "span",
        { className: "at-orig" },
        p.raw,
        tag(p.srcLabel),
        ...clone("o"),
      ),
    );
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

    batch = batch.filter((item) => {
      if (this.allowed(this.ChannelStore.getChannel(item.channel_id)))
        return true;
      this.pending.delete(item.msgId);
      cap(
        this.skipped,
        item.msgId,
        { raw: item.raw, stripped: item.stripped, channel_id: item.channel_id },
        1000,
      );
      return false;
    });
    if (!batch.length) return;

    const firstIdx = new Map();
    const unique = [];
    for (const item of batch) {
      if (firstIdx.has(item.raw)) continue;
      firstIdx.set(item.raw, unique.length);
      unique.push(item);
    }

    let offset = 0;
    const masks = unique.map((b) => {
      const r = mask(b.raw, offset);
      offset += r.tokens.length;
      return r;
    });
    const result = await this.translate(
      masks.map((x) => x.masked),
      target,
    );
    if (!this.active || target !== this.targetLang) return;

    if (result?.rateLimited) {
      this.tripPause(Number(result.retryAfter));
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
    this.prepLang();
    for (const { msgId, stripped, raw, channel_id } of batch) {
      const idx = firstIdx.get(raw);
      const r = result.results[idx];
      this.pending.delete(msgId);

      if (!r?.text) {
        this.retry(msgId, stripped, raw, channel_id);
        continue;
      }
      const text = unmask(r.text, masks[idx].tokens, masks[idx].offset);
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
      this.notify(msgId);
    }
  }

  async translate(texts, target) {
    if (!this.active) return null;
    let a, err;
    try {
      a = await this.translatePa(texts, target);
    } catch (e) {
      err = e;
    }
    if (a?.results) return a;
    let b;
    try {
      b = await this.translateGtx(texts, target);
    } catch (e) {
      err ??= e;
    }
    if (b?.results) return b;
    if (a?.rateLimited || b?.rateLimited)
      return { rateLimited: true, retryAfter: a?.retryAfter ?? b?.retryAfter };
    if (err && this.active) this.api.Logger.error(err);
    return null;
  }

  async req(url, opts) {
    const ctrl = new AbortController();
    this.controllers.add(ctrl);
    try {
      return await BdApi.Net.fetch(url, {
        timeout: 10000,
        signal: ctrl.signal,
        ...opts,
      });
    } finally {
      this.controllers.delete(ctrl);
    }
  }

  rateLimit(resp) {
    if (resp.status !== 429 && resp.status !== 503) return null;
    const ra = resp.headers.get("retry-after");
    return { rateLimited: true, retryAfter: ra ? parseInt(ra, 10) : null };
  }

  async translatePa(texts, target) {
    const html = texts.map((t) =>
      t
        .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
        .replace(/__([^_\n]+)__/g, "<u>$1</u>")
        .replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
        .replace(/\n/g, "<br>"),
    );
    const resp = await this.req(
      "https://translate-pa.googleapis.com/v1/translateHtml",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json+protobuf",
          "X-Goog-API-Key": "AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520",
        },
        body: JSON.stringify([[html, "auto", target], "te_lib"]),
      },
    );
    const limited = this.rateLimit(resp);
    if (limited) return limited;
    if (!resp.ok) return null;
    const data = await resp.json();
    const trans = data?.[0];
    const srcs = data?.[1];
    if (!Array.isArray(trans) || trans.length !== texts.length) return null;
    return {
      results: trans.map((t, i) => {
        const text = t
          .replace(/<br\s*\/?> ?/gi, "\n")
          .replace(/<b>([\s\S]*?)<\/b>/g, "**$1**")
          .replace(/<u>([\s\S]*?)<\/u>/g, "__$1__")
          .replace(/<s>([\s\S]*?)<\/s>/g, "~~$1~~")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&amp;/g, "&")
          .replace(/^>$/gm, "> ");
        return { text, src: srcs?.[i] || "auto" };
      }),
    };
  }

  async translateGtx(texts, target) {
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
    const resp = await this.req(
      `https://translate.googleapis.com/translate_a/t?${query}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
    );
    const limited = this.rateLimit(resp);
    if (limited) return limited;
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

  async prepLang() {
    const target = this.targetLang;
    const labelNeeded = !this.label;
    const langsNeeded = !Object.keys(this.langNames).length;
    if (!labelNeeded && !langsNeeded) return;

    if (labelNeeded) {
      this.translate(["translated"], target)
        .then((r) => {
          if (!this.active || this.targetLang !== target) return;
          if (r?.rateLimited) return this.tripPause(r.retryAfter);
          const t = r?.results?.[0]?.text;
          if (t) this.label = t.toLowerCase();
        })
        .catch((e) => {
          if (this.active) this.api.Logger.error(e);
        });
    }

    if (!langsNeeded) return;
    try {
      const r = await this.req(
        `https://translate.googleapis.com/translate_a/l?client=gtx&hl=${encodeURIComponent(target)}`,
      );
      if (!this.active || this.targetLang !== target) return;
      const limited = this.rateLimit(r);
      if (limited) return this.tripPause(limited.retryAfter);
      if (!r.ok) return;
      const body = await r.json();
      this.langNames = body.tl || body.sl || {};
      this.refreshPanel?.();
    } catch (e) {
      if (this.active) this.api.Logger.error(e);
    }
  }

  tripPause(retryAfter) {
    if (this.paused) return;
    this.paused = true;
    const base =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter, 120)
        : Math.min((this.backoff || 2.5) * 2, 60);
    this.backoff = base;
    const wait = (base + Math.random()) * 1000;
    this.pauseTimer = setTimeout(() => {
      this.paused = false;
      this.pauseTimer = null;
      if (this.queue.length) this.drain();
    }, wait);
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
      }
    }
    for (const [id, s] of [...this.skipped]) {
      if (
        this.allowed(this.ChannelStore.getChannel(s.channel_id)) &&
        (!s.src || !this.blocked(s.src))
      ) {
        this.skipped.delete(id);
      }
    }
  }

  refresh() {
    const cid = this.SelectedChannelStore.getChannelId();
    if (!cid) return;
    for (const id of [...this.subs.keys()]) {
      const m = this.MessageStore.getMessage(cid, id);
      if (m) this.consider(m);
      this.notify(id);
    }
  }

  mutate(patch, after) {
    Object.assign(this.settings, patch);
    this.api.Data.save("settings", this.settings);
    after?.call(this);
  }

  setSkipLangs(list) {
    this.mutate({ skipLangs: list }, this.apply);
  }
  setInvert(v) {
    this.mutate({ invert: v }, this.apply);
  }
  setDms(v) {
    this.mutate({ dms: v }, this.apply);
  }
  setDisabledGuilds(list) {
    this.mutate({ disabledGuilds: list }, this.apply);
  }

  setTargetLang(code) {
    this.mutate({ targetLang: code || null });
    const next = this.resolve(code || null);
    if (!next || next === this.targetLang) return;
    this.targetLang = next;
    this.reset();
    this.prepLang();
  }

  resolve(c) {
    if (c === "_system") return osLocale();
    return c && c !== "_discord" ? c : this.LocaleStore.locale.split("-")[0];
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
          this.mutate({ seen: true });
          if (this.active) this.patch();
        },
        onCancel: () => BdApi.Plugins.disable("AutoTranslate"),
      },
    );
  }

  getSettingsPanel() {
    const self = this;
    function Panel() {
      const [list, setList] = React.useState(self.settings.skipLangs);
      const [invert, setInvState] = React.useState(self.settings.invert);
      const [target, setTargetState] = React.useState(self.settings.targetLang);
      const [dms, setDmsState] = React.useState(self.settings.dms);
      const [off, setOff] = React.useState(self.settings.disabledGuilds);
      const [serversOpen, setServersOpen] = React.useState(false);
      const [, force] = BdApi.Hooks.useForceUpdate();
      React.useEffect(() => {
        self.refreshPanel = force;
        return () => {
          self.refreshPanel = null;
          self.refresh();
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
      const guildToggle = (id) => {
        const next = off.includes(id)
          ? off.filter((x) => x !== id)
          : [...off, id];
        setOff(next);
        self.setDisabledGuilds(next);
      };

      const discordCode = self.LocaleStore.locale.split("-")[0];
      const osCode = osLocale();
      const defaultLabel = `Discord language (${self.langNames[discordCode] || discordCode})`;
      const systemOption =
        osCode !== discordCode
          ? [
              {
                label: `System language (${langName(osCode)})`,
                value: "_system",
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
          h(
            "div",
            { className: "at-label" },
            h("span", { className: "at-title" }, "Language filter"),
            h(
              "span",
              { className: "at-hint" },
              invert
                ? "Only messages in these languages will be translated"
                : "Messages in these languages won't be translated",
            ),
          ),
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
              key: list.join(","),
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
      );

      const guilds = self.GuildStore.getGuilds();
      const order = self.SortedGuildStore.getFlattenedGuildIds();
      const serverList = h(
        "div",
        { className: "at-srv-list" },
        order
          .map((id) => guilds[id])
          .filter(Boolean)
          .map((g) =>
            h(
              "div",
              { key: g.id, className: "at-srv" },
              self.GuildIcon &&
                h(self.GuildIcon, {
                  guildId: g.id,
                  guildName: g.name,
                  guildIcon: g.icon,
                  iconSize: 32,
                  className: "at-srv-icon",
                }),
              h("span", { className: "at-srv-name" }, g.name),
              h(BdApi.Components.SwitchInput, {
                value: !off.includes(g.id),
                onChange: () => guildToggle(g.id),
              }),
            ),
          ),
      );

      return h(
        "div",
        { className: "at-panel" },
        h(
          BdApi.Components.SettingItem,
          { name: "Target language", inline: true },
          h(BdApi.Components.DropdownInput, {
            value:
              target &&
              target !== "_discord" &&
              (target !== "_system" || systemOption.length)
                ? target
                : "",
            options: [
              { label: defaultLabel, value: "" },
              ...systemOption,
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
        h(
          "div",
          { className: "at-adv" },
          h(
            "div",
            {
              className: "at-adv-head",
              onClick: () => setServersOpen(!serversOpen),
            },
            h("span", { className: "at-adv-title" }, "Servers"),
            h(
              "span",
              { className: "at-arrow" + (serversOpen ? " at-open" : "") },
              "▶",
            ),
          ),
          serversOpen && h("div", { className: "at-adv-body" }, serverList),
        ),
      );
    }
    return h(Panel);
  }
};
