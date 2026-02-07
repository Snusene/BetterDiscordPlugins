/**
 * @name Incognito
 * @description Stop tracking, hide typing, spoof fingerprints, and much more.
 * @version 0.9.8
 * @author Snues
 * @authorId 98862725609816064
 * @website https://github.com/Snusene/BetterDiscordPlugins/tree/main/Incognito
 * @source https://raw.githubusercontent.com/Snusene/BetterDiscordPlugins/main/Incognito/Incognito.plugin.js
 */

// prettier-ignore
const TRACKING_PARAMS = new Set(["utm_source","utm_medium","utm_campaign","utm_term","utm_content","utm_id","utm_referrer","utm_social","utm_social-type","gclid","gclsrc","dclid","gbraid","wbraid","_ga","_gl","_gac","fbclid","fb_action_ids","fb_action_types","fb_source","fb_ref","msclkid","twclid","ttclid","_ttp","li_fat_id","li_tc","mc_cid","mc_eid","_hsenc","_hsmi","hsa_acc","hsa_cam","hsa_grp","hsa_ad","hsa_src","hsa_tgt","hsa_kw","hsa_mt","hsa_net","hsa_ver","mkt_tok","_kx","__s","vero_id","vero_conv","sc_cid","s_kwcid","igshid","si","feature","pp","nd","go","tag","ascsubtag","ref_","pf_rd_p","pf_rd_r","spm","scm","pvid","algo_pvid","algo_expid","aff_platform","aff_trace_key","terminal_id","_branch_match_id","_branch_referrer","ref","ref_src","ref_url","source","context","s","t","trk","clickid","click_id","cid","campaign_id","ad_id","adset_id","creative_id","placement","affiliate_id","aff_id","oly_anon_id","oly_enc_id","rb_clickid","ns_mchannel","ns_source","ns_campaign","ns_linkname","ns_fee","yclid","zanpid","irclickid","ranMID","ranEAID","ranSiteID","vgo_ee","sref","ito","wickedid","ncid","pd_rd_w","pd_rd_wg","pd_rd_i","qid","sr","keywords","crid","sprefix","_encoding","psc","mbid","xtor","_openstat","smid","smtyp","dm_i","elqTrack","elqTrackId","mkwid","pcrid","pkw","pmt","slid"]);

const STAT_KEYS = [
  "telemetryBlocked",
  "sentryBlocked",
  "readReceiptsBlocked",
  "typingIndicatorsBlocked",
  "trackingUrlsStripped",
  "idleSpoofed",
  "filesAnonymized",
  "fingerprintsSpoofed",
];

/* const CHANGELOG = [
  {
    title: "What's new",
    type: "added",
    items: [To be changed],
  },
]; */

module.exports = class Incognito {
  static resolveModKey(mod) {
    if (!mod) return null;
    const key = Object.keys(mod).find((k) => typeof mod[k] === "function");
    return key ? [mod, key] : null;
  }

  static getModules() {
    const { Stores, Filters } = BdApi.Webpack;

    const bulk = BdApi.Webpack.getBulkKeyed({
      Analytics: { filter: Filters.byKeys("AnalyticEventConfigs") },
      NativeModule: { filter: Filters.byKeys("getDiscordUtils") },
      CrashReporter: { filter: (m) => m?.submitLiveCrashReport },
      TypingModule: { filter: Filters.byKeys("startTyping", "stopTyping") },
      MessageActions: { filter: Filters.byKeys("sendMessage", "editMessage") },
      SuperProperties: {
        filter: Filters.byKeys(
          "getSuperProperties",
          "getSuperPropertiesBase64",
        ),
      },
      Uploader: { filter: (m) => m?.prototype?.uploadFiles },
      DebugOptionsStore: {
        filter: Filters.byKeys("getDebugOptionsHeaderValue"),
      },
      MetricsModule: { filter: Filters.byKeys("increment", "distribution") },
      ConsentModule: {
        filter: Filters.bySource("SETTINGS_CONSENT"),
        searchExports: true,
      },
      APIModule: { filter: (m) => m?.Bo?.post },
      HTTPModule: { filter: Filters.byKeys("Request", "post", "get", "del") },
      _tzRaw: {
        filter: Filters.bySource("resolvedOptions().timeZone"),
        searchExports: true,
      },
      _cmRaw: {
        filter: Filters.bySource(".BetterDiscord"),
        searchExports: true,
      },
    });

    const modules = {
      ...bulk,
      ActivityTrackingStore: Stores.ActivityTrackingStore,
      IdleStore: Stores.IdleStore,
      ConsentStore: Stores.ConsentStore,
      RunningGameStore: Stores.RunningGameStore,
      Dispatcher: Stores.ReadStateStore?._dispatcher,
      TimezoneModule: Incognito.resolveModKey(bulk._tzRaw),
      ClientModsModule: Incognito.resolveModKey(bulk._cmRaw),
    };

    delete modules._tzRaw;
    delete modules._cmRaw;

    return modules;
  }

  constructor(meta) {
    this.meta = meta;
    this.api = new BdApi(meta.name);
    this.patchers = {};
    this.defaultSettings = {
      blockTelemetry: true,
      blockErrorReporting: true,
      blockProcessScanning: true,
      blockReadReceipts: true,
      disableIdle: true,
      silentTyping: true,
      spoofFingerprints: true,
      hideClientMods: true,
      stripUrlTrackers: true,
      anonymiseFiles: true,
    };
  }

  initStats() {
    const defaultStats = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
    this.stats = { ...defaultStats, ...(this.api.Data.load("stats") ?? {}) };
    this.sessionStats = { ...defaultStats };
    this.saveStats = BdApi.Utils.debounce(
      () => this.api.Data.save("stats", this.stats),
      5000,
    );
  }

  /* showChangelog() {
    const lastVersion = this.api.Data.load("lastVersion");
    if (lastVersion === this.meta.version) return;
    this.api.Data.save("lastVersion", this.meta.version);
    BdApi.UI.showChangelogModal({
      title: this.meta.name,
      subtitle: `v${this.meta.version}`,
      changes: CHANGELOG,
    });
  } */

  incrementStat(stat) {
    this.stats[stat]++;
    this.sessionStats[stat]++;
    this.saveStats();
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

    if (this.settings.blockTelemetry) this.blockTelemetry();
    if (this.settings.blockErrorReporting) this.blockErrorReporting();
    if (this.settings.blockProcessScanning) this.blockProcessScanning();
    if (this.settings.blockReadReceipts) this.blockReadReceipts();
    if (this.settings.disableIdle) this.disableIdle();
    if (this.settings.silentTyping) this.silentTyping();
    if (this.settings.spoofFingerprints) this.spoofFingerprints();
    if (this.settings.hideClientMods) this.hideClientMods();
    if (this.settings.stripUrlTrackers) this.stripUrlTrackers();
    if (this.settings.anonymiseFiles) this.anonymiseFiles();

    this.injectStyles();
    // this.showChangelog();
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

    this.disableClipboardHandlers();

    this.api.DOM.removeStyle();
    this.saveStats?.cancel?.();
    if (this.stats) {
      this.api.Data.save("stats", this.stats);
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
      blockTelemetry: () => this.modules.Analytics,
      blockErrorReporting: () =>
        window.DiscordSentry?.getClient?.() || this.modules.CrashReporter,
      blockProcessScanning: () =>
        this.modules.NativeModule?.getDiscordUtils?.(),
      blockReadReceipts: () => this.modules.HTTPModule?.Request?.prototype?.end,
      disableIdle: () => this.modules.IdleStore,
      silentTyping: () => this.modules.TypingModule?.startTyping,
      spoofFingerprints: () =>
        this.modules.SuperProperties?.getSuperProperties ||
        this.modules.TimezoneModule,
      hideClientMods: () => this.modules.ClientModsModule,
      stripUrlTrackers: () => this.modules.MessageActions?.sendMessage,
      anonymiseFiles: () => this.modules.Uploader,
    };

    for (const feature of [...this.failed]) {
      const check = featureModules[feature];
      if (check?.()) {
        this.failed.delete(feature);
        this.settings[feature] = true;
        this.enableFeature(feature);
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

  handleFailure(feature, failed = null) {
    if (failed !== null && failed.length === 0) return;
    this.markFailed(feature);
    this.api.UI.showToast(`Incognito: ${feature} unavailable`, {
      type: "warning",
    });
  }

  blockTelemetry() {
    const patcher = this.getPatcher("blockTelemetry");
    const { Analytics } = this.modules;
    let failed = [];

    if (!Analytics) {
      failed.push("events");
    } else {
      if (Analytics.default?.track) {
        patcher.instead(Analytics.default, "track", () => {
          this.incrementStat("telemetryBlocked");
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

    const { ConsentStore, ConsentModule, DebugOptionsStore } = this.modules;
    if (ConsentStore?.hasConsented) {
      patcher.instead(ConsentStore, "hasConsented", () => false);
    } else {
      failed.push("consents");
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

    if (ConsentModule?.Q && ConsentModule?.U) {
      ConsentModule.Q()
        .then((consents) => {
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

    const { APIModule } = this.modules;
    const isPremiumMarketing = (url) =>
      typeof url === "string" && /\/api\/v\d+\/premium-marketing/i.test(url);

    if (APIModule?.Bo?.post) {
      patcher.instead(APIModule.Bo, "post", (_, [options], original) => {
        if (isPremiumMarketing(options?.url)) {
          this.incrementStat("telemetryBlocked");
          return Promise.resolve({ ok: true, body: [] });
        }
        return original(options);
      });
    } else {
      failed.push("premium-marketing");
    }

    const { Dispatcher } = this.modules;
    if (Dispatcher?.dispatch) {
      patcher.before(Dispatcher, "dispatch", (_, [action]) => {
        if (action.type === "CONTENT_INVENTORY_TRACK_ITEM_IMPRESSIONS") {
          action.type = "__INCOGNITO_BLOCKED__";
          this.incrementStat("telemetryBlocked");
        }
      });
    }

    this.handleFailure("blockTelemetry", failed);
  }

  blockErrorReporting() {
    const patcher = this.getPatcher("blockErrorReporting");
    const { CrashReporter } = this.modules;
    let failed = [];

    const client = window.DiscordSentry?.getClient?.();
    if (!client) {
      failed.push("sentry");
    } else {
      const transport = client.getTransport?.();
      if (transport?.send) {
        patcher.instead(transport, "send", () => {
          this.incrementStat("sentryBlocked");
          return Promise.resolve({});
        });
      } else {
        failed.push("sentry transport");
      }
    }

    if (CrashReporter?.submitLiveCrashReport) {
      patcher.instead(CrashReporter, "submitLiveCrashReport", () => {});
    } else {
      failed.push("crash reports");
    }

    this.handleFailure("blockErrorReporting", failed);
  }

  blockProcessScanning() {
    const patcher = this.getPatcher("blockProcessScanning");
    const { NativeModule, RunningGameStore } = this.modules;
    let failed = [];

    const DiscordUtils = NativeModule?.getDiscordUtils?.();
    if (DiscordUtils) {
      if (DiscordUtils.setObservedGamesCallback) {
        DiscordUtils.setObservedGamesCallback([], () => {});
        patcher.instead(DiscordUtils, "setObservedGamesCallback", () => {});
      } else {
        failed.push("observedGames");
      }

      if (DiscordUtils.setObservedGamesCallback2) {
        DiscordUtils.setObservedGamesCallback2([], () => {});
        patcher.instead(DiscordUtils, "setObservedGamesCallback2", () => {});
      } else {
        failed.push("observedGames2");
      }

      if (DiscordUtils.setGameDetectionCallback) {
        DiscordUtils.setGameDetectionCallback(() => {});
        patcher.instead(DiscordUtils, "setGameDetectionCallback", () => {});
      } else {
        failed.push("gameDetection");
      }

      if (DiscordUtils.setCandidateGamesCallback) {
        DiscordUtils.setCandidateGamesCallback(() => {});
        patcher.instead(DiscordUtils, "setCandidateGamesCallback", () => {});
      } else {
        failed.push("candidateGames");
      }
    } else {
      failed.push("DiscordUtils");
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

    if (RunningGameStore) {
      patcher.instead(RunningGameStore, "getVisibleGame", () => null);
      patcher.instead(RunningGameStore, "getVisibleRunningGames", () => []);
      patcher.instead(RunningGameStore, "getRunningGames", () => []);
      patcher.instead(RunningGameStore, "getCandidateGames", () => []);
    } else {
      failed.push("RunningGameStore");
    }

    this.handleFailure("blockProcessScanning", failed);
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

  blockReadReceipts() {
    const patcher = this.getPatcher("blockReadReceipts");
    const { HTTPModule } = this.modules;
    const RequestProto = HTTPModule?.Request?.prototype;

    if (!RequestProto?.end) {
      this.handleFailure("blockReadReceipts");
      return;
    }

    const isAckUrl = (url) =>
      typeof url === "string" &&
      /\/channels\/\d+\/messages\/\d+\/ack/.test(url);

    patcher.instead(RequestProto, "end", (thisObj, args, original) => {
      if (thisObj.method === "POST" && isAckUrl(thisObj.url)) {
        this.incrementStat("readReceiptsBlocked");
        const callback = args[0];
        if (typeof callback === "function") {
          callback(null, { ok: true, status: 200, body: {} });
        }
        return thisObj;
      }
      return original.apply(thisObj, args);
    });
  }

  disableIdle() {
    const patcher = this.getPatcher("disableIdle");
    const { IdleStore } = this.modules;

    if (!IdleStore) {
      this.handleFailure("disableIdle");
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

  silentTyping() {
    const patcher = this.getPatcher("silentTyping");
    const { TypingModule } = this.modules;

    if (!TypingModule?.startTyping || !TypingModule?.stopTyping) {
      this.handleFailure("silentTyping");
      return;
    }

    let lastTypingStat = 0;
    patcher.instead(TypingModule, "startTyping", () => {
      const now = Date.now();
      if (now - lastTypingStat > 10000) {
        this.incrementStat("typingIndicatorsBlocked");
        lastTypingStat = now;
      }
    });
    patcher.instead(TypingModule, "stopTyping", () => {});
  }

  spoofFingerprints() {
    const patcher = this.getPatcher("spoofFingerprints");
    const { SuperProperties, TimezoneModule } = this.modules;
    let failed = [];

    if (SuperProperties?.getSuperProperties) {
      let lastFingerprintStat = 0;
      patcher.after(SuperProperties, "getSuperProperties", (_, __, ret) => {
        ret.system_locale = "en-US";
        ret.client_app_state = "focused";
        const now = Date.now();
        if (now - lastFingerprintStat > 10000) {
          this.incrementStat("fingerprintsSpoofed");
          lastFingerprintStat = now;
        }
      });

      patcher.after(SuperProperties, "getSuperPropertiesBase64", () => {
        const props = SuperProperties.getSuperProperties();
        return btoa(JSON.stringify(props));
      });
    } else {
      failed.push("locale");
    }

    if (Array.isArray(TimezoneModule)) {
      const [tzMod, tzKey] = TimezoneModule;
      patcher.instead(tzMod, tzKey, () => null);
    } else {
      failed.push("timezone");
    }

    this.handleFailure("spoofFingerprints", failed);
  }

  hideClientMods() {
    const patcher = this.getPatcher("hideClientMods");
    const { ClientModsModule } = this.modules;

    if (!Array.isArray(ClientModsModule)) {
      this.handleFailure("hideClientMods");
      return;
    }

    const [modObj, modKey] = ClientModsModule;
    patcher.instead(modObj, modKey, () => []);
  }

  stripTrackingParams(content) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return content.replace(urlRegex, (url) => {
      try {
        const trailingMatch = url.match(/[),.;:!?]+$/);
        const trailing = trailingMatch ? trailingMatch[0] : "";
        const cleanInput = trailing ? url.slice(0, -trailing.length) : url;

        const parsed = new URL(cleanInput);
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
          return cleanUrl + trailing;
        }
        return url;
      } catch {
        return url;
      }
    });
  }

  stripUrlTrackers() {
    const patcher = this.getPatcher("stripUrlTrackers");
    const { MessageActions } = this.modules;

    if (!MessageActions?.sendMessage) {
      this.handleFailure("stripUrlTrackers");
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
      if (sanitized === text) return;

      const target = e.target;
      const isInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (!isInput && !target.isContentEditable) return;

      e.preventDefault();
      if (isInput) {
        const start = target.selectionStart ?? 0;
        const end = target.selectionEnd ?? 0;
        target.value =
          target.value.slice(0, start) + sanitized + target.value.slice(end);
        target.selectionStart = target.selectionEnd = start + sanitized.length;
        target.dispatchEvent(new InputEvent("input", { bubbles: true }));
      } else {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(sanitized));
        range.collapse(false);
        target.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: sanitized,
          }),
        );
      }
      this.incrementStat("trackingUrlsStripped");
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

  randomString(length) {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const values = crypto.getRandomValues(new Uint8Array(length));
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars[values[i] % chars.length];
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
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;

      ctx.drawImage(bitmap, 0, 0);
      const quality = file.type === "image/png" ? undefined : 0.92;
      const blob = await canvas.convertToBlob({ type: file.type, quality });
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
      this.handleFailure("anonymiseFiles");
      return;
    }

    patcher.instead(
      Uploader.prototype,
      "uploadFiles",
      async (thisArg, [files], original) => {
        if (files) {
          for (const fileObj of files) {
            if (fileObj?.filename) {
              fileObj.filename = this.generateFilename(fileObj.filename);
              this.incrementStat("filesAnonymized");
            }
            if (fileObj?.file) {
              fileObj.file = await this.stripImageMetadata(fileObj.file);
            }
          }
        }
        return original.call(thisArg, files);
      },
    );
  }

  disableFeature(feature) {
    if (this.patchers[feature]) {
      this.patchers[feature].unpatchAll();
      delete this.patchers[feature];
    }
  }

  enableFeature(id) {
    const featureMap = {
      blockTelemetry: () => this.blockTelemetry(),
      blockErrorReporting: () => this.blockErrorReporting(),
      blockProcessScanning: () => this.blockProcessScanning(),
      blockReadReceipts: () => this.blockReadReceipts(),
      disableIdle: () => this.disableIdle(),
      silentTyping: () => this.silentTyping(),
      spoofFingerprints: () => this.spoofFingerprints(),
      hideClientMods: () => this.hideClientMods(),
      stripUrlTrackers: () => this.stripUrlTrackers(),
      anonymiseFiles: () => this.anonymiseFiles(),
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
      const [, forceUpdate] = BdApi.Hooks.useForceUpdate();

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
      blockTelemetry: { key: "telemetryBlocked", label: "blocked" },
      blockErrorReporting: { key: "sentryBlocked", label: "blocked" },
      blockReadReceipts: { key: "readReceiptsBlocked", label: "blocked" },
      disableIdle: { key: "idleSpoofed", label: "spoofed" },
      silentTyping: { key: "typingIndicatorsBlocked", label: "hidden" },
      spoofFingerprints: { key: "fingerprintsSpoofed", label: "spoofed" },
      stripUrlTrackers: { key: "trackingUrlsStripped", label: "stripped" },
      anonymiseFiles: { key: "filesAnonymized", label: "anonymized" },
    };

    const settingsConfig = [
      {
        id: "blockTelemetry",
        name: "Block Telemetry",
        note: "Stops Discord's analytics, usage metrics, activity reporting, and Nitro promotion tracking.",
      },
      {
        id: "blockErrorReporting",
        name: "Block Error Reporting",
        note: "Intercepts Sentry error reports and crash reports before they reach Discord.",
      },
      {
        id: "blockProcessScanning",
        name: "Block Process Scanning",
        note: "Stops Discord from seeing any processes running on your PC.",
      },
      {
        id: "blockReadReceipts",
        name: "Block Read Receipts",
        note: "Prevents Discord from knowing which messages you've read.",
      },
      {
        id: "disableIdle",
        name: "Disable Idle",
        note: "Keeps your status active so Discord and other users won't see you as idle or AFK.",
      },
      {
        id: "silentTyping",
        name: "Silent Typing",
        note: "Hides your typing indicator from everyone.",
      },
      {
        id: "spoofFingerprints",
        name: "Spoof Fingerprints",
        note: "Spoofs your locale, timezone, and Discord's focus state.",
      },
      {
        id: "hideClientMods",
        name: "Hide Client Mods",
        note: "Prevents Discord from detecting BetterDiscord and other client mods.",
      },
      {
        id: "stripUrlTrackers",
        name: "Strip URL Trackers",
        note: "Removes common tracking parameters from URLs you send, copy, or paste.",
      },
      {
        id: "anonymiseFiles",
        name: "Anonymise Files",
        note: "Randomises file names and strips metadata from images before upload.",
      },
    ];

    const handleChange = (id, value) => {
      this.settings[id] = value;
      this.saveSettings();

      if (id === "blockProcessScanning") {
        if (value) {
          this.enableFeature(id);
        } else {
          this.disableFeature(id);
          this.enableProcessMonitor();
        }
        return;
      }

      if (id === "stripUrlTrackers") {
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

    const { Text } = BdApi.Components;
    const footer = React.createElement(
      Text,
      {
        color: Text.Colors.MUTED,
        size: Text.Sizes.SIZE_12,
        style: { textAlign: "center", padding: "16px" },
      },
      "Made with \u2764\uFE0F for privacy by ",
      React.createElement(
        Text,
        {
          tag: "a",
          color: Text.Colors.LINK,
          size: Text.Sizes.SIZE_12,
          href: "https://discord.com/users/98862725609816064",
          style: { textDecoration: "none" },
        },
        "Snues",
      ),
      ".",
      React.createElement("br"),
      "Bugs, feedback, or suggestions? Let me know on Discord.",
    );

    return React.createElement(
      React.Fragment,
      null,
      banner,
      settingsPanel,
      footer,
    );
  }
};
