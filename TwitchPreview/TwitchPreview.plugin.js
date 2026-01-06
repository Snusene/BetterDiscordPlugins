/**
 * @name TwitchPreview
 * @author Snues
 * @authorId 98862725609816064
 * @description Improved previews for Twitch channel links.
 * @version 2.1.2
 * @website https://github.com/Snusene/BetterDiscordPlugins/tree/main/TwitchPreview
 * @source https://raw.githubusercontent.com/Snusene/BetterDiscordPlugins/main/TwitchPreview/TwitchPreview.plugin.js
 */

module.exports = class TwitchPreview {
    start() {
        BdApi.DOM.addStyle("TwitchPreview", this.css);

        this.embedClasses = BdApi.Webpack.getByKeys("embedVideo", "embedVideoActions");
        this.embedWrapperClasses = BdApi.Webpack.getByKeys("embedFull", "embedMargin");
        this.iconClasses = BdApi.Webpack.getByKeys("iconWrapper", "iconWrapperActive");
        this.anchorClasses = BdApi.Webpack.getByKeys("anchor", "anchorUnderlineOnHover");

        this.buildComponents();
        this.patchEmbeds();
    }

    stop() {
        BdApi.DOM.removeStyle("TwitchPreview");
        BdApi.Patcher.unpatchAll("TwitchPreview");
    }

    get css() {
        return `
            .twitch-embed {
                width: 100%;
                max-width: 432px;
                border-left: 4px solid #9146ff;
                border-radius: 4px;
                padding: 8px 16px 16px 12px;
                display: flex;
                flex-direction: column;
                box-sizing: border-box;
            }
            .twitch-embed-provider {
                color: var(--primary-360);
                font-size: 12px;
                font-weight: 400;
            }
            .twitch-embed .twitch-combined-title {
                color: var(--text-link); /* still works */
                font-size: 16px;
                font-weight: 600;
                line-height: 1.25;
                cursor: pointer;
                margin-top: 8px;
            }
            .twitch-embed .twitch-combined-title:hover {
                text-decoration: underline;
            }
            .twitch-embed .twitch-video-wrapper {
                position: relative;
                width: 100%;
                max-width: 400px;
                aspect-ratio: 16/9;
                border-radius: 4px;
                overflow: hidden;
                background: #18181b;
                margin-top: 16px;
            }
            .twitch-embed .twitch-video-wrapper img,
            .twitch-embed .twitch-video-wrapper iframe {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                border: none;
                object-fit: cover;
            }
            .twitch-embed .twitch-live-badge {
                position: absolute;
                top: 10px;
                left: 10px;
                background: #eb0400;
                color: white;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 12px;
                font-weight: 600;
                z-index: 1;
            }
        `;
    }

    patchEmbeds() {
        const MessageAccessories = BdApi.Webpack.getModule(
            m => m?.prototype?.renderEmbeds,
            {searchExports: true}
        );

        if (!MessageAccessories) return;

        const self = this;

        BdApi.Patcher.after("TwitchPreview", MessageAccessories.prototype, "renderEmbeds", (thisObj, _, res) => {
            if (!res || !Array.isArray(res)) return res;

            const embeds = [...res];

            for (let i = 0; i < embeds.length; i++) {
                const embed = embeds[i]?.props?.children?.props?.embed || embeds[i]?.props?.embed;
                if (!embed?.url) continue;

                if (/twitch\.tv\/\w+\/(clip|video|videos|clips)/i.test(embed.url)) continue;

                const match = embed.url.match(/twitch\.tv\/([a-zA-Z0-9_]+)\/?$/i);
                if (!match) continue;

                const channel = match[1].toLowerCase();

                embeds[i] = BdApi.React.createElement(self.TwitchEmbed, {
                    channel,
                    originalEmbed: embeds[i],
                    key: `twitch-${channel}-${i}`
                });
            }

            return embeds;
        });
    }

    buildComponents() {
        const self = this;
        const React = BdApi.React;
        const e = React.createElement;
        const embedClasses = this.embedClasses;
        const embedWrapperClasses = this.embedWrapperClasses;
        const iconClasses = this.iconClasses;
        const anchorClasses = this.anchorClasses;

        this.TwitchEmbed = function TwitchEmbed({ channel, originalEmbed }) {
            const [isPlaying, setIsPlaying] = React.useState(false);
            const [channelInfo, setChannelInfo] = React.useState();

            React.useEffect(() => {
                self.getChannelInfo(channel).then(setChannelInfo);
            }, [channel]);

            if (channelInfo === undefined) return null;
            if (channelInfo === null) return originalEmbed;

            const title = channelInfo.streamTitle
                ? `${channelInfo.displayName} - ${channelInfo.streamTitle}`
                : channelInfo.displayName;
            const isLive = channelInfo.isLive;
            const imageSrc = isLive
                ? `https://static-cdn.jtvnw.net/previews-ttv/live_user_${channel}-640x360.jpg?t=${Date.now()}`
                : channelInfo.offlineImage || channelInfo.bannerImage || channelInfo.profileImage;

            if (isPlaying) {
                return e('article', { className: `twitch-embed ${embedWrapperClasses.embedFull}` },
                    e('div', { className: 'twitch-embed-provider' }, 'Twitch'),
                    e('div', {
                        className: 'twitch-combined-title',
                        onClick: () => window.open(`https://twitch.tv/${channel}`, '_blank')
                    }, title),
                    e('div', { className: 'twitch-video-wrapper' },
                        e('iframe', {
                            src: `https://player.twitch.tv/?channel=${channel}&parent=discord.com&autoplay=true`,
                            allow: 'autoplay; fullscreen'
                        })
                    )
                );
            }

            return e('article', { className: `twitch-embed ${embedWrapperClasses.embedFull}` },
                e('div', { className: 'twitch-embed-provider' }, 'Twitch'),
                e('div', {
                    className: 'twitch-combined-title',
                    onClick: () => window.open(`https://twitch.tv/${channel}`, '_blank')
                }, title),
                e('div', { className: 'twitch-video-wrapper' },
                    imageSrc ? e('img', { src: imageSrc }) : null,
                    e('div', { className: embedClasses.embedVideoActions },
                        e('div', { className: embedClasses.centerContent },
                            e('div', { className: iconClasses.wrapper },
                                e('div', {
                                    className: `${iconClasses.iconWrapperActive} ${iconClasses.iconWrapper}`,
                                    tabIndex: 0,
                                    role: 'button',
                                    'aria-label': 'Play',
                                    onClick: (ev) => { ev.stopPropagation(); ev.preventDefault(); setIsPlaying(true); }
                                },
                                    e('svg', {
                                        className: `${iconClasses.iconPlay} ${iconClasses.icon}`,
                                        'aria-hidden': true,
                                        role: 'img',
                                        xmlns: 'http://www.w3.org/2000/svg',
                                        width: 16,
                                        height: 16,
                                        fill: 'none',
                                        viewBox: '0 0 24 24'
                                    },
                                        e('path', { fill: 'currentColor', d: 'M9.25 3.35C7.87 2.45 6 3.38 6 4.96v14.08c0 1.58 1.87 2.5 3.25 1.61l10.85-7.04a1.9 1.9 0 0 0 0-3.22L9.25 3.35Z' })
                                    )
                                ),
                                e('a', {
                                    className: `${anchorClasses.anchor} ${anchorClasses.anchorUnderlineOnHover} ${iconClasses.iconWrapperActive} ${iconClasses.iconWrapper}`,
                                    href: `https://twitch.tv/${channel}`,
                                    target: '_blank',
                                    rel: 'noreferrer noopener',
                                    tabIndex: 0,
                                    role: 'button',
                                    onClick: (ev) => ev.stopPropagation()
                                },
                                    e('svg', {
                                        'aria-label': 'Open Link',
                                        className: `${iconClasses.iconExternalMargins} ${iconClasses.icon}`,
                                        'aria-hidden': false,
                                        role: 'img',
                                        width: 16,
                                        height: 16,
                                        viewBox: '0 0 24 24'
                                    },
                                        e('path', { fill: 'currentColor', transform: 'translate(3.000000, 4.000000)', d: 'M16 0H2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4v-2H2V4h14v10h-4v2h4c1.1 0 2-.9 2-2V2a2 2 0 0 0-2-2zM9 6l-4 4h3v6h2v-6h3L9 6z' })
                                    )
                                )
                            )
                        )
                    ),
                    isLive ? e('div', { className: 'twitch-live-badge' }, 'LIVE') : null
                )
            );
        };
    }

    async getChannelInfo(channel) {
        try {
            const response = await fetch('https://gql.twitch.tv/gql', {
                method: 'POST',
                headers: { 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: `query { user(login: "${channel}") { displayName stream { title } offlineImageURL bannerImageURL profileImageURL(width: 600) } }`
                })
            });
            const data = await response.json();
            const user = data.data?.user;
            if (!user) return null;
            return {
                isLive: !!user.stream,
                displayName: user.displayName,
                streamTitle: user.stream?.title,
                offlineImage: user.offlineImageURL,
                bannerImage: user.bannerImageURL,
                profileImage: user.profileImageURL
            };
        } catch {
            return null;
        }
    }
};
