/**
 * @name PriorityDM
 * @author Snues
 * @authorId 98862725609816064
 * @description Bypass Do Not Disturb for DMs from specific people. Right click a user to add them.
 * @version 1.0.1
 * @source https://github.com/Snusene/PriorityDM
 */

module.exports = class PriorityDM {
    constructor() {
        this.priorityUsers = new Set();
        this.lastPing = 0;
        this.onMessage = this.onMessage.bind(this);
    }

    start() {
        this.loadSettings();
        this.UserStore = BdApi.Webpack.getStore("UserStore");
        this.PresenceStore = BdApi.Webpack.getStore("PresenceStore");
        this.ChannelStore = BdApi.Webpack.getStore("ChannelStore");
        this.NotificationModule = BdApi.Webpack.getByKeys("showNotification", "requestPermission");
        this.Dispatcher = BdApi.Webpack.getByKeys("dispatch", "subscribe");
        this.Dispatcher?.subscribe("MESSAGE_CREATE", this.onMessage);
        this.patchContextMenu();
    }

    stop() {
        this.Dispatcher?.unsubscribe("MESSAGE_CREATE", this.onMessage);
        if (this.unpatchContextMenu) this.unpatchContextMenu();
        this.saveSettings();
    }

    loadSettings() {
        const saved = BdApi.Data.load("PriorityDM", "users") || [];
        this.priorityUsers = new Set(saved);
    }

    saveSettings() {
        BdApi.Data.save("PriorityDM", "users", [...this.priorityUsers]);
    }

    patchContextMenu() {
        this.unpatchContextMenu = BdApi.ContextMenu.patch("user-context", (tree, props) => {
            const userId = props.user?.id;
            if (!userId || userId === this.UserStore?.getCurrentUser()?.id) return;

            const children = tree?.props?.children;
            if (!Array.isArray(children)) return;

            const isPriority = this.priorityUsers.has(userId);
            children.push(
                BdApi.ContextMenu.buildItem({ type: "separator" }),
                BdApi.ContextMenu.buildItem({
                    type: "toggle",
                    label: "Priority DM",
                    checked: isPriority,
                    action: () => {
                        if (isPriority) this.priorityUsers.delete(userId);
                        else this.priorityUsers.add(userId);
                        this.saveSettings();
                    }
                })
            );
        });
    }

    onMessage(event) {
        const { message } = event;
        if (!message?.author || event.optimistic) return;

        const currentUser = this.UserStore?.getCurrentUser();
        if (!currentUser || message.author.id === currentUser.id) return;

        const channel = this.ChannelStore?.getChannel(message.channel_id);
        if (!channel || (channel.type !== 1 && channel.type !== 3)) return;

        if (this.PresenceStore?.getStatus(currentUser.id) !== "dnd") return;
        if (!this.priorityUsers.has(message.author.id)) return;

        this.notify(message, channel);
    }

    notify(message, channel) {
        const now = Date.now();
        if (now - this.lastPing < 1000) return;
        this.lastPing = now;

        if (!this.NotificationModule?.showNotification) return;

        const author = message.author;
        const avatar = author.avatar
            ? `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png`
            : `https://cdn.discordapp.com/embed/avatars/${(BigInt(author.id) >> 22n) % 6n}.png`;

        this.NotificationModule.showNotification(
            avatar,
            author.globalName,
            message.content,
            { message, channel },
            { overrideStreamerMode: true, sound: "message1", volume: 0.4 }
        );
    }
};
