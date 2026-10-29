import { defineConfig, loadEnv } from 'vite';
import pixabay from './api/pixabay.js';
import visitors from './api/visitors.js';

// 로컬 개발(npm run dev)에서도 Vercel과 똑같이 /api/pixabay 를 쓸 수 있게 해주는 플러그인.
// 배포 후에는 Vercel이 api/pixabay.js 를 서버리스 함수로 직접 실행한다.
function devApi() {
  return {
    name: 'dev-api',
    configResolved(config) {
      Object.assign(process.env, loadEnv(config.mode, config.root, ''));
    },
    configureServer(server) {
      server.middlewares.use('/api/pixabay', (req, res) => pixabay(req, res));
      server.middlewares.use('/api/visitors', (req, res) => visitors(req, res));
    },
  };
}

export default defineConfig({
  plugins: [devApi()],
});
