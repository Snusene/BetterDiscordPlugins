/**
 * @name ScrollToLatest
 * @author Snues
 * @authorId 98862725609816064
 * @description Auto marks channels as read when you enter them so that it scrolls to the last message.
 * @version 1.0.0
 * @website https://github.com/Snusene/BetterDiscordPlugins/tree/main/ScrollToLatest
 * @source https://raw.githubusercontent.com/Snusene/BetterDiscordPlugins/main/ScrollToLatest/ScrollToLatest.plugin.js
 */

module.exports = class ScrollToLatest {
    start() {
        this.Dispatcher = BdApi.Webpack.getByKeys("dispatch", "subscribe");
        this.AckUtils = BdApi.Webpack.getByKeys("ack");
        this.lastChannelId = null;

        this.onSwitch = this.onSwitch.bind(this);
        this.Dispatcher?.subscribe("CHANNEL_SELECT", this.onSwitch);
    }

    stop() {
        this.Dispatcher?.unsubscribe("CHANNEL_SELECT", this.onSwitch);
    }

    onSwitch(event) {
        const channelId = event?.channelId;
        if (!channelId || channelId === this.lastChannelId) return;

        this.lastChannelId = channelId;
        this.AckUtils?.ack?.(channelId);
    }
};
