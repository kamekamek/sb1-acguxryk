import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ESMでの__dirnameの代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Luma API用のプロキシエンドポイント
app.use('/api/luma', createProxyMiddleware({
  target: 'https://api.lumalabs.ai',
  changeOrigin: true,
  pathRewrite: {
    '^/api/luma': '/dream-machine/v1/generations'
  },
  onProxyReq: (proxyReq, req, res) => {
    // リクエストヘッダーの設定
    if (process.env.LUMA_API_KEY) {
      proxyReq.setHeader('Authorization', `Bearer ${process.env.LUMA_API_KEY}`);
    }
    proxyReq.setHeader('Content-Type', 'application/json');
  }
}));

// 特定のLuma生成IDの状態を取得するエンドポイント
app.use('/api/luma/:id', createProxyMiddleware({
  target: 'https://api.lumalabs.ai',
  changeOrigin: true,
  pathRewrite: (path, req) => {
    const id = path.split('/').pop();
    return `/dream-machine/v1/generations/${id}`;
  },
  onProxyReq: (proxyReq, req, res) => {
    if (process.env.LUMA_API_KEY) {
      proxyReq.setHeader('Authorization', `Bearer ${process.env.LUMA_API_KEY}`);
    }
    proxyReq.setHeader('Content-Type', 'application/json');
  }
}));

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app; 