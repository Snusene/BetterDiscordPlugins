/**
 * @name PriorityDM
 * @author Snues
 * @authorId 98862725609816064
 * @description Let DMs from specific people bypass Do Not Disturb.
 * @version 1.1.0
 * @invite xp2f3YFKMY
 * @source https://github.com/Snusene/BetterDiscordPlugins/tree/main/PriorityDM
 * @donate https://ko-fi.com/snues
 */

module.exports = class PriorityDM {
  constructor(meta) {
    this.api = new BdApi(meta.name);
    this.priorityUsers = new Set();
    this.priorityGroups = new Set();
    this.settings = { overrideStreamerMode: false };
    this.lastPing = 0;
    this.unpatch = [];
    this.onMessage = this.onMessage.bind(this);
  }

  start() {
    this.loadSettings();
    const { Stores, Filters } = BdApi.Webpack;
    this.UserStore = Stores.UserStore;
    this.PresenceStore = Stores.PresenceStore;
    this.ChannelStore = Stores.ChannelStore;
    this.IconUtils = BdApi.Webpack.getModule(
      Filters.byKeys("getUserAvatarURL"),
    );
    this.wait = new AbortController();
    BdApi.Webpack.waitForModule(
      Filters.byKeys("showNotification", "requestPermission"),
      { signal: this.wait.signal },
    ).then((m) => {
      this.NotificationModule = m;
    });
    this.Dispatcher = Stores.UserStore._dispatcher;
    this.Dispatcher.subscribe("MESSAGE_CREATE", this.onMessage);
    this.patchMenus();
  }

  stop() {
    this.wait?.abort();
    this.Dispatcher.unsubscribe("MESSAGE_CREATE", this.onMessage);
    for (const fn of this.unpatch) fn();
    this.unpatch = [];
    this.saveSettings();
  }

  loadSettings() {
    this.priorityUsers = new Set(this.api.Data.load("users") || []);
    this.priorityGroups = new Set(this.api.Data.load("groups") || []);
    const settings = this.api.Data.load("settings");
    if (settings) this.settings = settings;
  }

  saveSettings() {
    this.api.Data.save("users", [...this.priorityUsers]);
    this.api.Data.save("groups", [...this.priorityGroups]);
    this.api.Data.save("settings", this.settings);
  }

  getSettingsPanel() {
    return BdApi.UI.buildSettingsPanel({
      settings: [
        {
          type: "switch",
          id: "overrideStreamerMode",
          name: "Override Streamer Mode",
          note: "Notify even when Streamer Mode is blocking notifications",
          value: this.settings.overrideStreamerMode,
        },
      ],
      onChange: (_, id, value) => {
        this.settings[id] = value;
        this.api.Data.save("settings", this.settings);
      },
    });
  }

  patchMenus() {
    this.unpatch.push(
      BdApi.ContextMenu.patch("user-context", (tree, props) => {
        const userId = props.user?.id;
        if (!userId || userId === this.UserStore.getCurrentUser()?.id) return;
        this.addToggle(tree, this.priorityUsers, userId);
      }),
      BdApi.ContextMenu.patch("gdm-context", (tree, props) => {
        const channelId = props.channel?.id;
        if (channelId) this.addToggle(tree, this.priorityGroups, channelId);
      }),
    );
  }

  addToggle(tree, set, id) {
    const children = tree?.props?.children;
    if (!Array.isArray(children)) return;
    const on = set.has(id);
    children.push(
      BdApi.ContextMenu.buildItem({ type: "separator" }),
      BdApi.ContextMenu.buildItem({
        type: "toggle",
        label: "Priority DM",
        checked: on,
        action: () => {
          if (on) set.delete(id);
          else set.add(id);
          this.saveSettings();
        },
      }),
    );
  }

  onMessage(event) {
    const { message } = event;
    if (!message?.author || event.optimistic) return;

    const currentUser = this.UserStore.getCurrentUser();
    if (!currentUser || message.author.id === currentUser.id) return;

    const channel = this.ChannelStore.getChannel(message.channel_id);
    if (!channel || (channel.type !== 1 && channel.type !== 3)) return;

    if (this.PresenceStore.getStatus(currentUser.id) !== "dnd") return;

    if (
      !this.priorityUsers.has(message.author.id) &&
      !this.priorityGroups.has(channel.id)
    )
      return;

    this.notify(message, channel);
  }

  notify(message, channel) {
    if (!this.NotificationModule) return;
    const now = Date.now();
    if (now - this.lastPing < 1000) return;
    this.lastPing = now;

    const author = message.author;
    this.NotificationModule.showNotification(
      this.IconUtils?.getUserAvatarURL(author),
      author.globalName || author.username,
      message.content,
      { message, channel },
      {
        overrideStreamerMode: this.settings.overrideStreamerMode,
        sound: "message1",
        isUserAvatar: true,
      },
    );
  }
};
