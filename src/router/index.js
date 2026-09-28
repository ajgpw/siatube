import { createRouter, createWebHistory } from "vue-router";
import HomeView from "@/views/HomeView.vue";
import VideoPlayer from "@/views/VideoPlayer.vue";
import SearchView from "@/views/SearchView.vue";
import ChannelView from "@/views/ChannelView.vue";
import Playlist from "@/components/playlist/Playlist.vue";
import SubscriptionsView from "@/views/SubscriptionsView.vue";
import PlaylistsView from "@/views/PlaylistsView.vue";
import HistoryView from "@/views/HistoryView.vue";
import SettingsView from "@/views/SettingsView.vue";

const routes = [
  {
    path: "/", 
    name: "Home",
    component: HomeView,
  },
  {
    path: "/watch",
    name: "VideoPlayer",
    component: VideoPlayer,
    props: (route) => ({ videoId: route.query.v }),
  },
  {
    path: "/search",
    name: "Search",
    component: SearchView,
    props: (route) => ({ query: route.query.q || "" }),
  },
  {
    path: "/channel/:id",
    name: "Channel",
    component: ChannelView,
    props: (route) => ({ channelId: route.params.id }),
  },
  {
    path: "/playlist", 
    name: "Playlist",
    component: Playlist,
    props: (route) => ({
      playlistId: route.query.list || "", 
    }),
  },
  {
    path: "/subscriptions",
    name: "Subscriptions",
    component: SubscriptionsView,
  },
  {
    path: "/playlists",
    name: "Playlists",
    component: PlaylistsView,
  },
  {
    path: "/history",
    name: "History",
    component: HistoryView,
  },
  {
    path: "/settings",
    name: "Settings",
    component: SettingsView,
  },
  {
    path: "/:pathMatch(.*)*",
    name: "NotFound",
    redirect: "/",
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
