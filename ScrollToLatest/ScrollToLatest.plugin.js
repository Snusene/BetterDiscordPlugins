/**
 * @name ScrollToLatest
 * @author Snues
 * @authorId 98862725609816064
 * @description Scroll to the last message when entering a channel.
 * @version 1.0.4
 * @invite xp2f3YFKMY
 * @source https://github.com/Snusene/BetterDiscordPlugins/tree/main/ScrollToLatest
 * @donate https://ko-fi.com/snues
 */

module.exports = class ScrollToLatest {
  start() {
    this.Dispatcher = BdApi.Webpack.Stores.UserStore._dispatcher;
    this.AckUtils = BdApi.Webpack.getByKeys("ack");
    this.ReadStateStore = BdApi.Webpack.getStore("ReadStateStore");
    this.lastChannelId = null;

    this.onSwitch = this.onSwitch.bind(this);
    this.Dispatcher.subscribe("CHANNEL_SELECT", this.onSwitch);
  }

  stop() {
    this.Dispatcher.unsubscribe("CHANNEL_SELECT", this.onSwitch);
  }

  onSwitch(event) {
    const channelId = event?.channelId;
    if (!channelId || channelId === this.lastChannelId) return;

    this.lastChannelId = channelId;
    const lastId = this.ReadStateStore?.lastMessageId(channelId);
    this.AckUtils.ack(channelId, undefined, true, true, lastId);
    this.Dispatcher.dispatch({ type: "CHANNEL_LOCAL_ACK", channelId });
  }
};
