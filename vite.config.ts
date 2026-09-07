import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig(({ mode }) => ({
  // 本番ビルドだけ GLSL を minify する (コメント除去)。開発時はシェーダーを読める状態を保つ。
  plugins: [glsl({ minify: mode === 'production' })],
  // iPad などの実機から LAN 越しに見るので host を開ける。カメラは使わないので HTTPS は不要。
  server: { host: true },
  preview: { host: true },
}));
