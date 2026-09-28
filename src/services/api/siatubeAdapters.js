function firstNonEmpty(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "") ?? "";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeLocale(locale) {
  return String(locale || "ja").replace("_", "-").toLowerCase();
}

function localeMatches(code, locale) {
  const normalizedCode = normalizeLocale(code);
  const normalizedLocale = normalizeLocale(locale);
  return normalizedCode === normalizedLocale ||
    normalizedCode.split("-")[0] === normalizedLocale.split("-")[0];
}

function thumbnailSet(thumbnails, fallback = "") {
  const list = asArray(thumbnails).filter((item) => item && item.url);
  const sorted = list.slice().sort((a, b) => (Number(a.width) || 0) - (Number(b.width) || 0));
  const medium = sorted.find((item) => (Number(item.width) || 0) >= 320) || sorted.at(-1);
  const standard = sorted.at(-1) || medium;
  const defaultValue = sorted[0] || medium || standard;
  const fallbackItem = fallback ? { url: fallback } : undefined;

  return {
    default: defaultValue || fallbackItem,
    medium: medium || fallbackItem,
    standard: standard || fallbackItem,
  };
}

export function normalizeSearchItem(item) {
  if (!item || typeof item !== "object") return null;

  if (item.type === "channel") {
    const icon = asArray(item.channelIcons).find((entry) => entry?.url)?.url || "";
    return {
      type: "channel",
      id: item.channelId || "",
      channelId: item.channelId || "",
      channel: item.channelName || "",
      name: item.channelName || "",
      channelIcon: icon,
      icon,
      subscriberCount: item.subscriberCount || "",
      videoCount: item.videoCount || "",
      description: item.description || "",
      handle: item.handle || "",
      badges: asArray(item.badges),
    };
  }

  const videoId = item.videoId || "";
  const channelIcon = asArray(item.channelIcons).find((entry) => entry?.url)?.url || "";
  const rawViews = String(item.viewCounts?.raw || "").replace(/[^0-9]/g, "");
  const numericViews = rawViews ? Number(rawViews) : 0;

  return {
    type: item.type === "playlist" ? "playlist" : "video",
    id: videoId,
    videoId,
    playlistId: item.playlistId || "",
    title: item.title || "",
    thumbnails: thumbnailSet(
      item.thumbnails,
      videoId ? `https://i.ytimg.com/vi/${videoId}/sddefault.jpg` : ""
    ),
    duration: item.duration || "",
    badges: asArray(item.badges),
    channelId: item.channelId || "",
    channel: item.channelName || "",
    channelIcon,
    viewCount: Number.isFinite(numericViews) ? numericViews : 0,
    viewCountText: firstNonEmpty(item.viewCounts?.short, item.viewCounts?.full),
    publishedAt: item.publishedTime || "",
  };
}

export function normalizeSearchItems(items) {
  return asArray(items).map(normalizeSearchItem).filter((item) => item?.id);
}

export function normalizeComment(comment, fallbackIndex = 0) {
  const likes = comment?.likes;
  const replies = comment?.replies;
  return {
    id: comment?.commentId || comment?.id || `comment-${fallbackIndex}`,
    author: comment?.author?.name || comment?.author || "匿名",
    authorId: comment?.author?.channelId || "",
    authorIcon: comment?.author?.avatar || comment?.authorIcon || null,
    text: comment?.text || "",
    date: comment?.publishedTime || comment?.date || "",
    likes: firstNonEmpty(likes?.text, likes?.count, likes, 0),
    replyCount: Number(replies?.count ?? replies ?? 0) || 0,
    replyContinuation: comment?.replyContinuation || null,
    replies: [],
    repliesNextContinuation: null,
    repliesLoaded: false,
    repliesExpanded: false,
    repliesLoading: false,
    repliesError: "",
    isExpanded: false,
    isClamped: false,
  };
}

export function normalizePlaylistItem(item) {
  if (!item || typeof item !== "object") return null;
  return {
    ...item,
    videoId: item.videoId || "",
    title: item.title || "",
    duration: item.duration || "",
    published: item.published || "",
    author: item.author || "",
    views: firstNonEmpty(item.views, item.viewCount),
    viewCount: firstNonEmpty(item.viewCount, item.views),
    thumbnail: item.thumbnail || "",
    icon: item.icon || "",
  };
}

function normalizeChannelAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") return null;
  return {
    ...attachment,
    type: attachment.type || "unknown",
    videoId: attachment.videoId || "",
    title: attachment.title || "",
    images: asArray(attachment.images).filter(Boolean),
    choices: asArray(attachment.choices).filter(Boolean),
    totalVotes: attachment.totalVotes || "",
  };
}

function normalizeChannelItem(item) {
  if (!item || typeof item !== "object") return null;

  const type = item.type || (item.postId ? "post" : item.playlistId ? "playlist" : "video");
  const normalized = {
    ...item,
    type,
    contentType: item.contentType || "",
    videoId: item.videoId || "",
    playlistId: item.playlistId || "",
    postId: item.postId || "",
    title: item.title || "",
    text: item.text || "",
    duration: item.duration || "",
    published: item.published || "",
    author: item.author || "",
    authorId: item.authorId || "",
    viewCount: firstNonEmpty(item.viewCount, item.views),
    videoCount: item.videoCount || "",
    voteCount: item.voteCount || "",
    commentCount: item.commentCount || "",
    description: item.description || "",
    thumbnail: item.thumbnail || "",
    thumbnailUrl: item.thumbnailUrl || "",
    icon: item.icon || "",
    iconUrl: item.iconUrl || "",
    url: item.url || "",
    isLive: item.isLive === true,
    isUpcoming: item.isUpcoming === true,
    streamStatus: item.streamStatus || "",
    badges: asArray(item.badges).filter(Boolean),
    metadataRows: asArray(item.metadataRows)
      .map((row) => asArray(row).filter(Boolean))
      .filter((row) => row.length),
    attachment: normalizeChannelAttachment(item.attachment),
  };

  return normalized;
}

function validChannelItem(item) {
  return Boolean(
    item &&
      (item.videoId || item.playlistId || item.postId || item.title || item.text)
  );
}

function normalizeChannelItems(items) {
  return asArray(items)
    .map(normalizeChannelItem)
    .filter(validChannelItem);
}

export function normalizePlaylist(data, requestedId = "") {
  if (!data || typeof data !== "object") return null;
  return {
    ...data,
    requestedPlaylistId: requestedId || data.requestedPlaylistId || data.playlistId || "",
    items: asArray(data.items).map(normalizePlaylistItem).filter((item) => item?.videoId),
    nextToken: data.nextToken || null,
  };
}

export function normalizeChannel(data) {
  if (!data || typeof data !== "object") return null;

  const playlists = asArray(data.playlists).map((playlist) => ({
    ...playlist,
    title: playlist?.title || "",
    type: playlist?.type || "videos",
    browseId: playlist?.browseId || "",
    playlistId: playlist?.playlistId || "",
    items: normalizeChannelItems(playlist?.items),
  }));

  const sections = asArray(data.sections).length
    ? asArray(data.sections).map((section) => ({
        ...section,
        title: section?.title || "コンテンツ",
        type: section?.type || "mixed",
        browseId: section?.browseId || "",
        playlistId: section?.playlistId || "",
        items: normalizeChannelItems(section?.items),
      }))
    : playlists.map((playlist) => ({ ...playlist }));

  return {
    ...data,
    channelId: data.channelId || "",
    title: data.title || "",
    avatar: data.avatar || "",
    banner: data.banner || "",
    videoCount: data.videoCount || "",
    description: data.description || "",
    uploadsPlaylistId: data.uploadsPlaylistId || "",
    topVideo: normalizeChannelItem(data.topVideo),
    playlists,
    sections,
    posts: normalizeChannelItems(data.posts),
    live: normalizeChannelItems(data.live),
    shorts: normalizeChannelItems(data.shorts),
  };
}

function languageEntryScore(entry, locale, preferredCode = "") {
  const language = entry?.value?.language || {};
  const code = entry?.key || language.code || "";
  let score = Number(language.preference) || 0;
  if (preferredCode && localeMatches(code, preferredCode)) score += 2000;
  if (language.isDefault) score += 1000;
  if (language.isOriginal) score += 900;
  if (localeMatches(code, locale)) score += 700;
  if (localeMatches(code, "ja")) score += 500;
  if (code === "und") score += 100;
  if (language.isDrc) score -= 20;
  return score;
}

function selectLanguageEntry(groups, locale = "ja", preferredCode = "") {
  const entries = Object.entries(groups || {}).map(([key, value]) => ({ key, value }));
  entries.sort((a, b) => languageEntryScore(b, locale, preferredCode) - languageEntryScore(a, locale, preferredCode));
  return entries[0] || null;
}

function streamMimeType(stream, hasVideo, hasAudio, isM3u8) {
  if (isM3u8) return "application/vnd.apple.mpegurl";

  const ext = String(stream?.ext || stream?.videoExt || stream?.audioExt || "").toLowerCase();
  let base;
  if (hasVideo) {
    base = ext === "webm" ? "video/webm" : "video/mp4";
  } else if (ext === "webm") {
    base = "audio/webm";
  } else if (ext === "mp3") {
    base = "audio/mpeg";
  } else if (ext === "aac") {
    base = "audio/aac";
  } else {
    base = "audio/mp4";
  }

  const codecs = [];
  if (hasVideo && stream?.vcodec && stream.vcodec !== "none") codecs.push(stream.vcodec);
  if (hasAudio && stream?.acodec && stream.acodec !== "none") codecs.push(stream.acodec);
  return codecs.length ? `${base}; codecs="${codecs.join(", ")}"` : base;
}

export function normalizeStreamFormat(stream) {
  if (!stream || typeof stream !== "object") return null;
  const url = stream.streamUrl || stream.url || "";
  if (!url || stream.hasDrm) return null;

  const isM3u8 = Boolean(stream.isM3u8) || String(stream.protocol || "").startsWith("m3u8") ||
    /mpegurl/i.test(stream.mimeType || "") || /\.m3u8(?:[?#]|$)/i.test(url);
  const hasVideo = stream.mediaType !== "audio_only" &&
    (stream.hasVideo ?? Boolean(stream.mediaType === "muxed" || stream.mediaType === "video_only" ||
      (stream.vcodec && stream.vcodec !== "none") || stream.width || stream.height));
  const hasAudio = stream.mediaType !== "video_only" &&
    (stream.hasAudio ?? Boolean((stream.acodec && stream.acodec !== "none") ||
      stream.mediaType === "audio_only" || stream.mediaType === "muxed" || isM3u8));

  return {
    ...stream,
    url,
    itag: stream.formatId || stream.itag || "",
    hasVideo,
    hasAudio,
    isM3u8,
    resolution: stream.resolution || (stream.height ? `0x${stream.height}` : "audio only"),
    mimeType: stream.mimeType || streamMimeType(stream, hasVideo, hasAudio, isM3u8),
  };
}

function uniqueStreams(streams) {
  const seen = new Set();
  return streams.filter((stream) => {
    if (!stream?.url || seen.has(stream.url)) return false;
    seen.add(stream.url);
    return true;
  });
}

export function normalizeStreamFormats(data, locale = "ja") {
  const audioEntry = selectLanguageEntry(data?.streams?.audioByLanguage, locale);
  const audioCode = audioEntry?.key || "";
  const hlsEntry = selectLanguageEntry(data?.m3u8?.byLanguage, locale, audioCode);
  const languageHls = asArray(hlsEntry?.value?.streams);
  const hlsStreams = languageHls.length ? languageHls : asArray(data?.m3u8?.list);

  const streams = [
    ...asArray(data?.streams?.muxed),
    ...asArray(data?.streams?.videoOnly),
    ...asArray(audioEntry?.value?.streams),
    ...hlsStreams,
  ].map(normalizeStreamFormat).filter(Boolean);

  return uniqueStreams(streams);
}

function captionTrack(entry, isAutomatic) {
  const captions = asArray(entry?.value?.captions);
  const caption = captions.find((item) => item?.ext === "vtt" && item.url);
  if (!caption || entry.key === "live_chat") return null;
  const language = entry.value?.language || caption.language || {};
  return {
    src: caption.url,
    srclang: language.code || entry.key || "ja",
    label: `${language.name || caption.name || entry.key}${isAutomatic ? "（自動生成）" : ""}`,
    kind: "subtitles",
    default: false,
    automatic: isAutomatic,
  };
}

export function extractSubtitleTracks(data, locale = "ja") {
  const manualEntries = Object.entries(data?.subtitles?.manualByLanguage || {})
    .map(([key, value]) => ({ key, value }));
  const automaticEntries = Object.entries(data?.subtitles?.automaticByLanguage || {})
    .map(([key, value]) => ({ key, value }));

  const manual = manualEntries.map((entry) => captionTrack(entry, false)).filter(Boolean);
  const existingCodes = new Set(manual.map((track) => normalizeLocale(track.srclang)));
  automaticEntries.sort((a, b) => languageEntryScore(b, locale) - languageEntryScore(a, locale));
  const automatic = automaticEntries
    .map((entry) => captionTrack(entry, true))
    .filter((track) => {
      if (!track) return false;
      const code = normalizeLocale(track.srclang);
      if (existingCodes.has(code)) return false;
      existingCodes.add(code);
      return true;
    });

  return [...manual, ...automatic];
}

export function primaryPlayableStream(data, locale = "ja") {
  const muxed = asArray(data?.streams?.muxed)
    .map(normalizeStreamFormat)
    .filter(Boolean)
    .sort((a, b) => {
      const aMp4 = String(a.ext).toLowerCase() === "mp4" ? 1 : 0;
      const bMp4 = String(b.ext).toLowerCase() === "mp4" ? 1 : 0;
      return bMp4 - aMp4 || (Number(b.height) || 0) - (Number(a.height) || 0);
    });
  if (muxed[0]) return muxed[0];

  const audioEntry = selectLanguageEntry(data?.streams?.audioByLanguage, locale);
  const hlsEntry = selectLanguageEntry(data?.m3u8?.byLanguage, locale, audioEntry?.key || "");
  const languageHls = asArray(hlsEntry?.value?.streams);
  const hlsStreams = languageHls.length ? languageHls : asArray(data?.m3u8?.list);
  return hlsStreams.map(normalizeStreamFormat).find(Boolean) || null;
}

export function normalizeDownloadStreams(data) {
  const muxed = uniqueStreams(asArray(data?.streams?.muxed).map(normalizeStreamFormat).filter(Boolean));
  const audio = uniqueStreams(
    Object.values(data?.streams?.audioByLanguage || {})
      .flatMap((entry) => asArray(entry?.streams))
      .map(normalizeStreamFormat)
      .filter(Boolean)
  );
  const video = uniqueStreams(asArray(data?.streams?.videoOnly).map(normalizeStreamFormat).filter(Boolean));
  const hls = uniqueStreams(asArray(data?.m3u8?.list).map(normalizeStreamFormat).filter(Boolean));
  return { muxed, audio, video, hls };
}
