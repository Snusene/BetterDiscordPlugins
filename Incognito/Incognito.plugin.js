/**
 * @name Incognito
 * @description Go incognito with one click. Stop tracking, hide typing, disable activity, and much more.
 * @version 0.9.5
 * @author Snues
 * @authorId 98862725609816064
 * @website https://github.com/Snusene/BetterDiscordPlugins/tree/main/Incognito
 * @source https://raw.githubusercontent.com/Snusene/BetterDiscordPlugins/main/Incognito/Incognito.plugin.js
 */

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "si",
  "feature",
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "mc_eid",
  "igshid",
  "ref",
  "ref_src",
  "ref_url",
  "source",
  "context",
  "s",
  "t",
]);

const STAT_KEYS = [
  "analyticsBlocked",
  "sentryBlocked",
  "readReceiptsBlocked",
  "typingIndicatorsBlocked",
  "trackingUrlsStripped",
  "idleSpoofed",
  "filesAnonymized",
];

const CHANGELOG = [
  {
    title: "New",
    type: "added",
    items: [
      "Changelog popup on version updates",
      "Stats banner showing session and all time privacy actions",
      "Tracking params stripped when copying/pasting URLs",
      "Idle detection blocked during voice calls",
    ],
  },
  {
    title: "Removed",
    type: "fixed",
    items: ["AntiLog - Against ToS (selfbotting)"],
  },
];

module.exports = class Incognito {
  static _moduleCache = null;

  static getModules() {
    if (Incognito._moduleCache) return Incognito._moduleCache;

    Incognito._moduleCache = {
      Analytics: BdApi.Webpack.getByKeys("AnalyticEventConfigs"),
      NativeModule: BdApi.Webpack.getByKeys("getDiscordUtils"),
      CrashReporter: BdApi.Webpack.getModule((m) => m?.submitLiveCrashReport),
      SettingsManager: BdApi.Webpack.getModule(
        (m) => m?.updateAsync && m?.type === 1,
        { searchExports: true },
      ),
      BoolSetting: BdApi.Webpack.getModule(
        (m) => m?.typeName?.includes("Bool"),
        { searchExports: true },
      ),
      TypingModule: BdApi.Webpack.getByKeys("startTyping", "stopTyping"),
      LocalActivityStore: BdApi.Webpack.getStore("LocalActivityStore"),
      RunningGameStore: BdApi.Webpack.getStore("RunningGameStore"),
      ActivityTrackingStore: BdApi.Webpack.getStore("ActivityTrackingStore"),
      IdleStore: BdApi.Webpack.getStore("IdleStore"),
      MessageActions: BdApi.Webpack.getByKeys("sendMessage", "editMessage"),
      SuperProperties: BdApi.Webpack.getByKeys(
        "getSuperProperties",
        "getSuperPropertiesBase64",
      ),
      Uploader: BdApi.Webpack.getModule((m) => m?.prototype?.uploadFiles),
      AckModule: BdApi.Webpack.getByKeys("ack"),
      TimezoneModule: (() => {
        const tzMod = BdApi.Webpack.getBySource("resolvedOptions().timeZone", {
          searchExports: true,
        });
        if (!tzMod) return null;
        const tzKey = Object.keys(tzMod).find(
          (k) => typeof tzMod[k] === "function",
        );
        return tzKey ? [tzMod, tzKey] : null;
      })(),
      DebugOptionsStore: BdApi.Webpack.getByKeys("getDebugOptionsHeaderValue"),
    };

    return Incognito._moduleCache;
  }

  constructor(meta) {
    this.meta = meta;
    this.api = new BdApi(meta.name);
    this.patchers = {};
    this.defaultSettings = {
      stopAnalytics: true,
      stopSentry: true,
      stopProcessMonitor: true,
      disableIdle: true,
      stripTrackingUrls: true,
      spoofLocale: true,
      silentTyping: true,
      anonymiseFiles: true,
      blockReadReceipts: true,
    };
    this.initStats();
  }

  initStats() {
    const defaultStats = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
    this.stats = this.api.Data.load("stats") ?? { ...defaultStats };
    this.sessionStats = { ...defaultStats };
    this.debouncedSaveStats = BdApi.Utils.debounce(() => {
      this.api.Data.save("stats", this.stats);
    }, 5000);
  }

  showChangelog() {
    const lastVersion = this.api.Data.load("lastVersion");
    if (lastVersion === this.meta.version) return;
    this.api.Data.save("lastVersion", this.meta.version);
    BdApi.UI.showChangelogModal({
      title: this.meta.name,
      subtitle: `v${this.meta.version}`,
      changes: CHANGELOG,
    });
  }

  incrementStat(stat) {
    if (this.stats[stat] !== undefined) {
      this.stats[stat]++;
      this.sessionStats[stat]++;
      this.debouncedSaveStats();
    }
  }

  getPatcher(feature) {
    if (!this.patchers[feature]) {
      this.patchers[feature] = new BdApi(
        `${this.meta.name}:${feature}`,
      ).Patcher;
    }
    return this.patchers[feature];
  }

  start() {
    this.settings = {
      ...this.defaultSettings,
      ...(this.api.Data.load("settings") ?? {}),
    };
    this.failed = new Set(this.api.Data.load("failed") ?? []);
    this.modules = Incognito.getModules();

    this.retryFailed();

    if (this.settings.stopAnalytics) this.disableAnalytics();
    if (this.settings.stopSentry) this.disableSentry();
    if (this.settings.stopProcessMonitor) this.disableProcessMonitor();
    if (this.settings.disableIdle) this.disableIdle();
    if (this.settings.stripTrackingUrls) this.stripUrls();
    if (this.settings.spoofLocale) this.spoofLocale();
    if (this.settings.silentTyping) this.silentTyping();
    if (this.settings.anonymiseFiles) this.anonymiseFiles();
    if (this.settings.blockReadReceipts) this.blockReadReceipts();

    this.injectStyles();
    this.showChangelog();
  }

  injectStyles() {
    this.api.DOM.addStyle(`
      .incognito-banner { text-align: center; padding: 16px; background: linear-gradient(135deg, var(--brand-500) 0%, var(--brand-560) 100%); border-radius: 8px; margin-bottom: 16px; }
      .incognito-title { font-size: 12px; color: rgba(255,255,255,0.8); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
      .incognito-stats { display: flex; justify-content: center; gap: 32px; }
      .incognito-divider { width: 1px; background: rgba(255,255,255,0.3); }
      .incognito-stat { display: flex; flex-direction: column; align-items: center; }
      .incognito-value { font-size: 32px; font-weight: 700; color: white; line-height: 1; }
      .incognito-label { font-size: 11px; color: rgba(255,255,255,0.7); margin-top: 4px; }
    `);
  }

  stop() {
    for (const patcher of Object.values(this.patchers)) {
      patcher.unpatchAll();
    }
    this.patchers = {};

    this.restoreSentryTransport();
    this.disableClipboardHandlers();

    this.api.DOM.removeStyle();
    this.debouncedSaveStats?.();
    this.settings = null;
    this.failed = null;
    this.modules = null;
    this.stats = null;
    this.sessionStats = null;
    this.debouncedSaveStats = null;
  }

  retryFailed() {
    const featureModules = {
      stopAnalytics: () => this.modules.Analytics,
      stopSentry: () => window.DiscordSentry?.getClient?.(),
      stopProcessMonitor: () => this.modules.NativeModule,
      disableIdle: () => this.modules.IdleStore,
      stripTrackingUrls: () => this.modules.MessageActions?.sendMessage,
      spoofLocale: () => this.modules.SuperProperties?.getSuperProperties,
      silentTyping: () => this.modules.TypingModule?.startTyping,
      anonymiseFiles: () => this.modules.Uploader,
      blockReadReceipts: () => this.modules.AckModule?.ack,
    };

    for (const feature of this.failed) {
      const check = featureModules[feature];
      if (check?.()) {
        this.settings[feature] = true;
        this.failed.delete(feature);
      }
    }

    this.saveSettings();
    this.api.Data.save("failed", [...this.failed]);
  }

  markFailed(feature) {
    this.settings[feature] = false;
    this.failed.add(feature);
    this.saveSettings();
    this.api.Data.save("failed", [...this.failed]);
  }

  handleFailure(feature, description, failed = null) {
    if (failed !== null && failed.length === 0) return;
    this.markFailed(feature);
    const msg = failed?.length
      ? `${description} (${failed.join(", ")})`
      : description;
    this.api.UI.showToast(`Incognito: ${msg} unavailable`, { type: "warning" });
  }

  disableAnalytics() {
    const patcher = this.getPatcher("stopAnalytics");
    const { Analytics, NativeModule, CrashReporter } = this.modules;
    let failed = [];

    if (!Analytics) {
      failed.push("events");
    } else {
      if (Analytics.default?.track) {
        patcher.instead(Analytics.default, "track", () => {
          this.incrementStat("analyticsBlocked");
        });
      } else {
        failed.push("events");
      }

      if (Analytics.trackNetworkAction) {
        patcher.instead(Analytics, "trackNetworkAction", () => {});
      } else {
        failed.push("network");
      }

      if (Analytics.debugLogEvent) {
        patcher.instead(Analytics, "debugLogEvent", () => {});
      } else {
        failed.push("debug logs");
      }
    }

    if (CrashReporter?.submitLiveCrashReport) {
      patcher.instead(CrashReporter, "submitLiveCrashReport", () => {});
    } else {
      failed.push("crash reports");
    }

    if (NativeModule) {
      patcher.instead(
        NativeModule,
        "ensureModule",
        (_, [moduleName], original) => {
          if (moduleName?.includes("discord_rpc")) return;
          return original(moduleName);
        },
      );
    } else {
      failed.push("RPC");
    }

    const { ActivityTrackingStore } = this.modules;
    if (ActivityTrackingStore?.getActivities) {
      patcher.instead(ActivityTrackingStore, "getActivities", () => ({}));
    } else {
      failed.push("activity tracking");
    }

    this.handleFailure("stopAnalytics", "Telemetry blocking", failed);
  }

  disableSentry() {
    const client = window.DiscordSentry?.getClient?.();
    if (!client) {
      this.handleFailure("stopSentry", "Error reporting blocking");
      return;
    }

    const transport = client.getTransport?.();
    if (transport?.send) {
      this.originalSentryTransportSend = transport.send.bind(transport);
      this.sentryTransport = transport;
      transport.send = () => {
        this.incrementStat("sentryBlocked");
        return Promise.resolve({});
      };
    } else {
      this.handleFailure("stopSentry", "Error reporting (transport)");
    }
  }

  restoreSentryTransport() {
    if (this.originalSentryTransportSend && this.sentryTransport) {
      this.sentryTransport.send = this.originalSentryTransportSend;
    }
    this.originalSentryTransportSend = null;
    this.sentryTransport = null;
  }

  disableProcessMonitor() {
    const patcher = this.getPatcher("stopProcessMonitor");
    const {
      SettingsManager,
      BoolSetting,
      NativeModule,
      LocalActivityStore,
      RunningGameStore,
    } = this.modules;
    let failed = [];

    if (SettingsManager && BoolSetting) {
      SettingsManager.updateAsync(
        "status",
        (settings) => {
          settings.showCurrentGame = BoolSetting.create({ value: false });
        },
        0,
      );
    } else {
      failed.push("activity status");
    }

    const DiscordUtils = NativeModule?.getDiscordUtils();
    if (DiscordUtils?.setObservedGamesCallback) {
      DiscordUtils.setObservedGamesCallback([], () => {});
      patcher.instead(DiscordUtils, "setObservedGamesCallback", () => {});
    } else {
      failed.push("game detection");
    }

    if (LocalActivityStore) {
      patcher.instead(LocalActivityStore, "getActivities", () => []);
      patcher.instead(LocalActivityStore, "getPrimaryActivity", () => null);
      patcher.instead(LocalActivityStore, "getApplicationActivity", () => null);
    } else {
      failed.push("local activity");
    }

    if (RunningGameStore) {
      patcher.instead(RunningGameStore, "getVisibleGame", () => null);
      patcher.instead(RunningGameStore, "getRunningGames", () => []);
      patcher.instead(RunningGameStore, "getVisibleRunningGames", () => []);
      patcher.instead(RunningGameStore, "getCandidateGames", () => []);
      patcher.instead(RunningGameStore, "isDetectionEnabled", () => false);
    } else {
      failed.push("running games");
    }

    this.handleFailure("stopProcessMonitor", "Game scanning", failed);
  }

  enableProcessMonitor() {
    const { SettingsManager, BoolSetting } = this.modules;

    SettingsManager?.updateAsync(
      "status",
      (settings) => {
        settings.showCurrentGame = BoolSetting?.create({ value: true });
      },
      0,
    );

    this.api.UI.showConfirmationModal(
      "Reload Discord?",
      "To re-enable the process monitor Discord needs to be reloaded.",
      {
        confirmText: "Reload",
        cancelText: "Later",
        onConfirm: () => window.location.reload(),
      },
    );
  }

  disableIdle() {
    const patcher = this.getPatcher("disableIdle");
    const { IdleStore } = this.modules;

    if (!IdleStore) {
      this.handleFailure("disableIdle", "Idle blocking");
      return;
    }

    patcher.instead(IdleStore, "isIdle", () => {
      this.incrementStat("idleSpoofed");
      return false;
    });
    patcher.instead(IdleStore, "isAFK", () => false);
    patcher.instead(IdleStore, "getIdleSince", () => null);
  }

  stripTrackingParams(content) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return content.replace(urlRegex, (url) => {
      try {
        const parsed = new URL(url);
        let changed = false;

        for (const param of parsed.searchParams.keys()) {
          if (TRACKING_PARAMS.has(param)) {
            parsed.searchParams.delete(param);
            changed = true;
          }
        }

        if (changed) {
          let cleanUrl = parsed.toString();
          if (cleanUrl.endsWith("?")) {
            cleanUrl = cleanUrl.slice(0, -1);
          }
          return cleanUrl;
        }
        return url;
      } catch {
        return url;
      }
    });
  }

  stripUrls() {
    const patcher = this.getPatcher("stripTrackingUrls");
    const { MessageActions } = this.modules;

    if (!MessageActions?.sendMessage) {
      this.handleFailure("stripTrackingUrls", "URL stripping");
      return;
    }

    patcher.before(MessageActions, "sendMessage", (_, [, message]) => {
      if (message?.content) {
        const original = message.content;
        message.content = this.stripTrackingParams(message.content);
        if (message.content !== original) {
          this.incrementStat("trackingUrlsStripped");
        }
      }
    });

    this.copyHandler = (e) => {
      const selection = window.getSelection()?.toString();
      if (!selection) return;

      const sanitized = this.stripTrackingParams(selection);
      if (sanitized !== selection) {
        e.preventDefault();
        e.clipboardData.setData("text/plain", sanitized);
        this.incrementStat("trackingUrlsStripped");
      }
    };

    this.pasteHandler = (e) => {
      const text = e.clipboardData?.getData("text/plain");
      if (!text) return;

      const sanitized = this.stripTrackingParams(text);
      if (sanitized !== text) {
        e.preventDefault();
        const target = e.target;
        if (
          target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA"
        ) {
          document.execCommand("insertText", false, sanitized);
          this.incrementStat("trackingUrlsStripped");
        }
      }
    };

    document.addEventListener("copy", this.copyHandler, true);
    document.addEventListener("paste", this.pasteHandler, true);
  }

  disableClipboardHandlers() {
    if (this.copyHandler) {
      document.removeEventListener("copy", this.copyHandler, true);
      this.copyHandler = null;
    }
    if (this.pasteHandler) {
      document.removeEventListener("paste", this.pasteHandler, true);
      this.pasteHandler = null;
    }
  }

  spoofLocale() {
    const patcher = this.getPatcher("spoofLocale");
    const { SuperProperties } = this.modules;

    if (!SuperProperties?.getSuperProperties) {
      this.handleFailure("spoofLocale", "Locale spoofing");
      return;
    }

    patcher.after(SuperProperties, "getSuperProperties", (_, __, ret) => {
      if (ret && typeof ret === "object") {
        ret.system_locale = "en-US";
        ret.client_app_state = "focused";
      }
      return ret;
    });

    patcher.after(SuperProperties, "getSuperPropertiesBase64", () => {
      const props = SuperProperties.getSuperProperties();
      return btoa(JSON.stringify(props));
    });

    this.stripTrackingHeaders();
  }

  stripTrackingHeaders() {
    const patcher = this.getPatcher("spoofLocale");
    const { TimezoneModule, DebugOptionsStore } = this.modules;
    let failed = [];

    if (Array.isArray(TimezoneModule) && TimezoneModule.length === 2) {
      const [tzMod, tzKey] = TimezoneModule;
      if (tzMod && tzKey) {
        patcher.instead(tzMod, tzKey, () => null);
      } else {
        failed.push("timezone");
      }
    } else {
      failed.push("timezone");
    }

    if (DebugOptionsStore?.getDebugOptionsHeaderValue) {
      patcher.instead(
        DebugOptionsStore,
        "getDebugOptionsHeaderValue",
        () => null,
      );
    } else {
      failed.push("debug options");
    }

    this.handleFailure("spoofLocale", "Header stripping", failed);
  }

  silentTyping() {
    const patcher = this.getPatcher("silentTyping");
    const { TypingModule } = this.modules;

    if (!TypingModule?.startTyping || !TypingModule?.stopTyping) {
      this.handleFailure("silentTyping", "Silent typing");
      return;
    }

    patcher.instead(TypingModule, "startTyping", () => {
      this.incrementStat("typingIndicatorsBlocked");
    });
    patcher.instead(TypingModule, "stopTyping", () => {});
  }

  randomString(length) {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  getExtension(filename) {
    const idx = filename.lastIndexOf(".");
    if (idx === -1) return "";
    const ext = filename.slice(idx);
    const tar = filename.slice(0, idx);
    if (tar.endsWith(".tar")) return ".tar" + ext;
    return ext;
  }

  generateFilename(original) {
    return this.randomString(7) + this.getExtension(original);
  }

  anonymiseFiles() {
    const patcher = this.getPatcher("anonymiseFiles");
    const { Uploader } = this.modules;

    if (!Uploader?.prototype?.uploadFiles) {
      this.handleFailure("anonymiseFiles", "File anonymization");
      return;
    }

    patcher.before(Uploader.prototype, "uploadFiles", (_, [files]) => {
      if (!files) return;
      for (const file of files) {
        if (file?.filename) {
          file.filename = this.generateFilename(file.filename);
          this.incrementStat("filesAnonymized");
        }
      }
    });
  }

  blockReadReceipts() {
    const patcher = this.getPatcher("blockReadReceipts");
    const { AckModule } = this.modules;
    let failed = [];

    if (AckModule?.ack) {
      patcher.instead(AckModule, "ack", () => {
        this.incrementStat("readReceiptsBlocked");
      });
    } else {
      failed.push("message ack");
    }

    if (AckModule) {
      let bulkAckKey = null;
      for (const key of Object.keys(AckModule)) {
        if (key === "ack") continue;
        const fn = AckModule[key];
        if (typeof fn === "function" && fn.toString().includes("BULK_ACK")) {
          bulkAckKey = key;
          break;
        }
      }

      if (bulkAckKey) {
        patcher.instead(AckModule, bulkAckKey, () => {});
      } else {
        failed.push("bulk ack");
      }
    } else {
      failed.push("bulk ack");
    }

    this.handleFailure("blockReadReceipts", "Read receipt blocking", failed);
  }

  disableFeature(feature) {
    if (this.patchers[feature]) {
      this.patchers[feature].unpatchAll();
      delete this.patchers[feature];
    }
  }

  enableFeature(id) {
    const featureMap = {
      stopAnalytics: () => this.disableAnalytics(),
      stopSentry: () => this.disableSentry(),
      stopProcessMonitor: () => this.disableProcessMonitor(),
      disableIdle: () => this.disableIdle(),
      stripTrackingUrls: () => this.stripUrls(),
      spoofLocale: () => this.spoofLocale(),
      silentTyping: () => this.silentTyping(),
      anonymiseFiles: () => this.anonymiseFiles(),
      blockReadReceipts: () => this.blockReadReceipts(),
    };
    featureMap[id]?.();
  }

  saveSettings() {
    this.api.Data.save("settings", this.settings);
  }

  getSettingsPanel() {
    const { React } = BdApi;
    const plugin = this;

    const Banner = () => {
      const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

      React.useEffect(() => {
        const interval = setInterval(forceUpdate, 1000);
        return () => clearInterval(interval);
      }, []);

      const formatNumber = (num) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
        if (num >= 1000) return (num / 1000).toFixed(1) + "K";
        return num.toLocaleString();
      };

      const getTotalBlocked = (stats) => {
        return STAT_KEYS.reduce((sum, key) => sum + (stats[key] || 0), 0);
      };

      return React.createElement(
        "div",
        { className: "incognito-banner" },
        React.createElement(
          "div",
          { className: "incognito-title" },
          "Privacy Actions",
        ),
        React.createElement(
          "div",
          { className: "incognito-stats" },
          React.createElement(
            "div",
            { className: "incognito-stat" },
            React.createElement(
              "div",
              { className: "incognito-value" },
              formatNumber(getTotalBlocked(plugin.sessionStats)),
            ),
            React.createElement(
              "div",
              { className: "incognito-label" },
              "This Session",
            ),
          ),
          React.createElement("div", { className: "incognito-divider" }),
          React.createElement(
            "div",
            { className: "incognito-stat" },
            React.createElement(
              "div",
              { className: "incognito-value" },
              formatNumber(getTotalBlocked(plugin.stats)),
            ),
            React.createElement(
              "div",
              { className: "incognito-label" },
              "All Time",
            ),
          ),
        ),
      );
    };

    const banner = React.createElement(Banner);

    const settingToStat = {
      stopAnalytics: { key: "analyticsBlocked", label: "blocked" },
      stopSentry: { key: "sentryBlocked", label: "blocked" },
      blockReadReceipts: { key: "readReceiptsBlocked", label: "blocked" },
      silentTyping: { key: "typingIndicatorsBlocked", label: "hidden" },
      stripTrackingUrls: { key: "trackingUrlsStripped", label: "stripped" },
      disableIdle: { key: "idleSpoofed", label: "spoofed" },
      anonymiseFiles: { key: "filesAnonymized", label: "renamed" },
    };

    const settingsConfig = [
      {
        id: "stopAnalytics",
        name: "Stop Analytics",
        note: "Blocks analytics, experiment tracking, telemetry, and usage metrics.",
      },
      {
        id: "stopSentry",
        name: "Stop Sentry",
        note: "Disables Sentry error reporting sent when Discord encounters bugs or crashes.",
      },
      {
        id: "stopProcessMonitor",
        name: "Stop Process Monitor",
        note: "Stops Discord from scanning running processes on your PC to detect games and applications.",
      },
      {
        id: "blockReadReceipts",
        name: "Block Read Receipts",
        note: "Prevents Discord from knowing which messages you've read.",
      },
      {
        id: "disableIdle",
        name: "Disable Idle",
        note: "Prevents Discord and other users from knowing when you're idle or AFK, including during voice calls.",
      },
      {
        id: "stripTrackingUrls",
        name: "Strip URL Trackers",
        note: "Removes tracking parameters from URLs in messages you send and when copying/pasting.",
      },
      {
        id: "spoofLocale",
        name: "Spoof Fingerprints",
        note: "Masks your system locale as en-US, always reports Discord as focused, and strips timezone/debug headers from requests.",
      },
      {
        id: "silentTyping",
        name: "Silent Typing",
        note: "Hides your typing indicator from other users.",
      },
      {
        id: "anonymiseFiles",
        name: "Anonymise File Names",
        note: "Replaces uploaded file names with random strings to hide original names.",
      },
    ];

    const handleChange = (id, value) => {
      this.settings[id] = value;
      this.saveSettings();

      if (id === "stopProcessMonitor") {
        if (value) {
          this.enableFeature(id);
        } else {
          this.disableFeature(id);
          this.enableProcessMonitor();
        }
        return;
      }

      if (id === "stopSentry") {
        if (value) {
          this.enableFeature(id);
        } else {
          this.disableFeature(id);
          this.restoreSentryTransport();
        }
        return;
      }

      if (id === "spoofLocale") {
        if (value) {
          this.enableFeature(id);
        } else {
          this.disableFeature(id);
        }
        return;
      }

      if (id === "stripTrackingUrls") {
        if (value) {
          this.enableFeature(id);
        } else {
          this.disableFeature(id);
          this.disableClipboardHandlers();
        }
        return;
      }

      if (value) {
        this.enableFeature(id);
      } else {
        this.disableFeature(id);
      }
    };

    const getName = (config) => {
      const stat = settingToStat[config.id];
      if (!stat) return config.name;
      const count = plugin.sessionStats[stat.key] || 0;
      return React.createElement(
        React.Fragment,
        null,
        config.name,
        React.createElement(
          "span",
          {
            style: {
              fontSize: "12px",
              fontWeight: "normal",
              color: "var(--text-muted)",
              marginLeft: "8px",
            },
          },
          `· ${count.toLocaleString()} ${stat.label}`,
        ),
      );
    };

    const settingsPanel = this.api.UI.buildSettingsPanel({
      settings: settingsConfig.map((config) => ({
        type: "switch",
        id: config.id,
        name: getName(config),
        note: config.note,
        value: this.settings[config.id],
      })),
      onChange: (_, id, value) => handleChange(id, value),
    });

    return React.createElement(React.Fragment, null, banner, settingsPanel);
  }
};
