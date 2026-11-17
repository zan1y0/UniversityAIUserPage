import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { vDebounce } from './directives/debounce';
import './styles.css';

createApp(App).use(createPinia()).use(router).directive('debounce', vDebounce).mount('#app');
