/**
 * @name KeywordPing
 * @author Snues
 * @authorId 98862725609816064
 * @description Get notified when messages match your keywords. Uses Discord's native notification system, so it looks and sounds just like a regular @mention.
 * @version 2.4.1
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
        this.css = `
            .kp-settings-panel { padding: 10px; }
            .kp-settings-group { margin-bottom: 20px; }
            .kp-category-content .kp-settings-group:last-child { margin-bottom: 0; }
            .kp-settings-group-title { color: var(--header-secondary); font-size: 12px; font-weight: 700; text-transform: uppercase; display: inline; margin-right: 6px; }
            .kp-settings-group-header { margin-bottom: 8px; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
            .kp-count { background: var(--brand-500); color: white; font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 10px; }
            .kp-textarea { width: 100%; min-height: 120px; background: rgba(0,0,0,0.08); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 10px; color: var(--text-normal); font-family: inherit; font-size: 14px; resize: none; box-sizing: border-box; overflow-y: auto; scrollbar-width: none; transition: border-color 0.15s ease; }
            .kp-textarea:hover { border-color: var(--brand-500); scrollbar-width: thin; scrollbar-color: var(--scrollbar-thin-thumb) transparent; }
            .kp-textarea:focus { border-color: var(--brand-500); outline: none; }
            .kp-textarea::-webkit-scrollbar { width: 8px; background: transparent; }
            .kp-textarea::-webkit-scrollbar-track { background: transparent; }
            .kp-textarea::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; }
            .kp-textarea:hover::-webkit-scrollbar-thumb { background: var(--scrollbar-thin-thumb); }
            .kp-textarea::placeholder { color: var(--text-muted); opacity: 0.4; }
            .kp-hint { color: var(--text-muted); font-size: 12px; line-height: 1.5; }
            .kp-error { color: var(--text-danger); font-size: 12px; margin-top: 4px; }
            .kp-category { margin-bottom: 16px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden; }
            .kp-category-header { display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(0,0,0,0.2); cursor: pointer; user-select: none; }
            .kp-category-header:hover { background: rgba(0,0,0,0.3); }
            .kp-category-title { color: var(--header-primary); font-size: 14px; font-weight: 600; }
            .kp-category-arrow { color: var(--text-muted); transition: transform 0.2s; }
            .kp-category-arrow.open { transform: rotate(90deg); }
            .kp-category-content { padding: 12px; display: none; background: rgba(0,0,0,0.1); }
            .kp-category-content.open { display: block; }
            .kp-server-list { max-height: 200px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--scrollbar-thin-thumb) transparent; }
            .kp-server-list::-webkit-scrollbar { width: 8px; background: transparent; }
            .kp-server-list::-webkit-scrollbar-track { background: transparent; }
            .kp-server-list::-webkit-scrollbar-thumb { background: var(--scrollbar-thin-thumb); border-radius: 4px; }
            .kp-server-item { display: flex; align-items: center; padding: 8px; border-radius: 4px; gap: 10px; }
            .kp-server-icon { width: 24px; height: 24px; border-radius: 50%; background: var(--background-secondary); flex-shrink: 0; object-fit: cover; }
            .kp-server-icon-placeholder { width: 24px; height: 24px; border-radius: 50%; background: var(--background-secondary); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 10px; color: var(--text-muted); font-weight: 600; }
            .kp-server-item:hover { background: rgba(255,255,255,0.05); }
            .kp-server-name { color: var(--text-normal); font-size: 14px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .kp-toggle { position: relative; width: 40px; height: 24px; background: var(--background-tertiary); border-radius: 12px; cursor: pointer; transition: background 0.2s; }
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
        this.currentUserId = this.UserStore?.getCurrentUser()?.id;
        this.patchDispatcher();
    }

    stop() {
        BdApi.DOM.removeStyle("KeywordPing");
        BdApi.Patcher.unpatchAll("KeywordPing");
        this.saveSettings();
        this.UserStore = null;
        this.ChannelStore = null;
        this.GuildStore = null;
        this.GuildMemberStore = null;
        this.currentUserId = null;
        this.compiledKeywords = [];
    }

    loadSettings() {
        const saved = BdApi.Data.load("KeywordPing", "settings") || {};
        this.settings = {
            keywords: saved.keywords || [],
            whitelistedUsers: saved.whitelistedUsers || [],
            guilds: saved.guilds || {}
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
        const panel = document.createElement("div");
        panel.className = "kp-settings-panel";

        const keywordsSection = this.createTextAreaSetting(
            "Keywords",
            "One keyword per line",
            this.settings.keywords.join("\n"),
            (val) => {
                this.settings.keywords = val.split("\n").filter(k => k.trim());
                this.compileKeywords();
                this.saveSettings();
                this.updateCount(keywordsSection, this.settings.keywords.length);
            },
            true,
            ["hello", "/regex/i", "@username:keyword", "#channelid:keyword", "serverid:keyword"]
        );
        this.updateCount(keywordsSection, this.settings.keywords.length);
        panel.appendChild(keywordsSection);

        const categories = [];
        const advancedCategory = this.createCategory("Advanced", false, categories, [
            this.createTextAreaSetting(
                "VIP Users",
                "Always notify for any message from these users",
                this.settings.whitelistedUsers.join("\n"),
                (val) => { this.settings.whitelistedUsers = val.split("\n").filter(k => k.trim()); this.saveSettings(); },
                false,
                ["username", "display name", "nickname", "user id"],
                true
            ),
            this.createServerList()
        ]);
        panel.appendChild(advancedCategory);

        return panel;
    }

    createCategory(title, openByDefault, allCategories, children) {
        const category = document.createElement("div");
        category.className = "kp-category";

        const header = document.createElement("div");
        header.className = "kp-category-header";

        const titleEl = document.createElement("span");
        titleEl.className = "kp-category-title";
        titleEl.textContent = title;
        header.appendChild(titleEl);

        const arrow = document.createElement("span");
        arrow.className = "kp-category-arrow" + (openByDefault ? " open" : "");
        arrow.textContent = "▶";
        header.appendChild(arrow);

        category.appendChild(header);

        const content = document.createElement("div");
        content.className = "kp-category-content" + (openByDefault ? " open" : "");
        children.forEach(child => content.appendChild(child));
        category.appendChild(content);

        allCategories.push({ arrow, content });

        header.onclick = () => {
            const isOpening = !content.classList.contains("open");
            if (isOpening) {
                allCategories.forEach(cat => {
                    cat.arrow.classList.remove("open");
                    cat.content.classList.remove("open");
                });
            }
            arrow.classList.toggle("open");
            content.classList.toggle("open");
        };

        return category;
    }

    createServerList() {
        const container = document.createElement("div");

        const hint = document.createElement("div");
        hint.className = "kp-hint";
        hint.textContent = "Servers to listen for keywords";
        hint.style.marginBottom = "12px";
        container.appendChild(hint);

        const list = document.createElement("div");
        list.className = "kp-server-list";

        const guilds = this.GuildStore?.getGuilds() || {};
        const SortedGuildStore = BdApi.Webpack.getByKeys("getFlattenedGuildIds");
        const guildOrder = SortedGuildStore?.getFlattenedGuildIds?.() || [];
        const sortedGuilds = guildOrder.map(id => guilds[id]).filter(Boolean);

        for (const guild of sortedGuilds) {
            const item = document.createElement("div");
            item.className = "kp-server-item";

            if (guild.icon) {
                const icon = document.createElement("img");
                icon.className = "kp-server-icon";
                icon.src = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=32`;
                item.appendChild(icon);
            } else {
                const placeholder = document.createElement("div");
                placeholder.className = "kp-server-icon-placeholder";
                placeholder.textContent = guild.name.charAt(0).toUpperCase();
                item.appendChild(placeholder);
            }

            const name = document.createElement("span");
            name.className = "kp-server-name";
            name.textContent = guild.name;
            item.appendChild(name);

            const enabled = this.settings.guilds[guild.id]?.enabled !== false;
            const toggle = this.createToggle(enabled, (val) => {
                if (!this.settings.guilds[guild.id]) this.settings.guilds[guild.id] = {};
                this.settings.guilds[guild.id].enabled = val;
                this.saveSettings();
            });
            item.appendChild(toggle);

            list.appendChild(item);
        }

        container.appendChild(list);
        return container;
    }

    createToggle(initialValue, onChange) {
        const toggle = document.createElement("div");
        toggle.className = "kp-toggle" + (initialValue ? " on" : "");

        const knob = document.createElement("div");
        knob.className = "kp-toggle-knob";
        toggle.appendChild(knob);

        toggle.onclick = () => {
            const isOn = toggle.classList.toggle("on");
            onChange(isOn);
        };

        return toggle;
    }

    updateCount(section, count) {
        let countEl = section.querySelector(".kp-count");
        if (!countEl) {
            countEl = document.createElement("span");
            countEl.className = "kp-count";
            section.querySelector(".kp-settings-group-header").appendChild(countEl);
        }
        countEl.textContent = count;
        countEl.style.display = count > 0 ? "inline" : "none";
    }

    createTextAreaSetting(title, hint, value, onChange, validate = false, examples = null, small = false) {
        const group = document.createElement("div");
        group.className = "kp-settings-group";

        const header = document.createElement("div");
        header.className = "kp-settings-group-header";

        const titleEl = document.createElement("span");
        titleEl.className = "kp-settings-group-title";
        titleEl.textContent = title;
        header.appendChild(titleEl);

        const hintEl = document.createElement("span");
        hintEl.className = "kp-hint";
        hintEl.textContent = hint;
        header.appendChild(hintEl);

        group.appendChild(header);

        const textarea = document.createElement("textarea");
        textarea.className = "kp-textarea";
        if (small) textarea.style.minHeight = "100px";
        textarea.value = value;
        textarea.placeholder = examples ? examples.join("\n") : `Enter ${title.toLowerCase()}...`;
        group.appendChild(textarea);

        const errorEl = document.createElement("div");
        errorEl.className = "kp-error";
        errorEl.style.display = "none";
        group.appendChild(errorEl);

        const updateValidation = () => {
            if (!validate) return;
            const invalid = textarea.value.split("\n").filter(k => k.trim() && !this.isValidPattern(k));
            if (invalid.length) {
                errorEl.textContent = `Invalid pattern: ${invalid.join(", ")}`;
                errorEl.style.display = "block";
            } else {
                errorEl.style.display = "none";
            }
        };

        textarea.addEventListener("change", () => { onChange(textarea.value); updateValidation(); });
        textarea.addEventListener("input", updateValidation);
        updateValidation();

        return group;
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
            try { new RegExp(regexMatch[1], regexMatch[2]); return true; }
            catch { return false; }
        }
        return true;
    }

    patchDispatcher() {
        const Dispatcher = BdApi.Webpack.getByKeys("dispatch", "subscribe");
        if (!Dispatcher) return;

        BdApi.Patcher.before("KeywordPing", Dispatcher, "dispatch", (_, [event]) => {
            if (event?.type === "MESSAGE_CREATE") {
                this.handleMessage(event);
            }
        });
    }

    handleMessage(event) {
        const { message } = event;
        if (!message?.author || (!message.content && !message.embeds?.length)) return;
        if (event.optimistic) return;

        if (!this.currentUserId) {
            this.currentUserId = this.UserStore?.getCurrentUser()?.id;
            if (!this.currentUserId) return;
        }

        const channel = this.ChannelStore?.getChannel(message.channel_id);
        if (!channel?.guild_id) return;
        if (!message.guild_id) message.guild_id = channel.guild_id;

        if (message.author.id === this.currentUserId) return;
        if (message.author.bot) return;

        const guildSettings = this.settings.guilds[channel.guild_id];
        if (guildSettings?.enabled === false) return;

        let matched = this.matchesUser(this.settings.whitelistedUsers, message.author, channel.guild_id);
        if (!matched) {
            for (const compiled of this.compiledKeywords) {
                if (compiled.filter && !this.passesFilter(compiled.filter, message)) continue;
                if (compiled.regex.test(message.content || "") || message.embeds?.some(e => compiled.regex.test(JSON.stringify(e)))) {
                    matched = true;
                    break;
                }
            }
        }

        if (matched) {
            const currentUser = this.UserStore?.getCurrentUser();
            if (currentUser && !message.mentions?.some(m => m.id === currentUser.id)) {
                message.mentions = [...(message.mentions || []), currentUser];
                message.mentioned = true;
            }
        }
    }

    parseKeyword(keyword) {
        let filter = null, pattern = keyword;
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
            const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return { filter, regex: new RegExp(`(?<!\\w)${escaped}(?!\\w)`, "i") };
        } catch { return null; }
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
        const user = this.UserStore?.getUser(author.id) || author;
        const username = (user.username || author.username)?.toLowerCase();
        const displayName = (user.globalName || user.global_name || author.globalName || author.global_name)?.toLowerCase();

        let nickname = null;
        if (guildId && this.GuildMemberStore) {
            nickname = this.GuildMemberStore.getMember(guildId, author.id)?.nick?.toLowerCase();
        }

        return list.some(entry => {
            const e = entry.toLowerCase();
            return author.id === entry || username === e || displayName === e || nickname === e;
        });
    }
};
