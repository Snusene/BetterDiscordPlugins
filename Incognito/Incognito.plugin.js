/**
 * @name Incognito
 * @description Go incognito with one click. Stop tracking, hide typing, disable activity, and much more.
 * @version 0.9.69
 * @author Snues
 * @authorId 98862725609816064
 * @website https://github.com/Snusene/BetterDiscordPlugins/tree/main/Incognito
 * @source https://raw.githubusercontent.com/Snusene/BetterDiscordPlugins/main/Incognito/Incognito.plugin.js
 */

// prettier-ignore
const TRACKING_PARAMS = new Set(["utm_source","utm_medium","utm_campaign","utm_term","utm_content","utm_id","utm_referrer","utm_social","utm_social-type","gclid","gclsrc","dclid","gbraid","wbraid","_ga","_gl","_gac","fbclid","fb_action_ids","fb_action_types","fb_source","fb_ref","msclkid","twclid","ttclid","_ttp","li_fat_id","li_tc","mc_cid","mc_eid","_hsenc","_hsmi","hsa_acc","hsa_cam","hsa_grp","hsa_ad","hsa_src","hsa_tgt","hsa_kw","hsa_mt","hsa_net","hsa_ver","mkt_tok","_kx","__s","vero_id","vero_conv","sc_cid","s_kwcid","igshid","si","feature","pp","nd","go","tag","ascsubtag","ref_","pf_rd_p","pf_rd_r","spm","scm","pvid","algo_pvid","algo_expid","aff_platform","aff_trace_key","terminal_id","_branch_match_id","_branch_referrer","ref","ref_src","ref_url","source","context","s","t","trk","clickid","click_id","cid","campaign_id","ad_id","adset_id","creative_id","placement","affiliate_id","aff_id","oly_anon_id","oly_enc_id","rb_clickid","ns_mchannel","ns_source","ns_campaign","ns_linkname","ns_fee"]);

const STAT_KEYS = [
  "analyticsBlocked",
  "sentryBlocked",
  "readReceiptsBlocked",
  "typingIndicatorsBlocked",
  "trackingUrlsStripped",
  "idleSpoofed",
  "filesAnonymized",
  "processScansBlocked",
  "fingerprintsSpoofed",
];

const CHANGELOG = [
  {
    title: "New",
    type: "added",
    items: [
      "Image metadata (EXIF, GPS, camera info) now stripped before upload",
    ],
  },
  {
    title: "Recent Changes",
    type: "improved",
    items: [
      "Process scanning blocks detection without hiding Spotify and other integrations",
      "Internal usage metrics blocked from being sent to Discord",
      "Discord can no longer detect client mods",
      "Stats banner showing session and all time privacy actions",
    ],
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
      TypingModule: BdApi.Webpack.getByKeys("startTyping", "stopTyping"),
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
      MetricsModule: BdApi.Webpack.getByKeys("increment", "distribution"),
      ConsentStore: BdApi.Webpack.getStore("ConsentStore"),
      ClipsStore: BdApi.Webpack.getStore("ClipsStore"),
      ConsentModule: BdApi.Webpack.getBySource("SETTINGS_CONSENT", {
        searchExports: true,
      }),
      ClientModsModule: (() => {
        const mod = BdApi.Webpack.getBySource(".BetterDiscord", {
          searchExports: true,
        });
        if (!mod) return null;
        const key = Object.keys(mod).find((k) => typeof mod[k] === "function");
        return key ? [mod, key] : null;
      })(),
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
    const savedStats = this.api.Data.load("stats");
    this.stats = savedStats
      ? { ...defaultStats, ...savedStats }
      : { ...defaultStats };
    this.sessionStats = { ...defaultStats };
    this.saveStats = () => this.api.Data.save("stats", this.stats);
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
      this.saveStats();
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
    this.initStats();

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

    this.restoreConsents();
    this.restoreSentryTransport();
    this.disableClipboardHandlers();

    this.api.DOM.removeStyle();
    if (this.stats) {
      this.saveStats();
    }
    this.settings = null;
    this.failed = null;
    this.modules = null;
    this.stats = null;
    this.sessionStats = null;
    this.saveStats = null;
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

    const { ActivityTrackingStore, MetricsModule } = this.modules;
    if (ActivityTrackingStore?.getActivities) {
      patcher.instead(ActivityTrackingStore, "getActivities", () => ({}));
    } else {
      failed.push("activity tracking");
    }

    if (MetricsModule) {
      if (MetricsModule.increment) {
        patcher.instead(MetricsModule, "increment", () => {});
      }
      if (MetricsModule.distribution) {
        patcher.instead(MetricsModule, "distribution", () => {});
      }
    } else {
      failed.push("metrics");
    }

    const { ConsentStore, ClipsStore, ConsentModule } = this.modules;
    if (ConsentStore?.hasConsented) {
      patcher.instead(ConsentStore, "hasConsented", () => false);
    } else {
      failed.push("consents");
    }

    if (ClipsStore?.isVoiceRecordingAllowedForUser) {
      patcher.instead(
        ClipsStore,
        "isVoiceRecordingAllowedForUser",
        () => false,
      );
    } else {
      failed.push("voice clips");
    }

    if (ConsentModule?.Q && ConsentModule?.U) {
      ConsentModule.Q()
        .then((consents) => {
          this.originalConsents = consents;
          const toRevoke = [];
          if (consents.usage_statistics?.consented)
            toRevoke.push("usage_statistics");
          if (consents.personalization?.consented)
            toRevoke.push("personalization");
          if (toRevoke.length > 0) {
            return ConsentModule.U([], toRevoke);
          }
        })
        .catch(() => {});
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

  restoreConsents() {
    if (!this.originalConsents) return;
    const { ConsentModule } = this.modules ?? {};
    if (!ConsentModule?.U) return;
    const toGrant = [];
    if (this.originalConsents.usage_statistics?.consented)
      toGrant.push("usage_statistics");
    if (this.originalConsents.personalization?.consented)
      toGrant.push("personalization");
    if (toGrant.length > 0) {
      ConsentModule.U(toGrant, []).catch(() => {});
    }
    this.originalConsents = null;
  }

  disableProcessMonitor() {
    const patcher = this.getPatcher("stopProcessMonitor");
    const { NativeModule, RunningGameStore } = this.modules;
    let failed = [];

    const DiscordUtils = NativeModule?.getDiscordUtils();
    if (DiscordUtils?.setObservedGamesCallback) {
      DiscordUtils.setObservedGamesCallback([], () => {});
      patcher.instead(DiscordUtils, "setObservedGamesCallback", () => {});
    } else {
      failed.push("process callback");
    }

    if (RunningGameStore) {
      patcher.instead(RunningGameStore, "getVisibleGame", () => null);
      patcher.instead(RunningGameStore, "getRunningGames", () => {
        this.incrementStat("processScansBlocked");
        return [];
      });
      patcher.instead(RunningGameStore, "getVisibleRunningGames", () => []);
      patcher.instead(RunningGameStore, "getCandidateGames", () => []);
      patcher.instead(RunningGameStore, "isDetectionEnabled", () => false);
    } else {
      failed.push("game store");
    }

    this.handleFailure("stopProcessMonitor", "Process monitoring", failed);
  }

  enableProcessMonitor() {
    this.api.UI.showConfirmationModal(
      "Reload Discord?",
      "To re-enable process monitoring Discord needs to be reloaded.",
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

    patcher.instead(IdleStore, "isIdle", (_, __, original) => {
      if (original()) {
        this.incrementStat("idleSpoofed");
      }
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
        this.incrementStat("fingerprintsSpoofed");
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
    const { TimezoneModule, DebugOptionsStore, ClientModsModule } =
      this.modules;
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

    if (Array.isArray(ClientModsModule) && ClientModsModule.length === 2) {
      const [modObj, modKey] = ClientModsModule;
      if (modObj && modKey) {
        patcher.instead(modObj, modKey, () => []);
      } else {
        failed.push("client mods");
      }
    } else {
      failed.push("client mods");
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

  async stripImageMetadata(file) {
    if (
      !file.type?.startsWith("image/") ||
      file.type === "image/gif" ||
      file.type === "image/svg+xml"
    ) {
      return file;
    }

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;

      ctx.drawImage(bitmap, 0, 0);
      const quality = file.type === "image/png" ? undefined : 0.92;
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, file.type, quality),
      );
      if (!blob) return file;

      return new File([blob], file.name, {
        type: file.type,
        lastModified: Date.now(),
      });
    } catch {
      return file;
    } finally {
      bitmap?.close();
    }
  }

  anonymiseFiles() {
    const patcher = this.getPatcher("anonymiseFiles");
    const { Uploader } = this.modules;

    if (!Uploader?.prototype?.uploadFiles) {
      this.handleFailure("anonymiseFiles", "File anonymization");
      return;
    }

    const self = this;
    patcher.instead(
      Uploader.prototype,
      "uploadFiles",
      async (thisArg, [files], original) => {
        if (files) {
          for (const fileObj of files) {
            if (fileObj?.filename) {
              fileObj.filename = self.generateFilename(fileObj.filename);
              self.incrementStat("filesAnonymized");
            }
            if (fileObj?.file) {
              fileObj.file = await self.stripImageMetadata(fileObj.file);
            }
          }
        }
        return original.call(thisArg, files);
      },
    );
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
      stopProcessMonitor: { key: "processScansBlocked", label: "blocked" },
      blockReadReceipts: { key: "readReceiptsBlocked", label: "blocked" },
      silentTyping: { key: "typingIndicatorsBlocked", label: "hidden" },
      stripTrackingUrls: { key: "trackingUrlsStripped", label: "stripped" },
      disableIdle: { key: "idleSpoofed", label: "spoofed" },
      spoofLocale: { key: "fingerprintsSpoofed", label: "spoofed" },
      anonymiseFiles: { key: "filesAnonymized", label: "anonymized" },
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
        name: "Block Process Scanning",
        note: "Prevents Discord from seeing any processes running on your PC.",
      },
      {
        id: "blockReadReceipts",
        name: "Block Read Receipts",
        note: "Prevents Discord from knowing which messages you've read.",
      },
      {
        id: "disableIdle",
        name: "Disable Idle",
        note: "Prevents Discord and other users from knowing when you're idle or AFK.",
      },
      {
        id: "stripTrackingUrls",
        name: "Strip URL Trackers",
        note: "Removes tracking parameters from URLs in messages you send and when copying/pasting.",
      },
      {
        id: "spoofLocale",
        name: "Spoof Fingerprints",
        note: "Spoofs locale/focus state, hides timezone, debug headers, and BetterDiscord.",
      },
      {
        id: "silentTyping",
        name: "Silent Typing",
        note: "Hides your typing indicator from other users.",
      },
      {
        id: "anonymiseFiles",
        name: "Anonymise Files",
        note: "Randomizes file names and strips metadata from images before upload.",
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
