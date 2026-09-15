<template>
  <div class="page-container yt-watch-page">
    <div class="main-content" v-if="video">
      <div class="main-video-wrapper">
        <StreamPlayer
          :videoId="videoId"
          :videoTitle="title"
          :videoArtist="video.author?.name || ''"
          :videoThumbnail="video.thumbnail || ''"
          :streamType="resolvedStreamType"
          @ended="onPlayerEnded"
          @play-autoplay-candidate="onPlayAutoplayCandidate"
          @autoplay-no-suitable-video="onAutoplayNoSuitableVideo"
        />
      </div>

      <h1 class="video-title" ref="videoTitle">{{ title }}</h1>
      <div class="video-info channel-info">
        <div
          class="channel-icon-link"
          @click.stop="onChannelClick"
          @keydown.enter="onChannelClick"
          tabindex="0"
          role="button"
        >
          <img
            :src="authorThumbnailUrl"
            alt="チャンネルアイコン"
            class="channel-icon"
            @error="onImageError($event, authorId)"
          />
        </div>
        <div class="channel-text">
          <div
            class="channel-name"
            @click.stop="onChannelClick"
            @keydown.enter="onChannelClick"
            tabindex="0"
            role="button"
          >
            {{ authorName }}
            <span style="margin-left: 5px" v-if="authorBadge === 'AUDIO_BADGE'"
              ><svg
                width="18"
                height="18"
                xmlns="http://www.w3.org/2000/svg"
                xmlns:svg="http://www.w3.org/2000/svg"
                display="inherit"
              >
                <g class="layer">
                  <title>認証済み音楽チャンネル</title>
                  <path
                    fill="var(--svg-color)"
                    d="m6.6,1.04l-0.62,0.62l-0.87,0a3.41,3.43 0 0 0 -3.41,3.43l0,0.87l-0.62,0.62a3.41,3.43 0 0 0 0,4.85l0.62,0.62l0,0.87a3.41,3.43 0 0 0 3.41,3.43l0.87,0l0.62,0.62a3.41,3.43 0 0 0 4.82,0l0.62,-0.62l0.87,0a3.41,3.43 0 0 0 3.41,-3.43l0,-0.87l0.62,-0.62a3.41,3.43 0 0 0 0,-4.85l-0.62,-0.62l0,-0.87a3.41,3.43 0 0 0 -3.41,-3.43l-0.87,0l-0.62,-0.62a3.41,3.43 0 0 0 -4.82,0zm6.28,5.42a0.41,0.41 0 0 1 0.19,0.35l0,1.42a0.21,0.21 0 0 1 -0.32,0.18l-2.12,-1.28l0,3.72a2.23,2.25 0 1 1 -1.62,-2.16l0,-3.85a0.41,0.41 0 0 1 0.62,-0.35l3.25,1.98z"
                    id="svg_1"
                  />
                </g>
              </svg>
            </span>
            <span
              style="margin-left: 5px"
              v-else-if="authorBadge === 'CHECK_CIRCLE_THICK'"
              ><svg
                width="18"
                height="18"
                xmlns="http://www.w3.org/2000/svg"
                xmlns:svg="http://www.w3.org/2000/svg"
                display="inherit"
              >
                <g class="layer">
                  <title>認証済み</title>
                  <path
                    fill="var(--svg-color)"
                    d="m9.04,0.16c-4.94,0 -8.93,3.98 -8.93,8.91s4,8.91 8.93,8.91s8.93,-3.99 8.93,-8.91s-4,-8.91 -8.93,-8.91zm4.64,5.9a0.81,0.81 0 0 1 0,1.15l-6.26,6.23l-3.01,-3a0.81,0.81 0 1 1 1.15,-1.15l1.86,1.86l5.11,-5.1a0.81,0.81 0 0 1 1.15,0z"
                    id="svg_1"
                  />
                </g></svg
            ></span>
          </div>
          <p class="subscriber-count">{{ subscriberCount }}</p>
        </div>

        <div class="channel-controls">
          <button
            class="subscribe-btn"
            :class="{ subscribed: subscribedLocal }"
            @click.stop="toggleSubscribe"
            :title="subscribedLocal ? '登録解除' : '登録'"
          >
            {{ subscribedLocal ? "登録解除" : "登録" }}
          </button>

          <StreamTypeDropdown
            :resolvedStreamType="resolvedStreamType"
            :isOpen="isDropdownOpen"
            @toggle="toggleDropdown"
            @select="selectStreamType"
          />
        </div>
      </div>
      <div
        style="
          padding: 10px 10px 0 10px;
          border-radius: 8px;
          background-color: var(--video-meta-bg);
        "
      >
        <div class="video-meta">
          <span>{{ viewCount.replace(/\s+/g, "") }}</span>
          <span>・{{ relativeDate }}</span>
          <span
            v-if="extended_title && extended_title.trim() !== ''"
            class="extended_title"
            >{{ extended_title }}</span
          >
          <div
            style="
              padding-top: 10px;
              display: flex;
              align-items: center;
              gap: 8px;
            "
          >
            <div id="mainvideo-likeCount">
              <svg
                style="padding-top: 2px; padding-right: 4px"
                width="20"
                height="20"
                xmlns="http://www.w3.org/2000/svg"
                xmlns:svg="http://www.w3.org/2000/svg"
                preserveAspectRatio="xMidYMid meet"
                transform="translate3d(0px, 0px, 0px)"
              >
                <defs>
                  <clipPath id="__lottie_element_402">
                    <rect height="48" id="svg_1" width="48" x="0" y="0" />
                  </clipPath>
                  <clipPath id="__lottie_element_419">
                    <path
                      d="m-37.97,-32.54l480,0l0,480l-480,0l0,-480z"
                      id="svg_2"
                    />
                  </clipPath>
                  <clipPath id="__lottie_element_429">
                    <path
                      d="m-37.97,-32.54l480,0l0,480l-480,0l0,-480z"
                      id="svg_3"
                    />
                  </clipPath>
                  <clipPath id="__lottie_element_439">
                    <path
                      d="m-37.97,-32.54l480,0l0,480l-480,0l0,-480z"
                      id="svg_4"
                    />
                  </clipPath>
                  <clipPath id="__lottie_element_449">
                    <path
                      d="m-37.97,-32.54l480,0l0,480l-480,0l0,-480z"
                      id="svg_5"
                    />
                  </clipPath>
                  <clipPath id="__lottie_element_459">
                    <path
                      d="m-37.97,-32.54l480,0l0,480l-480,0l0,-480z"
                      id="svg_6"
                    />
                  </clipPath>
                </defs>
                <g class="layer">
                  <title>レイヤー1</title>
                  <g clip-path="url(#__lottie_element_402)" id="svg_7">
                    <g
                      clip-path="url(#__lottie_element_459)"
                      display="none"
                      id="svg_8"
                      transform="matrix(0.0567383 -0.166685 0.174622 0.0541596 -11.6766 76.011)"
                    >
                      <g
                        display="block"
                        id="svg_9"
                        transform="matrix(0.750315 0.66108 -0.66108 0.750315 286.276 187.478)"
                      >
                        <path
                          d="m-51.09,-298.22c0,0 0,-0.62 0,-0.62"
                          fill-opacity="0"
                          id="svg_10"
                          stroke="var(--normal-color)"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="0"
                        />
                        <g id="svg_11" transform="matrix(1 0 0 1.2 0 0)" />
                      </g>
                      <g
                        display="block"
                        id="svg_12"
                        transform="matrix(0.994522 -0.104524 0.104524 0.994522 231.638 160.438)"
                      >
                        <path
                          d="m97.01,-278.06c0,0 0,-0.63 0,-0.63"
                          fill-opacity="0"
                          id="svg_13"
                          stroke="var(--normal-color)"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="0"
                        />
                        <g id="svg_14" transform="matrix(1 0 0 1.2 0 0)" />
                      </g>
                    </g>
                    <g
                      clip-path="url(#__lottie_element_449)"
                      display="none"
                      id="svg_15"
                      transform="matrix(-0.148543 -0.103018 0.107923 -0.141791 53.5988 107.759)"
                    >
                      <g
                        display="block"
                        id="svg_16"
                        transform="matrix(0.750315 0.66108 -0.66108 0.750315 286.276 187.478)"
                      >
                        <path
                          d="m154.29,-223.23c0,0 0,-0.62 0,-0.62"
                          fill-opacity="0"
                          id="svg_17"
                          stroke="var(--normal-color)"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="0"
                        />
                        <g id="svg_18" transform="matrix(1 0 0 1.2 0 0)" />
                      </g>
                      <g
                        display="block"
                        id="svg_19"
                        transform="matrix(0.994522 -0.104524 0.104524 0.994522 231.638 160.438)"
                      >
                        <path
                          d="m180.9,-76.15c0,0 0,-0.63 0,-0.63"
                          fill-opacity="0"
                          id="svg_20"
                          stroke="var(--normal-color)"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="0"
                        />
                        <g id="svg_21" transform="matrix(1 0 0 1.2 0 0)" />
                      </g>
                    </g>
                    <g
                      clip-path="url(#__lottie_element_439)"
                      display="none"
                      id="svg_22"
                      transform="matrix(-0.148543 0.103018 -0.107923 -0.141791 105.402 58.3104)"
                    >
                      <g
                        display="block"
                        id="svg_23"
                        transform="matrix(0.750315 0.66108 -0.66108 0.750315 286.276 187.478)"
                      >
                        <path
                          d="m146.45,-4.73c0,0 0,-0.62 0,-0.62"
                          fill-opacity="0"
                          id="svg_24"
                          stroke="var(--normal-color)"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="0"
                        />
                        <g id="svg_25" transform="matrix(1 0 0 1.2 0 0)" />
                      </g>
                      <g
                        display="block"
                        id="svg_26"
                        transform="matrix(0.994522 -0.104524 0.104524 0.994522 231.638 160.438)"
                      >
                        <path
                          d="m14.8,66.03c0,0 0,-0.63 0,-0.63"
                          fill-opacity="0"
                          id="svg_27"
                          stroke="var(--normal-color)"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="0"
                        />
                        <g id="svg_28" transform="matrix(1 0 0 1.2 0 0)" />
                      </g>
                    </g>
                    <g
                      clip-path="url(#__lottie_element_429)"
                      display="none"
                      id="svg_29"
                      transform="matrix(0.0567383 0.166685 -0.174622 0.0541596 72.1421 -3.99831)"
                    >
                      <g
                        display="block"
                        id="svg_30"
                        transform="matrix(0.750315 0.66108 -0.66108 0.750315 286.276 187.478)"
                      >
                        <path
                          d="m-63.78,55.33c0,0 0,-0.62 0,-0.62"
                          fill-opacity="0"
                          id="svg_31"
                          stroke="var(--normal-color)"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="0"
                        />
                        <g id="svg_32" transform="matrix(1 0 0 1.2 0 0)" />
                      </g>
                      <g
                        display="block"
                        id="svg_33"
                        transform="matrix(0.994522 -0.104524 0.104524 0.994522 231.638 160.438)"
                      >
                        <path
                          d="m-171.76,-48.01c0,0 0,-0.63 0,-0.63"
                          fill-opacity="0"
                          id="svg_34"
                          stroke="var(--normal-color)"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="0"
                        />
                        <g id="svg_35" transform="matrix(1 0 0 1.2 0 0)" />
                      </g>
                    </g>
                    <g
                      clip-path="url(#__lottie_element_419)"
                      display="none"
                      id="svg_36"
                      transform="matrix(0.183609 0 0 0.175264 -0.216196 6.94126)"
                    >
                      <g
                        display="block"
                        id="svg_37"
                        transform="matrix(0.750315 0.66108 -0.66108 0.750315 286.276 187.478)"
                      >
                        <path
                          d="m-185.88,-126.05c0,0 0,-0.62 0,-0.62"
                          fill-opacity="0"
                          id="svg_38"
                          stroke="var(--normal-color)"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="0"
                        />
                        <g id="svg_39" transform="matrix(1 0 0 1.2 0 0)" />
                      </g>
                      <g
                        display="block"
                        id="svg_40"
                        transform="matrix(0.994522 -0.104524 0.104524 0.994522 231.638 160.438)"
                      >
                        <path
                          d="m-120.94,-260.67c0,0 0,-0.63 0,-0.63"
                          fill-opacity="0"
                          id="svg_41"
                          stroke="var(--normal-color)"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="0"
                        />
                        <g id="svg_42" transform="matrix(1 0 0 1.2 0 0)" />
                      </g>
                    </g>
                    <g
                      display="none"
                      id="svg_43"
                      transform="matrix(0.183609 0 0 0.175264 43.85 49.0047)"
                    />
                    <g
                      display="none"
                      id="svg_44"
                      transform="matrix(1.83609 0 0 1.75264 39.9942 42.345)"
                    >
                      <path
                        d="m-13.5,-16.04c1.79,0 3.25,1.46 3.25,3.25c0,1.79 -1.46,3.25 -3.25,3.25c-1.79,0 -3.25,-1.46 -3.25,-3.25c0,-1.79 1.46,-3.25 3.25,-3.25zm0.8,-6.74c1.79,0.44 2.78,2.29 2.35,4.06c-0.19,0.76 -0.39,1.52 -0.71,2.47c-0.31,0.96 1.35,1.32 0.19,3.91c-0.88,1.98 -6.38,0.28 -5.36,-2.62c0.89,-2.51 1.71,-4.88 2.56,-7.3c0.15,-0.43 0.56,-0.63 0.97,-0.52z"
                        fill="var(--normal-color)"
                        id="svg_45"
                      />
                    </g>
                    <g
                      display="none"
                      id="svg_46"
                      transform="matrix(1.83609 0 0 1.75264 43.85 41.9945)"
                    >
                      <path
                        d="m-13.71,-15.25c0.48,0.44 0.87,0.45 1.54,0.45c0,0 5.29,0 5.29,0c0.85,0 1.62,0.48 2,1.24c0,0 0.18,0.36 0.18,0.36c0.4,0.8 0.14,1.78 -0.6,2.28c-0.13,0.08 -0.2,0.22 -0.2,0.37c0,0 0,0.07 0,0.07c0,0.12 0.04,0.25 0.12,0.35c0.77,1.02 0.58,2.47 -0.42,3.27c0,0 -0.49,0.4 -0.49,0.4c-0.13,0.1 -0.18,0.27 -0.13,0.42c0,0 0.07,0.2 0.07,0.2c0.22,0.66 0.1,1.38 -0.31,1.93c-0.53,0.7 -1.36,1.12 -2.24,1.12c0,0 -3.91,-0.01 -3.91,-0.01c-2.09,0 -4.14,-0.54 -5.95,-1.58c0,0 -0.28,-0.15 -0.28,-0.15c-0.3,-0.18 -0.64,-0.27 -0.99,-0.27c0,0 -2.47,0 -2.47,0c-0.55,0 -1,-0.45 -1,-1c0,0 0,-5.99 0,-5.99c0,-0.56 0.45,-1.01 1,-1c0,0 2.79,0 2.79,0c0.43,0 0.8,-0.27 0.95,-0.67c0,0 0.2,-0.16 0.36,-0.6c0.6,-1.68 4.04,-1.95 4.69,-1.19z"
                        fill="var(--normal-color)"
                        id="svg_47"
                      />
                    </g>
                    <g
                      display="none"
                      id="svg_48"
                      transform="matrix(0.547972 0.0549741 -0.0575915 0.523066 49.7345 48.9309)"
                    >
                      <path
                        d="m-59.33,-53.69c3,-0.13 1.79,1.3 1.18,1.73c3.79,0.17 5.52,0.57 5.5,1.53c-0.09,3.7 -0.43,6.83 -2.85,9.66c-6.53,1.38 -11.75,-2.2 -14.5,-2.02c-0.05,-1.73 -0.24,-4.32 0.13,-6.58c3.91,-0.29 6.93,-4.18 10.54,-4.32z"
                        fill="var(--normal-color)"
                        id="svg_49"
                      />
                    </g>
                    <g
                      display="block"
                      id="svg_50"
                      transform="matrix(0.959954 0 0 0.909324 22.9493 21.8543)"
                    >
                      <path
                        d="m-16.06,-22.78c0.16,-0.46 0.63,-0.74 1.11,-0.66c0,0 1.04,0.17 1.04,0.17c2.25,0.38 3.73,2.55 3.25,4.78c0,0 -0.62,2.91 -0.62,2.91c0,0 4.06,0 4.06,0c1.72,0 3.21,1.19 3.58,2.87c0.23,1.03 -0.01,2.13 -0.64,2.98c0,0 0.02,0.09 0.02,0.09c0.3,1.28 -0.09,2.63 -1.02,3.56c0,0 0,0.04 0,0.04c0,0 -0.01,0.23 -0.01,0.23c-0.02,0.22 -0.06,0.45 -0.13,0.66c0,0 -0.11,0.29 -0.11,0.29c-0.59,1.37 -1.94,2.28 -3.45,2.28c0,0 -3.61,0 -3.61,0c0,0 -0.39,-0.01 -0.39,-0.01c-1.83,-0.06 -3.61,-0.53 -5.23,-1.39c0,0 -0.34,-0.18 -0.34,-0.18c0,0 -0.27,-0.16 -0.27,-0.16c-0.26,-0.15 -0.56,-0.24 -0.86,-0.26c0,0 -0.13,0 -0.13,0c0,0 -1.97,0 -1.97,0c-0.83,0 -1.5,-0.67 -1.5,-1.5c0,0 0,-6 0,-6c0,-0.83 0.67,-1.5 1.5,-1.5c0,0 1.79,0 1.79,0c0,0 0.16,-0.01 0.16,-0.01c0.31,-0.05 0.57,-0.24 0.72,-0.52c0,0 0.06,-0.14 0.06,-0.14c0,0 2.99,-8.53 2.99,-8.53zm-1.1,9.19c-0.42,1.2 -1.55,2.01 -2.83,2.01c0,0 -1.29,0 -1.29,0c0,0 0,5 0,5c0,0 1.47,0 1.47,0c0.69,0 1.38,0.18 1.98,0.53c0,0 0.27,0.15 0.27,0.15c0,0 0.29,0.16 0.29,0.16c1.44,0.76 3.05,1.16 4.68,1.16c0,0 3.61,0 3.61,0c0.75,0 1.42,-0.48 1.66,-1.2c0,0 0.03,-0.13 0.03,-0.13c0.01,-0.04 0.01,-0.08 0.01,-0.13c0,0 0,-0.87 0,-0.87c0,0 0.59,-0.58 0.59,-0.58c0.38,-0.39 0.57,-0.93 0.52,-1.47c0,0 -0.04,-0.23 -0.04,-0.23c0,0 -0.02,-0.09 -0.02,-0.09c0,0 -0.21,-0.9 -0.21,-0.9c0,0 0.55,-0.74 0.55,-0.74c0.29,-0.39 0.4,-0.89 0.29,-1.36c-0.17,-0.76 -0.84,-1.3 -1.62,-1.3c0,0 -4.06,0 -4.06,0c-0.6,0 -1.18,-0.27 -1.56,-0.74c-0.38,-0.47 -0.52,-1.09 -0.4,-1.68c0,0 0.63,-2.9 0.63,-2.9c0.24,-1.12 -0.5,-2.21 -1.63,-2.4c0,0 -0.21,-0.03 -0.21,-0.03c0,0 -2.71,7.74 -2.71,7.74z"
                        fill="var(--normal-color)"
                        id="svg_51"
                      />
                    </g>
                  </g>
                </g>
              </svg>
              {{ likeCount }}
            </div>
            <StreamPlayer :videoId="videoId" :streamType="'3'" />
            <button
              class="add-playlist-btn"
              @click.stop="openPlaylistModal"
              title="プレイリストに追加"
            >
              <svg
                style="padding-right: 3px"
                width="20"
                height="20"
                xmlns="http://www.w3.org/2000/svg"
                xmlns:svg="http://www.w3.org/2000/svg"
                display="inherit"
              >
                <g class="layer">
                  <title>Layer 1</title>
                  <path
                    d="m16.41,0.98l-12.69,0a1.81,1.79 0 0 0 -1.81,1.79l0,15.09c0,1.13 1.25,1.83 2.24,1.25l5.92,-3.5l5.92,3.5c0.99,0.58 2.24,-0.13 2.24,-1.25l0,-15.09a1.81,1.79 0 0 0 -1.81,-1.79zm-12.69,16.28l0,-14.5l12.69,0l0,14.5l-5.88,-3.47l-0.47,-0.28l-0.47,0.28l-5.88,3.47z"
                    id="svg_1"
                    fill="var(--normal-color)"
                  />
                </g>
              </svg>
              プレイリスト
            </button>
          </div>
        </div>
        <VideoDescription
          :descriptionRun0="descriptionRun0"
          :descriptionRun1="descriptionRun1"
          :formattedDescription="formattedDescription"
          :showFull="showFullDescription"
          @toggle="
            (v) => {
              showFullDescription = v;
            }
          "
        />
      </div>
      <Comment :videoId="videoId" :commentToken="video?.Commenttoken || null" />
    </div>

    <section v-else-if="!error" class="main-content watch-loading-state" aria-busy="true">
      <div class="main-video-wrapper">
        <PlayerLoading />
      </div>
      <div class="loading-video-details" aria-hidden="true">
        <span class="watch-skeleton loading-title-line"></span>
        <div class="loading-channel-row">
          <span class="watch-skeleton loading-channel-avatar"></span>
          <span class="watch-skeleton loading-channel-name"></span>
          <span class="watch-skeleton loading-action"></span>
        </div>
        <span class="watch-skeleton loading-description-line"></span>
      </div>
    </section>

    <section v-else class="main-content watch-error-state" role="alert">
      <div class="video-error-player">
        <span class="video-error-icon" aria-hidden="true">!</span>
        <p>{{ error }}</p>
        <button class="reload-btn" type="button" @click="reloadVideo">再取得</button>
      </div>
    </section>

    <RelatedList
      v-if="playlistId || relatedVideos.length"
      :relatedVideos="relatedVideos"
      :playlistId="playlistId"
      :currentVideoId="videoId"
      :loadingMore="loadingMore"
      @load-more="loadMoreRelatedVideos"
      @playlist-next-video="onPlaylistNextVideo"
    />
    <div v-else-if="error && video" class="error-msg">
      ⚠️ {{ error }}<br />
      <button class="reload-btn" @click="reloadVideo">再取得</button>
    </div>
    <aside v-else-if="!error" class="related-section loading-related" aria-hidden="true">
      <div v-for="index in 5" :key="index" class="loading-related-row">
        <span class="watch-skeleton loading-related-thumb"></span>
        <span class="loading-related-copy">
          <span class="watch-skeleton"></span>
          <span class="watch-skeleton short"></span>
        </span>
      </div>
    </aside>

    <!-- 自動再生フィルタ通知 -->
    <AutoplayNotification
      v-if="showAutoplayNotification"
      :message="autoplayNotificationMessage"
      @close="showAutoplayNotification = false"
    />
    <PlaylistModal
      v-if="showPlaylistModal"
      :video="video"
      @close="closePlaylistModal"
      @added="onPlaylistAdded"
    />

    <!-- コラボレーター一覧ポップアップ -->
    <CollaboratorsPopup
      v-if="showCollaboratorsPopup && video?.author?.collaborators"
      :collaborators="video.author.collaborators"
      @close="showCollaboratorsPopup = false"
    />
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { ref } from "vue";
import PlaylistComponent from "@/components/Playlist.vue";
import Comment from "@/components/Comment.vue";
import PlayerLoading from "@/components/PlayerLoading.vue";
import StreamPlayer from "@/components/StreamPlayer.vue";
window.scrollTo(0, 0);

const route = useRoute();
const videoId = computed(() => route.query.v);
const playlistId = computed(() => route.query.list);

const currentType = ref("1");

function switchStream() {
  currentType.value = "3";
}
</script>

<script>
import { video as fetchVideo } from "@/services/siatubeApi";
import { addVideoToHistory } from "@/utils/historyManager";
import PlaylistComponent from "@/components/Playlist.vue";
import Comment from "@/components/Comment.vue";
import StreamPlayer from "@/components/StreamPlayer.vue";
import StreamTypeDropdown from "@/components/StreamTypeDropdown.vue";
import VideoDescription from "@/components/VideoDescription.vue";
import RelatedList from "@/components/RelatedList.vue";
import AutoplayNotification from "@/components/AutoplayNotification.vue";
import PlaylistModal from "@/components/PlaylistModal.vue";
import CollaboratorsPopup from "@/components/CollaboratorsPopup.vue";
import subscriptionManager from "@/utils/subscriptionManager";
import { loadAutoplay } from "@/utils/settingsManager";

export default {
  components: {
    PlaylistComponent,
    Comment,
    StreamPlayer,
    StreamTypeDropdown,
    VideoDescription,
    RelatedList,
    AutoplayNotification,
    PlaylistModal,
    CollaboratorsPopup,
  },
  props: {
    videoId: { type: String, required: true },
    streamType: { type: String, default: "" },
  },
  data() {
    return {
      video: null,
      error: null,
      hoverId: null,
      showFullDescription: false,
      localStreamType: this.getDefaultPlaybackMode() || "1",
      isDropdownOpen: false,
      _autoplayTimer: null,
      _autoplayDecisionTimer: null,
      showAutoplayNotification: false,
      autoplayNotificationMessage: "",
      showPlaylistModal: false,
      nextContinuationToken: null,
      loadingMore: false,
      subscribedLocal: false,
      showCollaboratorsPopup: false,
      videoRequestSequence: 0,
      relatedRequestSequence: 0,
      nextPlaylistVideoId: "",
    };
  },
  computed: {
    resolvedStreamType() {
      return this.streamType || this.localStreamType;
    },
    viewCount() {
      return this.video?.views || "情報なし";
    },
    title() {
      return this.video?.title || "情報なし";
    },
    relativeDate() {
      return this.video?.relativeDate || "";
    },
    likeCount() {
      return this.video?.likes || "情報なし";
    },
    extended_title() {
      return this.video?.extended_superTitle || "";
    },
    subscriberCount() {
      return this.video?.author?.subscribers || "情報なし";
    },
    authorId() {
      return this.video?.author?.id || "情報なし";
    },
    authorName() {
      const author = this.video?.author;
      if (!author) return "情報なし";
      const name = author.name || "情報なし";
      // コラボの場合は「、他Nチャンネル」を追加
      if (
        author.collaborator &&
        Array.isArray(author.collaborators) &&
        author.collaborators.length > 1
      ) {
        const others = author.collaborators.length - 1;
        return `${name}、他${others}チャンネル`;
      }
      return name;
    },
    authorBadge() {
      return (
        this.video?.extended_badges?.[0]?.metadataBadgeRenderer?.icon
          ?.iconType || ""
      );
    },
    authorThumbnailUrl() {
      const author = this.video?.author;
      if (!author) return "情報なし";
      // コラボの場合、先頭のコラボレーターのサムネイルを優先
      if (
        author.collaborator &&
        Array.isArray(author.collaborators) &&
        author.collaborators.length > 0
      ) {
        return (
          author.collaborators[0].thumbnail || author.thumbnail || "情報なし"
        );
      }
      return author.thumbnail || "情報なし";
    },
    isSubscribedComputed() {
      return subscriptionManager.isSubscribed(this.authorId);
    },
    descriptionText() {
      return this.video?.description?.text || "情報なし";
    },
    formattedDescription() {
      const rawText =
        this.video?.description?.text ||
        "この動画には説明が追加されていません。";
      return rawText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
    },
    shouldShowToggle() {
      const text = this.descriptionRun3?.trim();
      return text !== "";
    },
    descriptionRun0() {
      return this.video?.description?.run0 || "情報なし";
    },
    descriptionRun1() {
      return this.video?.description?.run1 || "";
    },
    descriptionRun2() {
      return this.video?.description?.run2 || "";
    },
    descriptionRun3() {
      return this.video?.description?.run3 || "";
    },
    relatedVideos() {
      const feed = this.video?.["Related-videos"]?.relatedVideos || [];
      const mapped = feed.map((item) => {
        if (item.type === "playlist") {
          return {
            type: item.type,
            base64imge: item.thumbnail || item.thumbnails?.[0]?.url || "",
            badge: "",
            title: item.title || "",
            metadataRow1: "再生リスト",
            metadataRow2Part1: "",
            metadataRow2Part2: "",
            videoId: item.videoId || "",
            replaylistId: item.playlistId || "",
            duration: 0,
            verifiedIcon: null,
          };
        } else {
          return {
            type: item.type,
            base64imge: item.thumbnail || item.thumbnails?.[0]?.url || "",
            badge: item.badge || "",
            title: item.title || "",
            metadataRow1: item.channelName || "",
            metadataRow2Part1: item.viewCountText || "",
            metadataRow2Part2: item.publishedTimeText || "",
            videoId: item.videoId || "",
            replaylistId: "",
            duration: item.duration || 0,
            verifiedIcon: item.verifiedIcon || null,
          };
        }
      });

      if (mapped.length > 0) {
        console.log("First related video item:", mapped[0]);
        console.log("Raw API response first item:", feed[0]);
      }

      return mapped;
    },
  },
  methods: {
    getDefaultPlaybackMode() {
      try {
        const fromStorage = localStorage.getItem("defaultPlaybackMode");
        if (fromStorage) {
          return fromStorage;
        }
        const match = document.cookie.match(
          new RegExp("(^| )StreamType=([^;]+)")
        );
        return match ? decodeURIComponent(match[2]) : null;
      } catch {
        return null;
      }
    },
    getCookieSafe(name) {
      try {
        const match = document.cookie.match(
          new RegExp("(^| )" + name + "=([^;]+)")
        );
        return match ? decodeURIComponent(match[2]) : null;
      } catch {
        return null;
      }
    },
    parseDurationFromBadge(badgeText) {
      if (!badgeText || typeof badgeText !== "string") return 0;

      badgeText = badgeText.trim();
      console.log(`Parsing badge: "${badgeText}"`);

      const hhmmssMatch = badgeText.match(/^(\d+):(\d+):(\d+)$/);
      if (hhmmssMatch) {
        const seconds =
          parseInt(hhmmssMatch[1]) * 3600 +
          parseInt(hhmmssMatch[2]) * 60 +
          parseInt(hhmmssMatch[3]);
        console.log(`  HH:MM:SS matched: ${seconds}s`);
        return seconds;
      }

      const mmssMatch = badgeText.match(/^(\d+):(\d+)$/);
      if (mmssMatch) {
        const seconds = parseInt(mmssMatch[1]) * 60 + parseInt(mmssMatch[2]);
        console.log(`  MM:SS matched: ${seconds}s`);
        return seconds;
      }

      const japaneseMatch = badgeText.match(/^(\d+)分(?:(\d+)秒)?$/);
      if (japaneseMatch) {
        let seconds = parseInt(japaneseMatch[1]) * 60;
        if (japaneseMatch[2]) {
          seconds += parseInt(japaneseMatch[2]);
        }
        console.log(`  Japanese format matched: ${seconds}s`);
        return seconds;
      }

      console.log(`  No pattern matched`);
      return 0;
    },

    async toggleSubscribe() {
      try {
        const id = this.authorId;
        console.debug("toggleSubscribe clicked", {
          id,
          subscribedBefore: subscriptionManager.isSubscribed(id),
        });
        if (!id || id === "情報なし") return;
        if (subscriptionManager.isSubscribed(id)) {
          subscriptionManager.removeSubscription(id);
          this.subscribedLocal = false;
          try {
            window.dispatchEvent(new CustomEvent("subscriptions-changed"));
          } catch (e) {}
          console.debug(
            "after remove, subscriptions",
            subscriptionManager.getSubscriptions()
          );
          this.autoplayNotificationMessage = "チャンネル登録を解除しました";
          this.showAutoplayNotification = true;
          setTimeout(() => (this.showAutoplayNotification = false), 2000);
        } else {
          const initialIcon =
            this.authorThumbnailUrl && this.authorThumbnailUrl !== "情報なし"
              ? this.authorThumbnailUrl
              : null;
          const authorObj = this.video?.author || {};
          const subName =
            authorObj.name ||
            (authorObj.collaborator &&
              Array.isArray(authorObj.collaborators) &&
              authorObj.collaborators[0]?.name) ||
            this.authorName;
          subscriptionManager.addSubscription({
            id,
            name: subName,
            icon: initialIcon,
          });
          this.subscribedLocal = true;
          try {
            window.dispatchEvent(new CustomEvent("subscriptions-changed"));
          } catch (e) {}
          console.debug(
            "after add, subscriptions",
            subscriptionManager.getSubscriptions()
          );
          this.autoplayNotificationMessage = "チャンネルを登録しました";
          this.showAutoplayNotification = true;
          setTimeout(() => (this.showAutoplayNotification = false), 2000);

          // Fetch icon asynchronously and update subscription when available
          (async () => {
            try {
              const fetchedIcon = await subscriptionManager.fetchImageAsBase64(
                this.authorThumbnailUrl
              );
              if (fetchedIcon) {
                subscriptionManager.updateSubscription(id, {
                  icon: fetchedIcon,
                });
              } else if (
                this.authorThumbnailUrl &&
                this.authorThumbnailUrl !== "情報なし"
              ) {
                // If base64 fetch failed, fall back to original URL so image still shows
                subscriptionManager.updateSubscription(id, {
                  icon: this.authorThumbnailUrl,
                });
              }
            } catch (e) {
              console.warn("icon fetch failed", e);
            }
          })();
        }
        // ensure we re-sync shortly after in case of timing issues
        setTimeout(() => {
          try {
            this.subscribedLocal = subscriptionManager.isSubscribed(
              this.authorId
            );
          } catch (e) {}
        }, 50);
      } catch (e) {
        console.error("toggleSubscribe error", e);
      }
    },
    setCookieSafe(name, value, seconds) {
      try {
        const expires = new Date(Date.now() + seconds * 1000).toUTCString();
        document.cookie = `${name}=${encodeURIComponent(
          value
        )}; expires=${expires}; path=/`;
      } catch {}
    },
    onStreamTypeChange() {
      // localStorage と Cookie の両方に保存
      try {
        localStorage.setItem("defaultPlaybackMode", this.localStreamType);
      } catch (e) {
        console.error("localStorage save error:", e);
      }
      this.setCookieSafe("StreamType", this.localStreamType, 99999);
    },
    onPlayerEnded() {
      try {
        // 既存のタイマーをクリア
        try {
          if (this._autoplayTimer) {
            clearTimeout(this._autoplayTimer);
            this._autoplayTimer = null;
          }
        } catch (e) {}
        try {
          if (this._autoplayDecisionTimer) {
            clearTimeout(this._autoplayDecisionTimer);
            this._autoplayDecisionTimer = null;
          }
        } catch (e) {}
        if (!loadAutoplay()) return;

        // 少し待って（他のイベントが到着するのを待つ）から遷移タイマーをセット
        this._autoplayDecisionTimer = setTimeout(() => {
          try {
            if (!loadAutoplay()) return;
            // 自動再生ロックがある場合はスケジュールを抑止
            const lockRaw = (() => {
              try {
                return sessionStorage.getItem("yt_autoplay_lock");
              } catch (e) {
                return null;
              }
            })();
            if (lockRaw) {
              try {
                const lock = JSON.parse(lockRaw);
                if (lock && lock.expires && Date.now() < lock.expires) {
                  // ロック期間内はスケジュールを行わない
                  return;
                }
              } catch (e) {}
            }

            const filterConfig = window.__autoplayDurationFilter || {
              enabled: false,
            };
            if (filterConfig.enabled) {
              return;
            }

            this._autoplayTimer = setTimeout(() => {
              if (!loadAutoplay()) return;
              const activePlaylistId = this.$route.query.list;
              if (activePlaylistId) {
                if (!this.nextPlaylistVideoId) return;
                this.$router.push({
                  path: "/watch",
                  query: {
                    v: this.nextPlaylistVideoId,
                    list: activePlaylistId,
                    autoplay: "1",
                  },
                });
                return;
              }
              const next =
                this.relatedVideos && this.relatedVideos.length
                  ? this.relatedVideos[0]
                  : null;
              if (next && next.videoId) {
                const query = { v: next.videoId, autoplay: "1" };
                if (next.replaylistId && next.replaylistId.length > 0) {
                  // If the candidate belongs to a playlist, prefer that playlist id.
                  query.list = next.replaylistId;
                }
                this.$router.push({ path: "/watch", query });
              }
            }, 3000);
          } catch (e) {
            console.error("autoplay decision error", e);
          }
        }, 300); // 300ms の短い待ち時間
      } catch (e) {
        console.error("onPlayerEnded error", e);
      }
    },

    onPlayAutoplayCandidate({ id }) {
      try {
        if (!loadAutoplay()) return;
        const activePlaylistId = this.$route.query.list;
        if (activePlaylistId && !this.nextPlaylistVideoId) return;
        const targetId =
          activePlaylistId
            ? this.nextPlaylistVideoId
            : id;
        if (!targetId) return;
        // 自動遷移中の競合を防ぐためロックを設定（短時間）
        try {
          const lock = { target: targetId, expires: Date.now() + 5000 };
          sessionStorage.setItem("yt_autoplay_lock", JSON.stringify(lock));
        } catch (e) {}

        // 決定タイマーや既存の自動遷移タイマーをクリアしてから遷移
        try {
          if (this._autoplayDecisionTimer) {
            clearTimeout(this._autoplayDecisionTimer);
            this._autoplayDecisionTimer = null;
          }
        } catch (e) {}
        try {
          if (this._autoplayTimer) {
            clearTimeout(this._autoplayTimer);
            this._autoplayTimer = null;
          }
        } catch (e) {}

        const query = { v: targetId };
        if (activePlaylistId) {
          query.list = activePlaylistId;
        }
        this.$router.push({ path: "/watch", query });
      } catch (e) {
        console.error("onPlayAutoplayCandidate error", e);
      }
    },

    onPlaylistNextVideo(videoId) {
      this.nextPlaylistVideoId = videoId || "";
    },

    onAutoplayNoSuitableVideo() {
      try {
        const filterConfig = window.__autoplayDurationFilter || {
          enabled: false,
          minutes: 4,
        };
        this.autoplayNotificationMessage = `指定条件（${filterConfig.minutes}分以下）に合う関連動画がないため、自動再生をストップしました。`;
        this.showAutoplayNotification = true;

        // 5秒後に自動で通知を非表示
        setTimeout(() => {
          this.showAutoplayNotification = false;
        }, 5000);
      } catch (e) {
        console.error("onAutoplayNoSuitableVideo error:", e);
      }
    },

    openPlaylistModal() {
      this.showPlaylistModal = true;
    },
    closePlaylistModal() {
      this.showPlaylistModal = false;
    },
    onPlaylistAdded({ playlistId }) {
      // optional: show a brief notification
      try {
        this.autoplayNotificationMessage = "プレイリストに追加しました";
        this.showAutoplayNotification = true;
        setTimeout(() => (this.showAutoplayNotification = false), 2000);
      } catch (e) {}
      this.closePlaylistModal();
    },

    // --- fetchのみ（JSONのみ対応）
    async fetchVideoData(id) {
      const maxRetries = 3;
      const sequence = ++this.videoRequestSequence;
      this.relatedRequestSequence += 1;
      this.loadingMore = false;
      this.nextContinuationToken = null;
      if (!id) {
        this.video = null;
        this.error = "動画IDが指定されていません。";
        return;
      }

      try {
        this.video = null;
        this.error = null;
        const data = await fetchVideo(id, {
          depth: 2,
          retries: maxRetries,
          timeout: 15000,
        });
        if (sequence !== this.videoRequestSequence || id !== this.videoId) return;

        this.video = data;
        this.nextContinuationToken =
          data["Related-videos"]?.nextContinuationToken || null;
        // Sync subscribed state immediately after we have the author id
        try {
          this.subscribedLocal = subscriptionManager.isSubscribed(
            this.authorId
          );
        } catch (e) {
          console.warn("subscribed sync error", e);
        }

        // 履歴に保存（非同期で実行、エラーは無視）
        try {
          await addVideoToHistory({
            id: data.id,
            title: data.title,
            views: data.views,
            author: data.author,
            description: data.description,
            thumbnail: data.thumbnail,
          });
          if (sequence !== this.videoRequestSequence || id !== this.videoId) return;
        } catch (historyError) {
          console.warn("Failed to save to history:", historyError);
        }
        if (sequence !== this.videoRequestSequence || id !== this.videoId) return;

        if (
          !data["Related-videos"] ||
          !Array.isArray(data["Related-videos"].relatedVideos) ||
          data["Related-videos"].relatedVideos.length === 0
        ) {
          this.error = "関連動画が見つかりませんでした。";
        }
        // Reset popup state when new video loads
        this.showCollaboratorsPopup = false;
        return;
      } catch (err) {
        if (sequence !== this.videoRequestSequence || id !== this.videoId) return;
        console.error("fetchVideoData error:", err);
        this.video = null;
        // エラーメッセージは既存の UI 用文字列を使う
        this.error =
          err && err.message && err.message !== ""
            ? err.message
            : "動画情報を取得できませんでした。";
      }
    },
    reloadVideo() {
      this.fetchVideoData(this.videoId);
    },
    getPrimaryThumbnail(id) {
      return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    },
    onImageError(event, id) {
      if (!event.target.dataset.error) {
        event.target.src = `https://i.ytimg.com/vi/${id}/sddefault.jpg`;
        event.target.dataset.error = true;
      }
    },
    toggleDescription() {
      this.showFullDescription = !this.showFullDescription;
      this.$nextTick(() => {
        const el = this.$refs.videoTitle;
        if (el?.scrollIntoView) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    },
    toggleDropdown() {
      this.isDropdownOpen = !this.isDropdownOpen;
    },
    selectStreamType(value) {
      this.localStreamType = value;
      this.isDropdownOpen = false;
      this.onStreamTypeChange();
    },
    async loadMoreRelatedVideos() {
      if (!this.nextContinuationToken || this.loadingMore) return;
      const videoId = this.videoId;
      const token = this.nextContinuationToken;
      const sequence = ++this.relatedRequestSequence;
      this.loadingMore = true;
      try {
        const data = await fetchVideo(videoId, {
          token,
          depth: 2,
          retries: 3,
          timeout: 15000,
        });
        if (sequence !== this.relatedRequestSequence || videoId !== this.videoId) return;
        if (
          data["Related-videos"] &&
          Array.isArray(data["Related-videos"].relatedVideos)
        ) {
          const current = this.video["Related-videos"].relatedVideos;
          const seen = new Set(
            current.map((item) => `${item.type || "video"}:${item.videoId}:${item.playlistId || ""}`)
          );
          current.push(
            ...data["Related-videos"].relatedVideos.filter((item) => {
              const key = `${item.type || "video"}:${item.videoId}:${item.playlistId || ""}`;
              if (!item.videoId || seen.has(key)) return false;
              seen.add(key);
              return true;
            })
          );
          this.nextContinuationToken =
            data["Related-videos"].nextContinuationToken || null;
        }
      } catch (err) {
        if (sequence !== this.relatedRequestSequence || videoId !== this.videoId) return;
        console.error("loadMoreRelatedVideos error:", err);
      } finally {
        if (sequence === this.relatedRequestSequence) this.loadingMore = false;
      }
    },
    handleClickOutside(event) {
      if (this.isDropdownOpen && !this.$el.contains(event.target)) {
        this.isDropdownOpen = false;
      }
    },
    handleEscape(event) {
      if (event.key === "Escape") {
        this.isDropdownOpen = false;
      }
    },
    onSubscriptionsChanged() {
      try {
        // Update local subscribed flag from storage so UI keeps consistent
        const val = subscriptionManager.isSubscribed(this.authorId);
        console.debug("subscriptions-changed received on watch page", {
          id: this.authorId,
          subscribed: val,
        });
        this.subscribedLocal = val;
      } catch (e) {
        console.warn("onSubscriptionsChanged error", e);
      }
    },

    onChannelClick(event) {
      try {
        const author = this.video?.author;
        if (
          author &&
          author.collaborator &&
          Array.isArray(author.collaborators) &&
          author.collaborators.length > 0
        ) {
          // show popup instead of navigate
          this.showCollaboratorsPopup = true;
          return;
        }
        if (!this.authorId || this.authorId === "情報なし") return;
        this.$router.push({ path: `/channel/${this.authorId}` });
      } catch (e) {
        console.error("onChannelClick error", e);
      }
    },
  },
  mounted() {
    document.addEventListener("click", this.handleClickOutside);
    document.addEventListener("keydown", this.handleEscape);
    window.addEventListener(
      "subscriptions-changed",
      this.onSubscriptionsChanged
    );

    // initialize local subscribed state
    this.subscribedLocal = subscriptionManager.isSubscribed(this.authorId);

    // watch for storage changes from other tabs
    this._storageHandler = (e) => {
      if (e.key === "subscriptions_v1") {
        const val = subscriptionManager.isSubscribed(this.authorId);
        console.debug("storage event on watch page", {
          key: e.key,
          subscribed: val,
        });
        this.subscribedLocal = val;
      }
    };
    window.addEventListener("storage", this._storageHandler);
  },
  beforeUnmount() {
    document.removeEventListener("click", this.handleClickOutside);
    document.removeEventListener("keydown", this.handleEscape);
    window.removeEventListener(
      "subscriptions-changed",
      this.onSubscriptionsChanged
    );
    window.removeEventListener("storage", this._storageHandler);
    if (this._autoplayTimer) {
      clearTimeout(this._autoplayTimer);
      this._autoplayTimer = null;
    }
  },
  watch: {
    videoId: {
      immediate: true,
      handler(newId) {
        this.showFullDescription = false;
        this.fetchVideoData(newId);
      },
    },
    title(newTitle) {
      if (newTitle && newTitle !== "情報なし") {
        document.title = newTitle;
      }
    },
    authorId(newVal) {
      // keep local subscribed in-sync when author changes
      this.subscribedLocal = subscriptionManager.isSubscribed(newVal);
    },
  },
};
</script>

<style scoped src="../styles/video-player.css"></style>
