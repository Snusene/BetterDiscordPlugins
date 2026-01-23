/**
 * @name KeywordPing
 * @author Snues
 * @authorId 98862725609816064
 * @description Get notified when messages match your keywords.
 * @version 2.4.7
 * @website https://github.com/Snusene/BetterDiscordPlugins/tree/main/KeywordPing
 * @source https://raw.githubusercontent.com/Snusene/BetterDiscordPlugins/main/KeywordPing/KeywordPing.plugin.js
 */

module.exports = class KeywordPing {
  constructor() {
    this.settings = null;
    this.compiledKeywords = [];
    this.currentUserId = null;
    this.UserStore = null;
    this.ChannelStore = null;
    this.GuildStore = null;
    this.GuildMemberStore = null;
    this.Dispatcher = null;
    this.interceptor = null;
    this.css = `
            .kp-settings-panel { padding: 10px; }
            .kp-settings-group { margin-bottom: 20px; }
            .kp-category-content .kp-settings-group:last-child { margin-bottom: 0; }
            .kp-settings-group-title { color: var(--primary-330); font-size: 12px; font-weight: 700; text-transform: uppercase; display: inline; margin-right: 6px; }
            .kp-settings-group-header { margin-bottom: 8px; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
            .kp-count { background: var(--brand-500); color: white; font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 10px; }
            .kp-textarea { width: 100%; min-height: 120px; background: rgba(0,0,0,0.08); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 10px; color: var(--primary-230); font-family: inherit; font-size: 14px; resize: none; box-sizing: border-box; overflow-y: auto; scrollbar-width: none; transition: border-color 0.15s ease; }
            .kp-textarea:hover { border-color: var(--brand-500); scrollbar-width: thin; scrollbar-color: var(--primary-400) transparent; }
            .kp-textarea:focus { border-color: var(--brand-500); outline: none; }
            .kp-textarea::-webkit-scrollbar { width: 8px; background: transparent; }
            .kp-textarea::-webkit-scrollbar-track { background: transparent; }
            .kp-textarea::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; }
            .kp-textarea:hover::-webkit-scrollbar-thumb { background: var(--primary-400); }
            .kp-textarea::placeholder { color: var(--primary-360); opacity: 0.4; }
            .kp-hint { color: var(--primary-360); font-size: 12px; line-height: 1.5; }
            .kp-error { color: var(--red-400); font-size: 12px; margin-top: 4px; }
            .kp-category { margin-bottom: 16px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden; }
            .kp-category-header { display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(0,0,0,0.2); cursor: pointer; user-select: none; }
            .kp-category-header:hover { background: rgba(0,0,0,0.3); }
            .kp-category-title { color: var(--primary-230); font-size: 14px; font-weight: 600; }
            .kp-category-arrow { color: var(--primary-360); transition: transform 0.2s; }
            .kp-category-arrow.open { transform: rotate(90deg); }
            .kp-category-content { padding: 12px; display: none; background: rgba(0,0,0,0.1); }
            .kp-category-content.open { display: block; }
            .kp-server-list { max-height: 200px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--primary-400) transparent; }
            .kp-server-list::-webkit-scrollbar { width: 8px; background: transparent; }
            .kp-server-list::-webkit-scrollbar-track { background: transparent; }
            .kp-server-list::-webkit-scrollbar-thumb { background: var(--primary-400); border-radius: 4px; }
            .kp-server-item { display: flex; align-items: center; padding: 8px; border-radius: 4px; gap: 10px; }
            .kp-server-icon { width: 24px; height: 24px; border-radius: 50%; background: var(--primary-630); flex-shrink: 0; object-fit: cover; }
            .kp-server-icon-placeholder { width: 24px; height: 24px; border-radius: 50%; background: var(--primary-630); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 10px; color: var(--primary-360); font-weight: 600; }
            .kp-server-item:hover { background: rgba(255,255,255,0.05); }
            .kp-server-name { color: var(--primary-230); font-size: 14px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .kp-toggle { position: relative; width: 40px; height: 24px; background: var(--primary-700); border-radius: 12px; cursor: pointer; transition: background 0.2s; }
            .kp-toggle.on { background: var(--brand-500); }
            .kp-toggle-knob { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: white; border-radius: 50%; transition: left 0.2s; }
            .kp-toggle.on .kp-toggle-knob { left: 18px; }
        `;
  }

  start() {
    BdApi.DOM.addStyle("KeywordPing", this.css);
    this.loadSettings();
    this.compileKeywords();
    this.UserStore = BdApi.Webpack.getStore("UserStore");
    this.ChannelStore = BdApi.Webpack.getStore("ChannelStore");
    this.GuildStore = BdApi.Webpack.getStore("GuildStore");
    this.GuildMemberStore = BdApi.Webpack.getStore("GuildMemberStore");
    this.currentUserId = this.UserStore.getCurrentUser()?.id;
    this.setupInterceptor();
  }

  stop() {
    BdApi.DOM.removeStyle("KeywordPing");
    this.saveSettings();

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
    this.currentUserId = null;
    this.compiledKeywords = [];
  }

  setupInterceptor() {
    this.Dispatcher = BdApi.Webpack.getStore("UserStore")._dispatcher;
    this.interceptor = (event) => {
      if (event.type === "MESSAGE_CREATE") {
        this.handleMessage(event);
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
      const SortedGuildStore = BdApi.Webpack.getStore("SortedGuildStore");
      const guildOrder = SortedGuildStore?.getFlattenedGuildIds?.() || [];
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
                          src: `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=32`,
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
    if (!message?.author || (!message.content && !message.embeds?.length))
      return;
    if (event.optimistic) return;

    if (!this.currentUserId) {
      this.currentUserId = this.UserStore.getCurrentUser()?.id;
      if (!this.currentUserId) return;
    }

    const channel = this.ChannelStore.getChannel(message.channel_id);
    if (!channel?.guild_id) return;
    if (!message.guild_id) message.guild_id = channel.guild_id;

    if (message.author.id === this.currentUserId) return;
    if (message.author.bot) return;

    const guildSettings = this.settings.guilds[channel.guild_id];
    if (guildSettings?.enabled === false) return;

    let matched = this.matchesUser(
      this.settings.whitelistedUsers,
      message.author,
      channel.guild_id,
    );
    if (!matched) {
      for (const compiled of this.compiledKeywords) {
        if (compiled.filter && !this.passesFilter(compiled.filter, message))
          continue;
        if (
          compiled.regex.test(message.content || "") ||
          message.embeds?.some((e) => compiled.regex.test(JSON.stringify(e)))
        ) {
          matched = true;
          break;
        }
      }
    }

    if (matched) {
      const currentUser = this.UserStore.getCurrentUser();
      if (
        currentUser &&
        !message.mentions?.some((m) => m.id === currentUser.id)
      ) {
        message.mentions = [...(message.mentions || []), currentUser];
        message.mentioned = true;
      }
    }
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
