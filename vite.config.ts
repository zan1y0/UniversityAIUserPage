import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [vue()],
    server: {
      port: 5173,
      strictPort: true,
      watch: {
        // 编辑器/工具的临时目录偶尔被 Windows 锁住，会让 watcher 抛 EBUSY 并退出
        ignored: ['**/*.tmpdir/**', '**/*.tmp'],
      },
      proxy: {
        '/api/v1': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:8080', changeOrigin: true },
      },
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/zrender/')) return 'chart-renderer';
            if (id.includes('/node_modules/echarts/')) return 'chart-engine';
          },
        },
      },
    },
  };
});
