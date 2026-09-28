import { createApp } from "vue";
import App from "./App.vue";
import router from "./router/index.js";
import "./styles/global.css";

if (typeof console !== 'undefined') {
	['log', 'warn', 'error', 'info', 'debug'].forEach((m) => {
		try {
			console[m] = () => {};
		} catch (e) {}
	});
}

createApp(App).use(router).mount("#app");
