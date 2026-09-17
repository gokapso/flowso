import { createApp, defineAsyncComponent } from 'vue';
import '../src/vue/theme.css';
import './styles.css';

const App = defineAsyncComponent(() => new URLSearchParams(location.search).get('view') === 'preview' ? import('./preview.vue') : import('./app.vue'));

createApp(App).mount('#app');
