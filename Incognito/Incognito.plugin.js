/**
 * @name Incognito
 * @description Go incognito with one click. Stop tracking, hide typing, disable activity, and much more.
 * @version 0.9.0
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
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

module.exports = class Incognito {
  constructor(meta) {
    this.meta = meta;
    this.api = new BdApi(meta.name);
    this.defaultSettings = {
      stopAnalytics: true,
      stopSentry: true,
      stopProcessMonitor: true,
      disableIdle: true,
      stripTrackingUrls: true,
      spoofLocale: true,
      silentTyping: true,
      anonymiseFiles: true,
      antiLog: true,
      blockReadReceipts: true,
    };
    this.savedConsole = {};
  }

  start() {
    this.settings = {
      ...this.defaultSettings,
      ...(this.api.Data.load("settings") ?? {}),
    };
    this.failed = new Set(this.api.Data.load("failed") ?? []);

    this.modules = {
      Analytics: BdApi.Webpack.getByKeys("AnalyticEventConfigs"),
      MetadataTracking: BdApi.Webpack.getByKeys("trackWithMetadata"),
      ExperimentTracking: BdApi.Webpack.getByKeys("trackExperimentExposure"),
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
    };

    this.retryFailed();

    if (this.settings.stopAnalytics) this.disableAnalytics();
    if (this.settings.stopSentry) this.disableSentry();
    if (this.settings.stopProcessMonitor) this.disableProcessMonitor();
    if (this.settings.disableIdle) this.disableIdle();
    if (this.settings.stripTrackingUrls) this.stripUrls();
    if (this.settings.spoofLocale) this.spoofLocale();
    if (this.settings.silentTyping) this.silentTyping();
    if (this.settings.anonymiseFiles) this.anonymiseFiles();
    if (this.settings.antiLog) this.antiLog();
    if (this.settings.blockReadReceipts) this.blockReadReceipts();
  }

  stop() {
    this.api.Patcher.unpatchAll();
    this.restoreConsole();

    if (this.originalSendBeacon) {
      navigator.sendBeacon = this.originalSendBeacon;
      this.originalSendBeacon = null;
    }

    if (this.originalFetch) {
      window.fetch = this.originalFetch;
      this.originalFetch = null;
    }

    if (this.originalSetRequestHeader) {
      XMLHttpRequest.prototype.setRequestHeader = this.originalSetRequestHeader;
      this.originalSetRequestHeader = null;
    }

    this.modules = null;
    this.settings = null;
    this.failed = null;
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
      antiLog: () => this.modules.MessageActions?.editMessage,
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

  disableAnalytics() {
    const {
      Analytics,
      MetadataTracking,
      ExperimentTracking,
      NativeModule,
      CrashReporter,
    } = this.modules;
    let failed = [];

    if (!Analytics) {
      failed.push("events");
    } else {
      if (Analytics.default?.track) {
        this.api.Patcher.instead(Analytics.default, "track", () => {});
      } else {
        failed.push("events");
      }

      if (Analytics.trackNetworkAction) {
        this.api.Patcher.instead(Analytics, "trackNetworkAction", () => {});
      } else {
        failed.push("network");
      }

      if (Analytics.debugLogEvent) {
        this.api.Patcher.instead(Analytics, "debugLogEvent", () => {});
      } else {
        failed.push("debug logs");
      }
    }

    if (MetadataTracking?.trackWithMetadata) {
      this.api.Patcher.instead(MetadataTracking, "trackWithMetadata", () => {});
    } else {
      failed.push("metadata");
    }

    if (!ExperimentTracking) {
      failed.push("A/B tests");
    } else {
      if (ExperimentTracking.trackExperimentExposure) {
        this.api.Patcher.instead(
          ExperimentTracking,
          "trackExperimentExposure",
          () => {},
        );
      } else {
        failed.push("A/B tests");
      }
      if (ExperimentTracking.track) {
        this.api.Patcher.instead(ExperimentTracking, "track", () => {});
      }
    }

    if (CrashReporter?.submitLiveCrashReport) {
      this.api.Patcher.instead(
        CrashReporter,
        "submitLiveCrashReport",
        () => {},
      );
    } else {
      failed.push("crash reports");
    }

    if (NativeModule) {
      this.api.Patcher.instead(
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
      this.api.Patcher.instead(
        ActivityTrackingStore,
        "getActivities",
        () => ({}),
      );
    } else {
      failed.push("activity tracking");
    }

    if (navigator.sendBeacon) {
      this.originalSendBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = () => false;
    }

    if (failed.length > 0) {
      this.markFailed("stopAnalytics");
      this.api.UI.showToast(
        `Incognito: Telemetry blocking (${failed.join(", ")}) unavailable`,
        { type: "warning" },
      );
    }
  }

  disableSentry() {
    const client = window.DiscordSentry?.getClient?.();
    if (!client) {
      this.markFailed("stopSentry");
      this.api.UI.showToast("Incognito: Error reporting blocking unavailable", {
        type: "warning",
      });
      return;
    }

    client.close(0);

    const transport = client.getTransport?.();
    if (transport) {
      transport.send = () => Promise.resolve({});
    } else {
      this.api.UI.showToast(
        "Incognito: Error reporting (transport) unavailable",
        { type: "warning" },
      );
    }

    for (const method in console) {
      if (!Object.hasOwn(console[method], "__sentry_original__")) continue;
      this.savedConsole[method] = console[method];
      console[method] = console[method].__sentry_original__;
    }
  }

  restoreConsole() {
    for (const method in this.savedConsole) {
      console[method] = this.savedConsole[method];
    }
    this.savedConsole = {};
  }

  disableProcessMonitor() {
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
      this.api.Patcher.instead(
        DiscordUtils,
        "setObservedGamesCallback",
        () => {},
      );
    } else {
      failed.push("game detection");
    }

    if (LocalActivityStore) {
      this.api.Patcher.instead(LocalActivityStore, "getActivities", () => []);
      this.api.Patcher.instead(
        LocalActivityStore,
        "getPrimaryActivity",
        () => null,
      );
      this.api.Patcher.instead(
        LocalActivityStore,
        "getApplicationActivity",
        () => null,
      );
    } else {
      failed.push("local activity");
    }

    if (RunningGameStore) {
      this.api.Patcher.instead(RunningGameStore, "getVisibleGame", () => null);
      this.api.Patcher.instead(RunningGameStore, "getRunningGames", () => []);
      this.api.Patcher.instead(
        RunningGameStore,
        "getVisibleRunningGames",
        () => [],
      );
      this.api.Patcher.instead(RunningGameStore, "getCandidateGames", () => []);
      this.api.Patcher.instead(
        RunningGameStore,
        "isDetectionEnabled",
        () => false,
      );
    } else {
      failed.push("running games");
    }

    if (failed.length > 0) {
      this.markFailed("stopProcessMonitor");
      this.api.UI.showToast(
        `Incognito: Game scanning (${failed.join(", ")}) unavailable`,
        { type: "warning" },
      );
    }
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
    const { IdleStore } = this.modules;

    if (IdleStore) {
      this.api.Patcher.instead(IdleStore, "isIdle", () => false);
      this.api.Patcher.instead(IdleStore, "isAFK", () => false);
      this.api.Patcher.instead(IdleStore, "getIdleSince", () => null);
    } else {
      this.markFailed("disableIdle");
      this.api.UI.showToast("Incognito: Idle blocking unavailable", {
        type: "warning",
      });
    }
  }

  stripTrackingParams(content) {
    URL_REGEX.lastIndex = 0;
    return content.replace(URL_REGEX, (url) => {
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
    const { MessageActions } = this.modules;

    if (MessageActions?.sendMessage) {
      this.api.Patcher.before(
        MessageActions,
        "sendMessage",
        (_, [, message]) => {
          if (message?.content) {
            message.content = this.stripTrackingParams(message.content);
          }
        },
      );
    } else {
      this.markFailed("stripTrackingUrls");
      this.api.UI.showToast("Incognito: URL stripping unavailable", {
        type: "warning",
      });
    }
  }

  spoofLocale() {
    const { SuperProperties } = this.modules;

    if (SuperProperties?.getSuperProperties) {
      this.api.Patcher.after(
        SuperProperties,
        "getSuperProperties",
        (_, __, ret) => {
          if (ret && typeof ret === "object") {
            ret.system_locale = "en-US";
            ret.client_app_state = "focused";
          }
          return ret;
        },
      );

      this.api.Patcher.after(
        SuperProperties,
        "getSuperPropertiesBase64",
        () => {
          const props = SuperProperties.getSuperProperties();
          return btoa(JSON.stringify(props));
        },
      );
    } else {
      this.markFailed("spoofLocale");
      this.api.UI.showToast("Incognito: Locale spoofing unavailable", {
        type: "warning",
      });
      return;
    }

    this.stripTrackingHeaders();
  }

  stripTrackingHeaders() {
    const headersToStrip = ["X-Discord-Timezone", "X-Debug-Options"];

    this.originalFetch = window.fetch;
    window.fetch = (url, opts = {}) => {
      if (opts.headers) {
        if (opts.headers instanceof Headers) {
          headersToStrip.forEach((h) => opts.headers.delete(h));
        } else if (typeof opts.headers === "object") {
          headersToStrip.forEach((h) => delete opts.headers[h]);
        }
      }
      return this.originalFetch.call(window, url, opts);
    };

    this.originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    const stripped = new Set(headersToStrip.map((h) => h.toLowerCase()));
    const origSetHeader = this.originalSetRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
      if (stripped.has(name.toLowerCase())) return;
      return origSetHeader.call(this, name, value);
    };
  }

  silentTyping() {
    const { TypingModule } = this.modules;

    if (TypingModule?.startTyping && TypingModule?.stopTyping) {
      this.api.Patcher.instead(TypingModule, "startTyping", () => {});
      this.api.Patcher.instead(TypingModule, "stopTyping", () => {});
    } else {
      this.markFailed("silentTyping");
      this.api.UI.showToast("Incognito: Silent typing unavailable", {
        type: "warning",
      });
    }
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
    const { Uploader } = this.modules;

    if (Uploader?.prototype?.uploadFiles) {
      this.api.Patcher.before(
        Uploader.prototype,
        "uploadFiles",
        (_, [files]) => {
          for (const file of files) {
            if (file.filename) {
              file.filename = this.generateFilename(file.filename);
            }
          }
        },
      );
    } else {
      this.markFailed("anonymiseFiles");
      this.api.UI.showToast("Incognito: File anonymization unavailable", {
        type: "warning",
      });
    }
  }

  antiLog() {
    const { MessageActions } = this.modules;

    if (MessageActions?.deleteMessage && MessageActions?.editMessage) {
      this.api.Patcher.instead(
        MessageActions,
        "deleteMessage",
        async (_, [channelId, messageId, ...rest], original) => {
          try {
            await MessageActions.editMessage(channelId, messageId, {
              content: this.randomString(12),
            });
            await new Promise((r) => setTimeout(r, 100));
          } catch {}
          return original(channelId, messageId, ...rest);
        },
      );
    } else {
      this.markFailed("antiLog");
      this.api.UI.showToast("Incognito: Anti-log unavailable", {
        type: "warning",
      });
    }
  }

  blockReadReceipts() {
    const { AckModule } = this.modules;
    let failed = [];

    if (AckModule?.ack) {
      this.api.Patcher.instead(AckModule, "ack", () => {});
    } else {
      failed.push("message ack");
    }

    if (typeof AckModule?.y5 === "function") {
      this.api.Patcher.instead(AckModule, "y5", () => {});
    } else {
      failed.push("bulk ack");
    }

    if (failed.length === 2) {
      this.markFailed("blockReadReceipts");
      this.api.UI.showToast(
        `Incognito: Read receipt blocking (${failed.join(", ")}) unavailable`,
        { type: "warning" },
      );
    }
  }

  saveSettings() {
    this.api.Data.save("settings", this.settings);
  }

  getSettingsPanel() {
    return this.api.UI.buildSettingsPanel({
      settings: [
        {
          type: "category",
          id: "tracking",
          name: "Tracking",
          collapsible: true,
          shown: true,
          settings: [
            {
              type: "switch",
              id: "stopAnalytics",
              name: "Stop Analytics",
              note: "Blocks analytics, experiment tracking, live crash reports, discord_rpc, and exit analytics.",
              value: this.settings.stopAnalytics,
            },
            {
              type: "switch",
              id: "stopSentry",
              name: "Stop Sentry",
              note: "Disables Sentry error and crash reporting.",
              value: this.settings.stopSentry,
            },
            {
              type: "switch",
              id: "stopProcessMonitor",
              name: "Stop Process Monitor",
              note: "Stops Discord from scanning running processes on your PC to detect games and applications.",
              value: this.settings.stopProcessMonitor,
            },
          ],
        },
        {
          type: "category",
          id: "privacy",
          name: "Privacy",
          collapsible: true,
          shown: true,
          settings: [
            {
              type: "switch",
              id: "blockReadReceipts",
              name: "Block Read Receipts",
              note: "Prevents Discord from knowing which messages you've read. May cause unread badges to accumulate.",
              value: this.settings.blockReadReceipts,
            },
            {
              type: "switch",
              id: "disableIdle",
              name: "Disable Idle",
              note: "Prevents Discord and other users from knowing when you're idle or AFK.",
              value: this.settings.disableIdle,
            },
            {
              type: "switch",
              id: "stripTrackingUrls",
              name: "Strip URL Trackers",
              note: "Removes tracking parameters from links you share, hiding their origin.",
              value: this.settings.stripTrackingUrls,
            },
            {
              type: "switch",
              id: "spoofLocale",
              name: "Spoof Fingerprints",
              note: "Masks your system locale as en-US, always reports Discord as focused, and strips timezone/debug headers from requests.",
              value: this.settings.spoofLocale,
            },
            {
              type: "switch",
              id: "silentTyping",
              name: "Silent Typing",
              note: "Hides your typing indicator from other users.",
              value: this.settings.silentTyping,
            },
            {
              type: "switch",
              id: "anonymiseFiles",
              name: "Anonymise File Names",
              note: "Replaces uploaded file names with random strings to hide original names.",
              value: this.settings.anonymiseFiles,
            },
            {
              type: "switch",
              id: "antiLog",
              name: "Anti Message Log",
              note: "Edits messages to random text before deleting, defeating message loggers.",
              value: this.settings.antiLog,
            },
          ],
        },
      ],
      onChange: (_, id, value) => {
        this.settings[id] = value;
        this.saveSettings();

        if (id === "stopProcessMonitor") {
          if (value) {
            this.disableProcessMonitor();
          } else {
            this.enableProcessMonitor();
          }
          return;
        }

        this.stop();
        this.start();
      },
    });
  }
};
