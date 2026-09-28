import test from "node:test";
import assert from "node:assert/strict";

import {
  extractSubtitleTracks,
  normalizeChannel,
  normalizeComment,
  normalizePlaylist,
  normalizeSearchItems,
  normalizeStreamFormats,
  normalizeStreamFormat,
  primaryPlayableStream,
} from "../src/services/api/siatubeAdapters.js";
import { selectPlaybackSubtitleTracks } from "../src/utils/player/subtitleTracks.js";

test("stream normalization preserves declared tracks and MIME without codec fields", () => {
  const normalized = normalizeStreamFormat({
    streamUrl: "https://media.example/video", resolution: "1280x720",
    hasVideo: true, hasAudio: true, mimeType: "video/webm",
  });
  assert.equal(normalized.hasVideo, true);
  assert.equal(normalized.hasAudio, true);
  assert.equal(normalized.mimeType, "video/webm");
  assert.equal(normalizeStreamFormat({ url: "https://media.example/master.m3u8?token=123" }).isM3u8, true);
});

test("search responses normalize videos, shorts, playlists, and channels", () => {
  const items = normalizeSearchItems([
    { type: "shorts", videoId: "abcdefghijk", title: "Short", viewCounts: { raw: "1,234" } },
    { type: "playlist", videoId: "lmnopqrstuv", playlistId: "PL123", title: "List" },
    { type: "channel", channelId: "UC123", channelName: "Channel", subscriberCount: "10万人" },
  ]);

  assert.deepEqual(items.map((item) => item.type), ["video", "playlist", "channel"]);
  assert.equal(items[0].viewCount, 1234);
  assert.equal(items[1].playlistId, "PL123");
  assert.equal(items[2].id, "UC123");
});

test("comment and playlist response fields map to the existing UI shape", () => {
  const comment = normalizeComment({
    commentId: "comment-1",
    text: "本文",
    author: { name: "User", avatar: "avatar" },
    likes: { text: "26万", count: 260000 },
    replies: { count: 3 },
    replyContinuation: "next-replies",
  });
  assert.equal(comment.author, "User");
  assert.equal(comment.likes, "26万");
  assert.equal(comment.replyCount, 3);

  const playlist = normalizePlaylist({
    playlistId: "RD123",
    items: [{ videoId: "abcdefghijk", title: "Video", views: "1万回視聴" }],
  }, "RD123");
  assert.equal(playlist.items[0].viewCount, "1万回視聴");
  assert.equal(playlist.requestedPlaylistId, "RD123");
});

test("channel normalization drops malformed empty video cards", () => {
  const channel = normalizeChannel({
    channelId: "UC123",
    playlists: [{
      playlistId: "PL123",
      items: [
        { videoId: "", title: "" },
        { videoId: "abcdefghijk", title: "Valid" },
      ],
    }],
  });
  assert.equal(channel.playlists[0].items.length, 1);
  assert.equal(channel.playlists[0].items[0].title, "Valid");
});

test("channel normalization preserves the expanded channel response", () => {
  const channel = normalizeChannel({
    channelId: "UC123",
    title: "Expanded channel",
    uploadsPlaylistId: "UU123",
    topVideo: {
      type: "video",
      videoId: "topvideo123",
      thumbnailUrl: "https://img.example/top.jpg",
      badges: ["4K"],
      metadataRows: [["1万回視聴", "1日前"]],
    },
    sections: [
      {
        title: "ライブ",
        type: "live",
        browseId: "VLPL_LIVE",
        playlistId: "PL_LIVE",
        items: [{
          type: "video",
          videoId: "livevideo12",
          isLive: true,
          streamStatus: "live",
          iconUrl: "https://img.example/icon.jpg",
        }],
      },
    ],
    posts: [{
      type: "post",
      postId: "post-1",
      text: "投票してください",
      voteCount: "20",
      commentCount: "3",
      attachment: {
        type: "poll",
        choices: ["A", "B"],
        images: ["https://img.example/post.jpg"],
        totalVotes: "100票",
      },
    }],
    shorts: [{ type: "short", videoId: "shortvideo1" }],
  });

  assert.equal(channel.sections[0].type, "live");
  assert.equal(channel.sections[0].items[0].isLive, true);
  assert.equal(channel.topVideo.badges[0], "4K");
  assert.deepEqual(channel.topVideo.metadataRows[0], ["1万回視聴", "1日前"]);
  assert.equal(channel.posts[0].attachment.type, "poll");
  assert.deepEqual(channel.posts[0].attachment.choices, ["A", "B"]);
  assert.equal(channel.shorts[0].type, "short");
});

test("channel normalization derives sections from the legacy playlists shape", () => {
  const channel = normalizeChannel({
    playlists: [{
      title: "アップロード",
      playlistId: "UU123",
      items: [{ videoId: "abcdefghijk", title: "Video" }],
    }],
  });

  assert.equal(channel.sections.length, 1);
  assert.equal(channel.sections[0].playlistId, "UU123");
  assert.equal(channel.sections[0].items[0].type, "video");
});

test("stream normalization supports muxed playback, HLS fallback, and VTT captions", () => {
  const data = {
    streams: {
      muxed: [{
        formatId: "18",
        ext: "mp4",
        resolution: "640x360",
        vcodec: "avc1.42001E",
        acodec: "mp4a.40.2",
        mediaType: "muxed",
        streamUrl: "https://media.example/muxed.mp4",
      }],
      videoOnly: [],
      audioByLanguage: {},
    },
    m3u8: {
      list: [{
        formatId: "hls",
        isM3u8: true,
        resolution: "1280x720",
        mediaType: "hls",
        streamUrl: "https://media.example/master.m3u8",
      }],
      byLanguage: {},
    },
    subtitles: {
      manualByLanguage: {},
      automaticByLanguage: {
        ja: {
          language: { code: "ja", name: "日本語" },
          captions: [{ ext: "vtt", url: "https://media.example/ja.vtt" }],
        },
        en: {
          language: { code: "en", name: "English" },
          captions: [{ ext: "vtt", url: "https://media.example/en.vtt" }],
        },
      },
    },
  };

  const formats = normalizeStreamFormats(data, "ja");
  assert.equal(formats.length, 2);
  assert.equal(formats[1].isM3u8, true);
  assert.equal(primaryPlayableStream(data, "ja").url, "https://media.example/muxed.mp4");
  const captions = extractSubtitleTracks(data, "ja");
  assert.deepEqual(captions.map((track) => track.srclang), ["ja", "en"]);
});


test("manual captions take precedence while all other automatic languages remain available", () => {
  const captions = extractSubtitleTracks({
    subtitles: {
      manualByLanguage: {
        ja: {
          language: { code: "ja", name: "日本語" },
          captions: [{ ext: "vtt", url: "https://media.example/ja-manual.vtt" }],
        },
      },
      automaticByLanguage: {
        ja: {
          language: { code: "ja", name: "日本語" },
          captions: [{ ext: "vtt", url: "https://media.example/ja-auto.vtt" }],
        },
        en: {
          language: { code: "en", name: "English" },
          captions: [{ ext: "vtt", url: "https://media.example/en-auto.vtt" }],
        },
      },
    },
  }, "ja");

  assert.equal(captions.length, 2);
  assert.deepEqual(captions.map((track) => track.src), [
    "https://media.example/ja-manual.vtt",
    "https://media.example/en-auto.vtt",
  ]);
});

test("playback keeps every manual caption without eagerly downloading every automatic translation", () => {
  const tracks = [
    { srclang: "ja", automatic: false },
    ...Array.from({ length: 8 }, (_, index) => ({
      srclang: `auto-${index}`,
      automatic: true,
    })),
  ];
  const selected = selectPlaybackSubtitleTracks(tracks, 3);
  assert.deepEqual(selected.map((track) => track.srclang), [
    "ja",
    "auto-0",
    "auto-1",
    "auto-2",
  ]);
});
