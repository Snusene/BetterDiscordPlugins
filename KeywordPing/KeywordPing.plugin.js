/**
 * @name KeywordPing
 * @author Snues
 * @authorId 98862725609816064
 * @description Get notified when messages match your keywords.
 * @version 3.0.0
 * @invite xp2f3YFKMY
 * @source https://github.com/Snusene/BetterDiscordPlugins/tree/main/KeywordPing
 * @donate https://ko-fi.com/snues
 */

module.exports = class KeywordPing {
  constructor() {
    this.compiledKeywords = [];
    this.keywordMentions = new Map();
    this.css = `
            .kp-settings-panel { padding: 10px; }
            .kp-settings-group { margin-bottom: 20px; }
            .kp-category-content .kp-settings-group:last-child { margin-bottom: 0; }
            .kp-settings-group-title { color: var(--text-muted); font-size: 12px; font-weight: 700; text-transform: uppercase; display: inline; margin-right: 6px; }
            .kp-settings-group-header { margin-bottom: 8px; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
            .kp-count { background: var(--brand-500); color: var(--white); font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 10px; }
            .kp-textarea { width: 100%; min-height: 120px; background: var(--input-background-default); border: 1px solid var(--input-border-default); border-radius: 8px; padding: 10px; color: var(--text-default); font-family: inherit; font-size: 14px; resize: none; box-sizing: border-box; overflow-y: auto; scrollbar-width: none; transition: border-color 0.15s ease; }
            .kp-textarea:hover { border-color: var(--input-border-hover); scrollbar-width: thin; scrollbar-color: var(--scrollbar-auto-thumb) transparent; }
            .kp-textarea:focus { border-color: var(--input-border-active); outline: none; }
            .kp-textarea::-webkit-scrollbar { width: 8px; background: transparent; }
            .kp-textarea::-webkit-scrollbar-track { background: transparent; }
            .kp-textarea::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; }
            .kp-textarea:hover::-webkit-scrollbar-thumb { background: var(--scrollbar-auto-thumb); }
            .kp-textarea::placeholder { color: var(--input-placeholder-text-default); }
            .kp-hint { color: var(--text-muted); font-size: 12px; line-height: 1.5; }
            .kp-error { color: var(--text-feedback-critical); font-size: 12px; margin-top: 4px; }
            .kp-category { margin-bottom: 16px; border: 1px solid var(--border-muted); border-radius: 8px; overflow: hidden; }
            .kp-category-header { display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--background-mod-subtle); cursor: pointer; user-select: none; }
            .kp-category-header:hover { filter: brightness(0.9); }
            .kp-category-title { color: var(--text-strong); font-size: 14px; font-weight: 600; }
            .kp-category-arrow { color: var(--text-muted); transition: transform 0.2s; }
            .kp-category-arrow.open { transform: rotate(90deg); }
            .kp-category-content { padding: 12px; display: none; background: var(--background-mod-muted); }
            .kp-category-content.open { display: block; }
            .kp-server-list { max-height: 200px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--scrollbar-auto-thumb) transparent; }
            .kp-server-list::-webkit-scrollbar { width: 8px; background: transparent; }
            .kp-server-list::-webkit-scrollbar-track { background: transparent; }
            .kp-server-list::-webkit-scrollbar-thumb { background: var(--scrollbar-auto-thumb); border-radius: 4px; }
            .kp-server-item { display: flex; align-items: center; padding: 8px; border-radius: 4px; gap: 10px; }
            .kp-server-icon { width: 24px; height: 24px; border-radius: 50%; background: var(--background-mod-normal); flex-shrink: 0; object-fit: cover; }
            .kp-server-icon-placeholder { width: 24px; height: 24px; border-radius: 50%; background: var(--background-mod-normal); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 10px; color: var(--text-muted); font-weight: 600; }
            .kp-server-item:hover { background: var(--interactive-background-hover); }
            .kp-server-name { color: var(--text-default); font-size: 14px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .kp-toggle { position: relative; width: 40px; height: 24px; background: var(--background-mod-strong); border-radius: 12px; cursor: pointer; transition: background 0.2s; }
            .kp-toggle.on { background: var(--control-brand-foreground); }
            .kp-toggle-knob { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: var(--white); border-radius: 50%; transition: left 0.2s; }
            .kp-toggle.on .kp-toggle-knob { left: 18px; }
        `;
  }

  start() {
    BdApi.DOM.addStyle("KeywordPing", this.css);
    this.loadSettings();
    this.compileKeywords();
    const { Stores } = BdApi.Webpack;
    this.UserStore = Stores.UserStore;
    this.ChannelStore = Stores.ChannelStore;
    this.GuildStore = Stores.GuildStore;
    this.GuildMemberStore = Stores.GuildMemberStore;
    this.SortedGuildStore = Stores.SortedGuildStore;
    this.MessageStore = Stores.MessageStore;
    this.RelationshipStore = Stores.RelationshipStore;
    this.ReadStateStore = Stores.ReadStateStore;
    this.GuildReadStateStore = Stores.GuildReadStateStore;
    this.cachedMessages = new Map();
    this.hydrated = false;
    this._force = new Set();
    this._skipIds = new Set();
    this._badges = new Set();
    this._muted = false;
    this._inbox = false;
    this._ready = false;
    const api = new BdApi("KeywordPing");
    this._patcher = api.Patcher;
    this._logger = api.Logger;
    this._patcher.after(
      this.GuildReadStateStore,
      "hasUnread",
      (_, args, ret) => {
        if (ret) return ret;
        for (const chId of this._badges) {
          const c = this.ChannelStore.getChannel(chId);
          if (c?.guild_id === args[0]) return true;
        }
        return ret;
      },
    );
    this._patcher.after(
      this.ReadStateStore,
      "getMentionCount",
      (_, args, ret) => {
        return this._badges.has(args[0]) ? ret + 1 : ret;
      },
    );
    this.ensure();
    this.hydrateFromAPI();
    this.setupInterceptor();
  }

  stop() {
    BdApi.DOM.removeStyle("KeywordPing");
    this.saveSettings();
    this.saveMentions?.cancel?.();
    this._patcher?.unpatchAll();
    this._force = null;
    this._patcher = null;
    this._logger = null;
    this._skipIds = null;
    this._badges = null;
    this.ReadStateStore = null;
    this.GuildReadStateStore = null;

    if (this.Dispatcher && this.interceptor) {
      const idx = this.Dispatcher._interceptors?.indexOf(this.interceptor);
      if (idx > -1) this.Dispatcher._interceptors.splice(idx, 1);
    }

    this.interceptor = null;
    this.Dispatcher = null;
    this.UserStore = null;
    this.ChannelStore = null;
    this.GuildStore = null;
    this.GuildMemberStore = null;
    this.SortedGuildStore = null;
    this.MessageStore = null;
    this.RelationshipStore = null;
    this.compiledKeywords = [];
    this.keywordMentions.clear();
    this.cachedMessages = null;
    this.MessageActions = null;
    this.IconUtils = null;
    this.ChannelTypes = null;
    this.MessageTypes = null;
    this.MessageFlags = null;
    this.NotificationLevels = null;
    this.saveMentions = null;
  }

  async hydrateFromAPI() {
    if (this.hydrated || !this.MessageActions?.fetchMessage) return;
    this.hydrated = true;
    const cache = this.cachedMessages;
    const entries = [...this.keywordMentions];
    let pruned = false;
    const fetchOne = async ([id, chId]) => {
      if (cache !== this.cachedMessages) return;
      if (this.MessageStore?.getMessage(chId, id)) return;
      try {
        const msg = await this.MessageActions.fetchMessage({
          channelId: chId,
          messageId: id,
        });
        if (cache !== this.cachedMessages) return;
        if (msg) cache.set(id, msg);
        else {
          this.keywordMentions.delete(id);
          pruned = true;
        }
      } catch (e) {
        if (e?.status === 404 || e?.status === 403) {
          this.keywordMentions.delete(id);
          pruned = true;
        }
      }
    };
    for (let i = 0; i < entries.length; i += 5) {
      await Promise.all(entries.slice(i, i + 5).map(fetchOne));
    }
    if (pruned) this.saveMentions?.();
    BdApi.Webpack.Stores.RecentMentionsStore?.emitChange();
  }

  ensure() {
    if (this._ready) return [];
    const { Filters } = BdApi.Webpack;
    const filters = {
      MessageActions: {
        filter: Filters.byKeys("fetchMessages", "jumpToMessage"),
      },
      IconUtils: {
        filter: Filters.byKeys("getUserAvatarURL", "getGuildIconURL"),
      },
      ChannelTypes: {
        filter: Filters.byKeys("PUBLIC_THREAD", "GUILD_FORUM"),
        searchExports: true,
      },
      MessageTypes: {
        filter: Filters.byKeys("THREAD_CREATED"),
        searchExports: true,
      },
      MessageFlags: {
        filter: Filters.byKeys("SUPPRESS_NOTIFICATIONS", "EPHEMERAL"),
        searchExports: true,
      },
      NotificationLevels: {
        filter: Filters.byKeys("ALL_MESSAGES", "ONLY_MENTIONS"),
        searchExports: true,
      },
    };
    const need = {};
    for (const k in filters) if (!this[k]) need[k] = filters[k];
    if (Object.keys(need).length) {
      Object.assign(this, BdApi.Webpack.getBulkKeyed(need));
    }
    const missing = Object.keys(filters).filter((k) => !this[k]);

    if (!this._muted && this.NotificationLevels) {
      const [notifModule, notifKey] = BdApi.Webpack.getWithKey(
        BdApi.Webpack.Filters.byStrings(
          "parent_id",
          "isGuildOrCategoryOrChannelMuted",
        ),
      );
      if (notifModule) {
        this._patcher.instead(
          notifModule,
          notifKey,
          (thisVal, args, original) =>
            this._force.has(args[0]?.id)
              ? this.NotificationLevels.ALL_MESSAGES
              : original.apply(thisVal, args),
        );
        this._muted = true;
      }
    }
    if (!this._muted) missing.push("notifModule");

    if (!this._inbox) {
      const RMS = BdApi.Webpack.Stores.RecentMentionsStore;
      if (RMS) {
        this._patcher.after(
          RMS,
          "getSettingsFilteredMentions",
          (_, args, ret) => {
            if (!ret) return ret;
            const present = new Set(ret.map((m) => m.id));
            const mine = [];
            for (const [id, chId] of this.keywordMentions) {
              if (present.has(id)) continue;
              const msg =
                this.MessageStore.getMessage(chId, id) ||
                this.cachedMessages.get(id);
              if (msg) mine.push(msg);
            }
            if (!mine.length) return ret;
            return [...ret, ...mine].sort((a, b) =>
              b.id.localeCompare(a.id, undefined, { numeric: true }),
            );
          },
        );
        this._inbox = true;
      }
    }
    if (!this._inbox) missing.push("RecentMentionsStore");

    if (!missing.length) this._ready = true;
    return missing;
  }

  setupInterceptor() {
    this.Dispatcher = this.UserStore._dispatcher;
    this.interceptor = (event) => {
      try {
        if (event.type === "MESSAGE_CREATE") {
          this.handleMessage(event);
        }
        if (event.type === "THREAD_CREATE" && event.isNewlyCreated) {
          this.forumPost(event.channel);
        }
        if (event.type === "CHANNEL_SELECT" || event.type === "MESSAGE_ACK") {
          const cid = event.channelId || event.id;
          if (cid && this._badges.delete(cid)) {
            this.GuildReadStateStore.emitChange();
            this.ReadStateStore.emitChange();
          }
        }
        if (event.type === "MESSAGE_DELETE") {
          if (this.keywordMentions.delete(event.id)) this.saveMentions?.();
        }
        if (event.type === "LOAD_RECENT_MENTIONS_SUCCESS" && !event.isAfter) {
          const m = this.ensure();
          if (m.length) return this._logger.error(m.join(", ") + " missing");
          this.hydrateFromAPI();
          const ids = new Set(event.messages.map((m) => m.id));
          const extras = [];
          for (const [id, chId] of this.keywordMentions) {
            if (ids.has(id)) continue;
            const msg =
              this.MessageStore.getMessage(chId, id) ||
              this.cachedMessages.get(id);
            if (msg) extras.push(msg);
          }
          if (extras.length) {
            event.messages = [...event.messages, ...extras].sort((a, b) =>
              b.id.localeCompare(a.id, undefined, { numeric: true }),
            );
          }
        }
      } catch (e) {
        this._logger.stacktrace("interceptor", e);
      }
      return false;
    };
    this.Dispatcher.addInterceptor(this.interceptor);
  }

  loadSettings() {
    const saved = BdApi.Data.load("KeywordPing", "settings") || {};
    this.settings = {
      keywords: saved.keywords || [],
      whitelistedUsers: saved.whitelistedUsers || [],
      guilds: saved.guilds || {},
    };
    this.keywordMentions = new Map(
      BdApi.Data.load("KeywordPing", "mentions") || [],
    );
    this.saveMentions = BdApi.Utils.debounce(
      () =>
        BdApi.Data.save("KeywordPing", "mentions", [...this.keywordMentions]),
      1000,
    );
  }

  saveSettings() {
    BdApi.Data.save("KeywordPing", "settings", this.settings);
  }

  compileKeywords() {
    this.compiledKeywords = [];
    for (const keyword of this.settings.keywords) {
      if (!keyword.trim()) continue;
      const result = this.parseKeyword(keyword);
      if (result) this.compiledKeywords.push(result);
    }
  }

  getSettingsPanel() {
    const { React, Hooks } = BdApi;
    const plugin = this;
    const defaultSettings = { keywords: [], whitelistedUsers: [], guilds: {} };

    const SettingsPanel = () => {
      const settings =
        Hooks.useData("KeywordPing", "settings") ?? defaultSettings;
      const [keywords, setKeywords] = React.useState(
        settings.keywords.join("\n"),
      );
      const [vipUsers, setVipUsers] = React.useState(
        settings.whitelistedUsers.join("\n"),
      );
      const [advancedOpen, setAdvancedOpen] = React.useState(false);

      const keywordList = keywords.split("\n").filter((k) => k.trim());
      const keywordCount = keywordList.length;
      const invalidPatterns = keywordList.filter(
        (k) => !plugin.isValidPattern(k),
      );

      const updateSettings = (newSettings) => {
        BdApi.Data.save("KeywordPing", "settings", newSettings);
        plugin.settings = newSettings;
      };

      const handleKeywordsChange = (e) => {
        const val = e.target.value;
        setKeywords(val);
        const newKeywords = val.split("\n").filter((k) => k.trim());
        updateSettings({ ...settings, keywords: newKeywords });
        plugin.compileKeywords();
      };

      const handleVipUsersChange = (e) => {
        const val = e.target.value;
        setVipUsers(val);
        const newVipUsers = val.split("\n").filter((k) => k.trim());
        updateSettings({ ...settings, whitelistedUsers: newVipUsers });
      };

      const handleGuildToggle = (guildId) => {
        const currentEnabled = settings.guilds[guildId]?.enabled !== false;
        const newGuilds = {
          ...settings.guilds,
          [guildId]: { ...settings.guilds[guildId], enabled: !currentEnabled },
        };
        updateSettings({ ...settings, guilds: newGuilds });
      };

      const guilds = plugin.GuildStore?.getGuilds() || {};
      const guildOrder =
        plugin.SortedGuildStore?.getFlattenedGuildIds?.() || [];
      const sortedGuilds = guildOrder.map((id) => guilds[id]).filter(Boolean);

      const e = React.createElement;
      return e(
        "div",
        { className: "kp-settings-panel" },
        e(
          "div",
          { className: "kp-settings-group" },
          e(
            "div",
            { className: "kp-settings-group-header" },
            e("span", { className: "kp-settings-group-title" }, "Keywords"),
            e("span", { className: "kp-hint" }, "One keyword per line"),
            keywordCount > 0 &&
              e("span", { className: "kp-count" }, keywordCount),
          ),
          e("textarea", {
            className: "kp-textarea",
            value: keywords,
            onChange: handleKeywordsChange,
            placeholder:
              "hello\n/regex/i\n@username:keyword\n#channelid:keyword\nserverid:keyword",
          }),
          invalidPatterns.length > 0 &&
            e(
              "div",
              { className: "kp-error" },
              "Invalid pattern: " + invalidPatterns.join(", "),
            ),
        ),
        e(
          "div",
          { className: "kp-category" },
          e(
            "div",
            {
              className: "kp-category-header",
              onClick: () => setAdvancedOpen(!advancedOpen),
            },
            e("span", { className: "kp-category-title" }, "Advanced"),
            e(
              "span",
              {
                className: "kp-category-arrow" + (advancedOpen ? " open" : ""),
              },
              "▶",
            ),
          ),
          e(
            "div",
            {
              className: "kp-category-content" + (advancedOpen ? " open" : ""),
            },
            e(
              "div",
              { className: "kp-settings-group" },
              e(
                "div",
                { className: "kp-settings-group-header" },
                e(
                  "span",
                  { className: "kp-settings-group-title" },
                  "VIP Users",
                ),
                e(
                  "span",
                  { className: "kp-hint" },
                  "Always notify for any message from these users",
                ),
              ),
              e("textarea", {
                className: "kp-textarea",
                style: { minHeight: "100px" },
                value: vipUsers,
                onChange: handleVipUsersChange,
                placeholder: "username\ndisplay name\nnickname\nuser id",
              }),
            ),
            e(
              "div",
              null,
              e(
                "div",
                { className: "kp-hint", style: { marginBottom: "12px" } },
                "Servers to listen for keywords",
              ),
              e(
                "div",
                { className: "kp-server-list" },
                sortedGuilds.map((guild) =>
                  e(
                    "div",
                    { key: guild.id, className: "kp-server-item" },
                    guild.icon
                      ? e("img", {
                          className: "kp-server-icon",
                          src: plugin.IconUtils?.getGuildIconURL({
                            id: guild.id,
                            icon: guild.icon,
                            size: 32,
                          }),
                        })
                      : e(
                          "div",
                          { className: "kp-server-icon-placeholder" },
                          guild.name.charAt(0).toUpperCase(),
                        ),
                    e("span", { className: "kp-server-name" }, guild.name),
                    e(
                      "div",
                      {
                        className:
                          "kp-toggle" +
                          (settings.guilds[guild.id]?.enabled !== false
                            ? " on"
                            : ""),
                        onClick: () => handleGuildToggle(guild.id),
                      },
                      e("div", { className: "kp-toggle-knob" }),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    };

    return BdApi.React.createElement(SettingsPanel);
  }

  isValidPattern(keyword) {
    let pattern = keyword;
    const userFilterMatch = /^@([^:]+):(.+)$/.exec(keyword);
    if (userFilterMatch) pattern = userFilterMatch[2];
    else {
      const idFilterMatch = /^(#?)(\d+):(.+)$/.exec(keyword);
      if (idFilterMatch) pattern = idFilterMatch[3];
    }
    const regexMatch = /^\/(.+)\/([gimsuy]*)$/.exec(pattern);
    if (regexMatch) {
      try {
        new RegExp(regexMatch[1], regexMatch[2]);
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }

  handleMessage(event) {
    const { message } = event;
    if (!message?.author) return;
    if (event.optimistic) return;
    if (this._skipIds.has(message.id)) return;
    const m = this.ensure();
    if (m.length) return this._logger.error(m.join(", ") + " missing");
    const newThreadName =
      message.type === this.MessageTypes.THREAD_CREATED
        ? message.thread?.name
        : null;
    if (
      !message.content &&
      !message.embeds?.length &&
      !newThreadName &&
      !message.poll &&
      !message.message_snapshots?.length
    )
      return;

    const currentUser = this.UserStore.getCurrentUser();
    if (!currentUser) return;

    const channel = this.ChannelStore.getChannel(message.channel_id);
    const guildId = message.guild_id || channel?.guild_id;
    if (!guildId) return;
    if (!message.guild_id) message.guild_id = guildId;

    if (message.author.id === currentUser.id) return;
    if (this.RelationshipStore?.isBlocked(message.author.id)) return;

    if (this.settings.guilds[guildId]?.enabled === false) return;

    const threadName =
      channel?.type === this.ChannelTypes.PUBLIC_THREAD &&
      channel.id === message.id &&
      this.ChannelStore.getChannel(channel.parent_id)?.type ===
        this.ChannelTypes.GUILD_FORUM
        ? channel.name
        : null;
    let matched = this.matchesUser(
      this.settings.whitelistedUsers,
      message.author,
      guildId,
    );
    if (!matched && message.author.bot) return;
    if (!matched) {
      const sources = [
        message.content,
        threadName,
        newThreadName,
        message.poll?.question?.text,
        ...(message.poll?.answers?.map((a) => a.poll_media?.text) || []),
        ...(message.embeds?.flatMap((e) => this.embedTexts(e)) || []),
        ...(message.message_snapshots?.flatMap((s) => [
          s.message?.content,
          ...(s.message?.embeds?.flatMap((e) => this.embedTexts(e)) || []),
        ]) || []),
      ].filter(Boolean);
      for (const compiled of this.compiledKeywords) {
        if (compiled.filter && !this.passesFilter(compiled.filter, message))
          continue;
        compiled.regex.lastIndex = 0;
        if (sources.some((s) => compiled.regex.test(s))) {
          matched = true;
          break;
        }
      }
    }

    if (matched) {
      if (
        channel &&
        (channel.type === this.ChannelTypes.ANNOUNCEMENT_THREAD ||
          channel.type === this.ChannelTypes.PUBLIC_THREAD ||
          channel.type === this.ChannelTypes.PRIVATE_THREAD)
      ) {
        this._force.add(channel.id);
        setTimeout(() => this._force?.delete(channel.id), 100);
      }
      if (!message.mentions?.some((m) => m.id === currentUser.id)) {
        message.mentions = [...(message.mentions || []), currentUser];
        message.mentioned = true;
      }
      message.flags &= ~this.MessageFlags.SUPPRESS_NOTIFICATIONS;
      this.cachedMessages.set(message.id, message);
      this.keywordMentions.set(message.id, message.channel_id);
      if (this.keywordMentions.size > 25) {
        this.keywordMentions.delete(this.keywordMentions.keys().next().value);
      }
      this.saveMentions?.();
    }
  }

  forumPost(channel) {
    const m = this.ensure();
    if (m.length) return this._logger.error(m.join(", ") + " missing");
    if (channel?.type !== this.ChannelTypes.PUBLIC_THREAD) return;
    if (
      this.ChannelStore.getChannel(channel.parent_id)?.type !==
      this.ChannelTypes.GUILD_FORUM
    )
      return;
    const currentUser = this.UserStore.getCurrentUser();
    if (!currentUser || channel.ownerId === currentUser.id) return;
    if (this.RelationshipStore?.isBlocked(channel.ownerId)) return;
    if (this.settings.guilds[channel.guild_id]?.enabled === false) return;
    if (this._skipIds.has(channel.id)) return;

    const author = this.UserStore.getUser(channel.ownerId) || {
      id: channel.ownerId,
    };
    const fakeMsg = {
      author,
      channel_id: channel.id,
      guild_id: channel.guild_id,
    };
    let matched = this.matchesUser(
      this.settings.whitelistedUsers,
      author,
      channel.guild_id,
    );
    if (!matched && author.bot) return;
    if (!matched) {
      for (const c of this.compiledKeywords) {
        if (c.filter && !this.passesFilter(c.filter, fakeMsg)) continue;
        c.regex.lastIndex = 0;
        if (c.regex.test(channel.name)) {
          matched = true;
          break;
        }
      }
    }
    if (!matched) return;

    this._skipIds.add(channel.id);
    setTimeout(() => this._skipIds?.delete(channel.id), 5000);
    this.keywordMentions.set(channel.id, channel.id);
    if (this.keywordMentions.size > 25) {
      this.keywordMentions.delete(this.keywordMentions.keys().next().value);
    }
    this.saveMentions?.();
    this._badges.add(channel.id);

    const cache = this.cachedMessages;
    this.MessageActions.fetchMessage({
      channelId: channel.id,
      messageId: channel.id,
    })
      .then((msg) => {
        if (!msg || cache !== this.cachedMessages) return;
        cache.set(channel.id, msg);
        const currentUser = this.UserStore.getCurrentUser();
        if (
          currentUser &&
          !msg.mentions?.some((m) => m.id === currentUser.id)
        ) {
          msg.mentions = [...(msg.mentions || []), currentUser];
          msg.mentioned = true;
        }
        this._force.add(channel.id);
        setTimeout(() => this._force?.delete(channel.id), 100);
        this.Dispatcher.dispatch({
          type: "MESSAGE_CREATE",
          message: msg,
          channelId: channel.id,
          optimistic: false,
        });
      })
      .catch(() => {});
  }

  parseKeyword(keyword) {
    let filter = null,
      pattern = keyword;
    const userFilterMatch = /^@([^:]+):(.+)$/.exec(keyword);
    if (userFilterMatch) {
      filter = { type: "@", id: userFilterMatch[1] };
      pattern = userFilterMatch[2];
    } else {
      const idFilterMatch = /^(#?)(\d+):(.+)$/.exec(keyword);
      if (idFilterMatch) {
        filter = { type: idFilterMatch[1] || "guild", id: idFilterMatch[2] };
        pattern = idFilterMatch[3];
      }
    }
    try {
      const regexMatch = /^\/(.+)\/([gimsuy]*)$/.exec(pattern);
      if (regexMatch) {
        return { filter, regex: new RegExp(regexMatch[1], regexMatch[2]) };
      }
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return { filter, regex: new RegExp(`(?<!\\w)${escaped}(?!\\w)`, "i") };
    } catch {
      return null;
    }
  }

  passesFilter(filter, message) {
    if (filter.type === "@") {
      if (/^\d+$/.test(filter.id)) return message.author.id === filter.id;
      return this.matchesUser([filter.id], message.author, message.guild_id);
    }
    if (filter.type === "#") return message.channel_id === filter.id;
    return message.guild_id === filter.id;
  }

  embedTexts(e) {
    return [
      e.title,
      e.description,
      e.author?.name,
      e.footer?.text,
      e.provider?.name,
      ...(e.fields?.flatMap((f) => [f.name, f.value]) || []),
    ].filter(Boolean);
  }

  matchesUser(list, author, guildId = null) {
    const user = this.UserStore.getUser(author.id) || author;
    const username = (user.username || author.username)?.toLowerCase();
    const displayName = (
      user.globalName ||
      user.global_name ||
      author.globalName ||
      author.global_name
    )?.toLowerCase();

    let nickname = null;
    if (guildId && this.GuildMemberStore) {
      nickname = this.GuildMemberStore.getMember(
        guildId,
        author.id,
      )?.nick?.toLowerCase();
    }

    return list.some((entry) => {
      const e = entry.toLowerCase();
      return (
        author.id === entry ||
        username === e ||
        displayName === e ||
        nickname === e
      );
    });
  }
};
