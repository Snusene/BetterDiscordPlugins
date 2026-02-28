/**
 * @name TwitchPreview
 * @author Snues
 * @authorId 98862725609816064
 * @description Improved previews for Twitch channel links.
 * @version 3.0.0
 * @website https://github.com/Snusene/BetterDiscordPlugins/tree/main/TwitchPreview
 * @source https://raw.githubusercontent.com/Snusene/BetterDiscordPlugins/main/TwitchPreview/TwitchPreview.plugin.js
 */

const { React } = BdApi;
const e = React.createElement;

const STYLES = `
  .twitch-embed { border-inline-start-color: #9146ff !important; max-width: 432px; }
  .twitch-embed-title {
    display: -webkit-box !important; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .twitch-live-badge {
    position: absolute; top: 10px; left: 10px; background: #eb0400;
    color: white; padding: 0 5px; border-radius: 4px; font-size: 13px;
    font-weight: 600; z-index: 2; line-height: 20px;
    font-family: "Roobert", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
  }
  .twitch-playing .twitch-live-badge { display: none; }
`;

const CHANNEL_RE = /twitch\.tv\/([a-zA-Z0-9_]+)\/?$/i;
const CLIP_RE = /twitch\.tv\/\w+\/(clip|video|videos|clips)/i;

const icon = (cls, d, transform) =>
  e(
    "svg",
    {
      className: cls,
      width: 16,
      height: 16,
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": true,
      role: "img",
    },
    e("path", { fill: "currentColor", d, transform }),
  );

const PLAY_D =
  "M9.25 3.35C7.87 2.45 6 3.38 6 4.96v14.08c0 1.58 1.87 2.5 3.25 1.61l10.85-7.04a1.9 1.9 0 0 0 0-3.22L9.25 3.35Z";
const LINK_D =
  "M16 0H2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4v-2H2V4h14v10h-4v2h4c1.1 0 2-.9 2-2V2a2 2 0 0 0-2-2zM9 6l-4 4h3v6h2v-6h3L9 6z";

module.exports = class TwitchPreview {
  start() {
    BdApi.DOM.addStyle("TwitchPreview", STYLES);
    const emb = BdApi.Webpack.getByKeys("embedFull", "embedVideoActions");
    const ico = BdApi.Webpack.getByKeys("iconWrapper", "iconWrapperActive");
    const anc = BdApi.Webpack.getByKeys("anchor", "anchorUnderlineOnHover");
    const mkp = BdApi.Webpack.getModule(
      (m) =>
        m.markup && typeof m.markup === "string" && m.markup.includes("markup"),
    );
    this.cls = { emb, ico, anc, mkp };
    this.cache = new Map();
    this.patchEmbeds();
  }

  stop() {
    BdApi.DOM.removeStyle("TwitchPreview");
    BdApi.Patcher.unpatchAll("TwitchPreview");
    this.cache.clear();
    this.cache = null;
    this.cls = null;
  }

  patchEmbeds() {
    const Acc = BdApi.Webpack.getModule((m) => m?.prototype?.renderEmbeds, {
      searchExports: true,
    });
    BdApi.Patcher.after(
      "TwitchPreview",
      Acc.prototype,
      "renderEmbeds",
      (_, __, res) => {
        const isWrapped =
          res && !Array.isArray(res) && Array.isArray(res.props?.children);
        const source = isWrapped ? res.props.children : res;
        if (!Array.isArray(source)) return res;

        const embeds = [...source];
        let modified = false;

        for (let i = 0; i < embeds.length; i++) {
          const embed =
            embeds[i]?.props?.children?.props?.embed || embeds[i]?.props?.embed;
          if (!embed?.url || CLIP_RE.test(embed.url)) continue;
          const match = embed.url.match(CHANNEL_RE);
          if (!match) continue;
          modified = true;
          embeds[i] = e(this.Embed, {
            channel: match[1].toLowerCase(),
            fallback: embeds[i],
            key: `tw-${i}`,
          });
        }

        if (!modified) return res;
        return isWrapped ? React.cloneElement(res, {}, embeds) : embeds;
      },
    );
  }

  Embed = ({ channel, fallback }) => {
    const [playing, setPlaying] = React.useState(false);
    const [info, setInfo] = React.useState(this.cache.get(channel));

    React.useEffect(() => {
      if (!this.cache?.has(channel))
        this.fetchChannel(channel).then((i) => {
          this.cache?.set(channel, i);
          setInfo(i);
        });
    }, [channel]);

    if (info === undefined) return null;
    if (info === null) return fallback;

    const title = info.streamTitle
      ? `${info.displayName} - ${info.streamTitle}`
      : info.displayName;
    const url = `https://twitch.tv/${channel}`;
    const thumb = info.isLive
      ? `https://static-cdn.jtvnw.net/previews-ttv/live_user_${channel}-640x360.jpg?t=${Math.floor(Date.now() / 300000)}`
      : info.offlineImage || info.bannerImage || info.profileImage;
    if (!this.cls) return fallback;
    const { emb, ico, anc, mkp } = this.cls;

    return e(
      "article",
      {
        className: `twitch-embed${playing ? " twitch-playing" : ""} ${emb.embedFull} ${mkp.markup} ${emb.justifyAuto}`,
      },
      e(
        "div",
        { className: emb.gridContainer },
        e(
          "div",
          { className: emb.grid },
          e(
            "div",
            { className: `${emb.embedProvider} ${emb.embedMargin}` },
            e("span", null, "Twitch"),
          ),
          e(
            "div",
            { className: `${emb.embedTitle} ${emb.embedMargin}` },
            e(
              "a",
              {
                className: `${anc.anchor} ${anc.anchorUnderlineOnHover} ${emb.embedTitleLink} twitch-embed-title`,
                href: url,
                target: "_blank",
                rel: "noreferrer noopener",
              },
              title,
            ),
          ),
          e(
            "div",
            {
              className: `${emb.embedVideo} ${emb.embedMedia}`,
              style: { aspectRatio: "16/9", background: "#18181b" },
            },
            playing
              ? e("iframe", {
                  className: emb.embedIframe,
                  src: `https://player.twitch.tv/?channel=${channel}&parent=discord.com&autoplay=true`,
                  allow: "autoplay; fullscreen",
                })
              : thumb
                ? e(
                    "div",
                    { className: emb.embedVideoImageComponent },
                    e("img", {
                      className: emb.embedVideoImageComponentInner,
                      src: thumb,
                    }),
                  )
                : null,
            !playing &&
              e(
                "div",
                { className: emb.embedVideoActions },
                e(
                  "div",
                  { className: emb.centerContent },
                  e(
                    "div",
                    { className: ico.wrapper },
                    e(
                      "div",
                      {
                        className: ico.iconWrapperActive,
                        tabIndex: 0,
                        role: "button",
                        "aria-label": "Play",
                        onClick: (ev) => {
                          ev.stopPropagation();
                          ev.preventDefault();
                          setPlaying(true);
                        },
                      },
                      icon(ico.iconPlay, PLAY_D),
                    ),
                    e(
                      "a",
                      {
                        className: `${anc.anchor} ${anc.anchorUnderlineOnHover} ${ico.iconWrapperActive}`,
                        href: url,
                        target: "_blank",
                        rel: "noreferrer noopener",
                        tabIndex: 0,
                        role: "button",
                        onClick: (ev) => ev.stopPropagation(),
                      },
                      icon(ico.iconExternalMargins, LINK_D, "translate(3,4)"),
                    ),
                  ),
                ),
              ),
            info.isLive
              ? e("div", { className: "twitch-live-badge" }, "LIVE")
              : null,
          ),
        ),
      ),
    );
  };

  async fetchChannel(channel) {
    try {
      const res = await BdApi.Net.fetch("https://gql.twitch.tv/gql", {
        method: "POST",
        headers: {
          "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `query { user(login: "${channel}") { displayName stream { title } offlineImageURL bannerImageURL profileImageURL(width: 600) } }`,
        }),
      });
      const user = (await res.json()).data?.user;
      if (!user) return null;
      return {
        isLive: !!user.stream,
        displayName: user.displayName,
        streamTitle: user.stream?.title,
        offlineImage: user.offlineImageURL,
        bannerImage: user.bannerImageURL,
        profileImage: user.profileImageURL,
      };
    } catch {
      return null;
    }
  }
};
