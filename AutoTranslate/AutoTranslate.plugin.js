/**
 * @name AutoTranslate
 * @author Snues
 * @authorId 98862725609816064
 * @description Automatically translate messages in chat.
 * @version 0.1.2
 * @invite xp2f3YFKMY
 * @source https://github.com/Snusene/BetterDiscordPlugins/tree/main/AutoTranslate
 * @donate https://ko-fi.com/snues
 */

const { React } = BdApi;
const h = React.createElement;

const EMOJI_ONLY_RE =
  /^(<a?:\w+:\d+>|\s|[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|[\u{200D}\u{20E3}])+$/u;

const ASCII_ONLY = /^[\x20-\x7E]+$/;
const SKIP =
  /^(wdym|wym|wyd|wyll|wyp|omw|otw|omfg|uwu|owo|idgaf|dgaf|idek|ime|istg|iykyk|hmu|ama|til|kys|sus|soz|urw|ynk|zoomer|gigachad|nepo|eta|vid|hru|ezpz)$/i;

const NOISE =
  /^!\w+\s*|https?:\/\/\S+|```[\s\S]*?```|`[^`]+`|<@!?\d+>|<#\d+>|<@&\d+>|\S*\/\S*\.[a-z]{1,5}\b|\S+\/\S+\/\S+|[a-zA-Z]:\\\S*/gi;

const strip = (text) => text.replace(NOISE, "").trim();

function junk(text) {
  if (/(.)\1{3,}/.test(text) || SKIP.test(text)) return true;
  if (ASCII_ONLY.test(text) && text.replace(/(.)\1+/g, "$1").length < 3)
    return true;
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length >= 3 && words.every((w) => w === words[0]);
}

function passthrough(raw, translated) {
  const rawWords = raw.toLowerCase().match(/\p{L}+/gu);
  if (!rawWords?.length) return false;
  const rawLower = raw.toLowerCase();
  const transLower = translated.toLowerCase();
  const transWords = new Set(transLower.match(/\p{L}+/gu) || []);
  const rawSet = new Set(rawWords);
  const fwd = rawWords.every((w) =>
    w.length >= 3 ? transLower.includes(w) : transWords.has(w),
  );
  if (fwd) return true;
  return [...transWords].every((w) =>
    w.length >= 3 ? rawLower.includes(w) : rawSet.has(w),
  );
}

module.exports = class AutoTranslate {
  constructor(meta) {
    this.api = new BdApi(meta.name);
    this.cache = {};
    this.retries = {};
    this.queue = [];
    this.pending = new Set();
    this.skipped = new Map();
    this.active = this.paused = this.busy = false;
    this.backoff = 0;
    this.langNames = {};
    this.settings = {
      skipLangs: this.api.Data.load("settings")?.skipLangs || [],
    };
  }

  start() {
    this.LocaleStore = BdApi.Webpack.Stores.LocaleStore;
    this.Dispatcher = BdApi.Webpack.Stores.UserStore._dispatcher;
    this.active = true;
    this.targetLang = this.LocaleStore.locale.split("-")[0];
    this.meId = BdApi.Webpack.Stores.UserStore.getCurrentUser().id;
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
        background: var(--brand-500);
        color: white;
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
      .at-note {
        font-size: 0.625rem;
        margin-left: 0.25rem;
        line-height: 1;
        color: var(--chat-text-muted);
        text-transform: lowercase;
        user-select: none;
      }
    `);

    this.modules = AutoTranslate.getModules();
    this.patch();

    this.onLocale = () => {
      const loc = this.LocaleStore.locale?.split("-")[0];
      if (!loc || loc === this.targetLang) return;
      this.targetLang = loc;
      this.reset();
      this.prepLang();
    };
    this.LocaleStore.addChangeListener(this.onLocale);
  }

  stop() {
    this.active = false;
    this.LocaleStore?.removeChangeListener(this.onLocale);
    clearTimeout(this.flushTimer);
    clearTimeout(this.pauseTimer);
    clearTimeout(this.drainTimer);
    this.api.Patcher.unpatchAll();
    this.api.DOM.removeStyle();
    this.reset();
    this.parser = null;
    this.langNames = {};
  }

  reset() {
    this.cache = {};
    this.queue = [];
    this.retries = {};
    this.backoff = 0;
    this.pending.clear();
    this.skipped.clear();
    this.dirty?.clear();
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
      .catch(() => {});

    try {
      const r = await BdApi.Net.fetch(
        `https://translate.googleapis.com/translate_a/l?client=gtx&hl=${target}`,
      );
      if (!r.ok || !this.active || this.targetLang !== target) return;
      const body = await r.json();
      this.langNames = body.tl || body.sl || {};
    } catch {}
  }

  patch() {
    const { MessageContent, Parser } = this.modules;
    this.parser = Parser;
    this.dirty = new Map();

    this.api.Patcher.instead(
      MessageContent,
      "compare",
      (_, [prev, next], orig) =>
        !this.dirty.delete(next?.message?.id) && orig(prev, next),
    );

    const render = (ret, translation) => {
      if (!Array.isArray(ret?.props?.children)) return;
      ret.props.children[0] = h(
        "span",
        { key: "at-content" },
        h(
          "span",
          { className: "at-trans" },
          this.parser.parse(translation.text),
        ),
        h("span", { className: "at-orig" }, this.parser.parse(translation.raw)),
        " ",
        h(
          "span",
          { className: "at-note" },
          "(",
          h("span", { className: "at-trans" }, this.label),
          h(
            "span",
            { className: "at-orig" },
            this.langNames[translation.src] || translation.src,
          ),
          ")",
        ),
      );
    };

    this.api.Patcher.after(MessageContent, "type", (_, [props], ret) => {
      const msg = props?.message;
      if (!msg?.id) return;
      if (props.className?.includes("repliedTextContent")) return;

      const raw = msg.content || "";
      const translation = this.cache[msg.id];

      if (translation && translation.raw === raw) {
        render(ret, translation);
        return;
      }

      const skipEntry = this.skipped.get(msg.id);
      if (skipEntry && skipEntry.raw === raw) return;

      if (this.pending.has(msg.id)) return;

      const stripped = strip(raw);

      if (translation) {
        if (stripped === translation.stripped) {
          translation.raw = raw;
          render(ret, translation);
          return;
        }
        delete this.cache[msg.id];
        delete this.retries[msg.id];
      }

      if (skipEntry) {
        if (stripped === skipEntry.stripped) {
          skipEntry.raw = raw;
          return;
        }
        this.skipped.delete(msg.id);
      }

      if (this.skip(msg, stripped)) {
        this.skipped.set(msg.id, { raw, stripped, cid: msg.channel_id });
        return;
      }

      this.pending.add(msg.id);
      this.enqueue(msg.id, stripped, msg.channel_id, raw);
    });
  }

  skip(msg, stripped) {
    const text = msg.content?.trim();
    return (
      msg.author?.id === this.meId ||
      msg.author?.bot ||
      !text ||
      text.length < 2 ||
      EMOJI_ONLY_RE.test(text) ||
      stripped.length < 2 ||
      junk(stripped)
    );
  }

  enqueue(msgId, stripped, cid, raw) {
    this.queue.push({ msgId, stripped, cid, raw });
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
        const batch = this.queue.splice(0, 50);
        await this.runBatch(batch);
      }
    } finally {
      this.busy = false;
    }
  }

  async runBatch(batch) {
    if (!this.active) return;
    const target = this.targetLang;
    const result = await this.translate(
      batch.map((b) => b.raw),
      target,
    ).catch(() => null);
    if (!this.active || target !== this.targetLang) return;

    if (result?.rateLimited) {
      this.paused = true;
      this.backoff = Math.min((this.backoff || 2.5) * 2, 60);
      BdApi.UI.showToast(
        `AutoTranslate: paused, retrying in ${this.backoff}s`,
        { type: "warning" },
      );
      this.pauseTimer = setTimeout(() => {
        this.paused = false;
        this.pauseTimer = null;
        if (this.queue.length) this.drain();
      }, this.backoff * 1000);
      this.queue.unshift(...batch);
      return;
    }

    if (!result) {
      for (const { msgId, stripped, cid, raw } of batch) {
        this.pending.delete(msgId);
        this.retry(msgId, stripped, cid, raw);
      }
      return;
    }

    const isTarget = await this.detectTarget(batch, result.results, target);
    if (!this.active || target !== this.targetLang) return;

    this.backoff = 0;
    for (let i = 0; i < batch.length; i++) {
      const { msgId, stripped, cid, raw } = batch[i];
      const r = result.results[i];
      this.pending.delete(msgId);

      if (!r?.text) {
        this.retry(msgId, stripped, cid, raw);
        continue;
      }
      if (
        r.src === target ||
        isTarget.has(i) ||
        this.settings.skipLangs.includes(r.src) ||
        passthrough(raw, r.text)
      ) {
        this.skipped.set(msgId, { raw, stripped, cid });
        continue;
      }

      delete this.retries[msgId];
      this.cache[msgId] = { text: r.text, src: r.src, stripped, raw, cid };
      this.dirty.set(msgId, cid);
    }
    this.flush();
  }

  async translate(texts, target, source = "auto") {
    const params = new URLSearchParams([
      ["client", "gtx"],
      ["dt", "t"],
      ["sl", source],
      ["tl", target],
      ["ie", "UTF-8"],
      ["oe", "UTF-8"],
      ...texts.map((t) => ["q", t]),
    ]);
    const resp = await BdApi.Net.fetch(
      `https://translate.googleapis.com/translate_a/t?${params}`,
    );
    if (resp.status === 429) return { rateLimited: true };
    if (!resp.ok) return null;
    const body = await resp.json();
    if (!Array.isArray(body) || body.length !== texts.length) return null;
    return {
      results: body.map((e) =>
        Array.isArray(e) ? { text: e[0], src: e[1] } : { text: e, src: source },
      ),
    };
  }

  async detectTarget(batch, results, target) {
    const cand = [...batch.keys()].filter((i) => {
      const { raw } = batch[i];
      const src = results[i]?.src;
      return (
        src &&
        src !== target &&
        raw.length >= 4 &&
        raw.length < 30 &&
        ASCII_ONLY.test(raw) &&
        !raw.includes(" ")
      );
    });
    if (!cand.length) return new Set();
    const tl = target === "en" ? "pl" : "en";
    const v = await this.translate(
      cand.map((i) => batch[i].raw),
      tl,
      target,
    ).catch(() => null);
    if (!v?.results) return new Set();
    return new Set(
      cand.filter((bi, j) => {
        const t = v.results[j]?.text?.toLowerCase();
        return t && t !== batch[bi].raw.toLowerCase();
      }),
    );
  }

  retry(msgId, stripped, cid, raw) {
    const count = (this.retries[msgId] || 0) + 1;
    if (count > 2) {
      delete this.retries[msgId];
      this.skipped.set(msgId, { raw, stripped, cid });
      return;
    }
    this.retries[msgId] = count;
    this.pending.add(msgId);
    this.enqueue(msgId, stripped, cid, raw);
  }

  flush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (!this.active || !this.dirty?.size) return;
      for (const [id, cid] of this.dirty) {
        this.Dispatcher.dispatch({
          type: "MESSAGE_UPDATE",
          message: { channel_id: cid, id },
        });
      }
    }, 300);
  }

  setSkipLangs(list) {
    const prev = this.settings.skipLangs;
    this.settings.skipLangs = list;
    this.api.Data.save("settings", this.settings);

    for (const [id, t] of Object.entries(this.cache)) {
      if (list.includes(t.src)) {
        delete this.cache[id];
        this.skipped.set(id, t);
        this.dirty?.set(id, t.cid);
      }
    }

    if (prev.some((c) => !list.includes(c))) {
      for (const [id, s] of this.skipped) this.dirty?.set(id, s.cid);
      this.skipped.clear();
    }

    this.flush();
  }

  getSettingsPanel() {
    const self = this;
    function Panel() {
      const [list, setList] = React.useState(self.settings.skipLangs);
      const up = (v) => {
        setList(v);
        self.setSkipLangs(v);
      };
      const langOf = (c) => self.langNames[c] || c;
      const options = Object.entries(self.langNames)
        .filter(
          ([c]) => c !== "auto" && c !== self.targetLang && !list.includes(c),
        )
        .map(([c, name]) => ({ label: name, value: c }))
        .sort((a, b) => a.label.localeCompare(b.label));

      return h(
        "div",
        { style: { padding: "20px 10px 10px" } },
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            },
          },
          h(
            "span",
            {
              style: {
                color: "var(--text-default)",
                fontSize: 14,
                fontWeight: 600,
              },
            },
            "Do Not Translate",
          ),
          h(
            "div",
            { style: { flex: 1 } },
            h(BdApi.Components.DropdownInput, {
              value: "",
              options: [{ label: "Add language...", value: "" }, ...options],
              onChange: (v) => {
                if (v) up([...list, v]);
              },
            }),
          ),
        ),
        h(
          "div",
          { style: { display: "flex", flexWrap: "wrap", gap: 6 } },
          self.targetLang &&
            h(
              "span",
              {
                className: "at-tag",
                style: { opacity: 0.8, paddingInline: 14 },
              },
              langOf(self.targetLang),
            ),
          list.map((code) =>
            h(
              "span",
              { key: code, className: "at-tag" },
              langOf(code),
              h(
                "span",
                {
                  className: "at-close",
                  onClick: () => up(list.filter((c) => c !== code)),
                },
                "\u00D7",
              ),
            ),
          ),
        ),
      );
    }
    return h(Panel);
  }

  static getModules() {
    const {
      Webpack,
      Webpack: { Filters },
    } = BdApi;
    return {
      ...Webpack.getBulkKeyed({
        Parser: { filter: Filters.byKeys("parse", "parseTopic") },
      }),
      MessageContent: Webpack.getModule(
        (e) => {
          const s = e?.type?.toString?.();
          return (
            s?.includes("SEND_FAILED") && s.includes("contentRef") && e.compare
          );
        },
        { searchExports: true },
      ),
    };
  }
};
