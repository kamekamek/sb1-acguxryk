import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Request, Response, NextFunction } from 'express';

// ESMでの__dirnameの代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// エラーハンドリングミドルウェア
const handleProxyError = (err: Error, req: Request, res: Response, target?: string) => {
  console.error('プロキシエラー:', err);
  res.status(500).json({
    error: true,
    message: `APIリクエストに失敗しました: ${err.message || 'Unknown error'}`,
    code: (err as any).code
  });
};

// Luma API用のプロキシエンドポイント
app.use('/api/luma', (req, res, next) => {
  console.log('Luma APIリクエスト:', {
    method: req.method,
    path: req.path,
    body: req.body,
    headers: req.headers
  });
  next();
}, createProxyMiddleware({
  target: 'https://api.lumalabs.ai',
  changeOrigin: true,
  pathRewrite: {
    '^/api/luma': '/dream-machine/v1/generations'
  },
  onProxyReq: (proxyReq, req, res) => {
    // リクエストヘッダーの設定
    if (process.env.LUMA_API_KEY) {
      proxyReq.setHeader('Authorization', `Bearer ${process.env.LUMA_API_KEY}`);
      console.log('APIキーを設定:', process.env.LUMA_API_KEY.substring(0, 10) + '...');
    } else {
      console.error('APIキーが設定されていません');
    }
    proxyReq.setHeader('Content-Type', 'application/json');
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log('Luma API応答:', {
      statusCode: proxyRes.statusCode,
      statusMessage: proxyRes.statusMessage,
      headers: proxyRes.headers
    });
    
    // レスポンスボディを収集
    let responseBody = '';
    proxyRes.on('data', (chunk) => {
      responseBody += chunk;
    });
    
    proxyRes.on('end', () => {
      try {
        const parsedBody = JSON.parse(responseBody);
        console.log('Luma API応答ボディ:', parsedBody);
      } catch (e) {
        console.log('Luma API応答ボディ (パース不可):', responseBody);
      }
    });
  },
  onError: handleProxyError
}));

// 特定のLuma生成IDの状態を取得するエンドポイント
app.use('/api/luma/:id', (req, res, next) => {
  console.log('Luma 生成ID取得リクエスト:', {
    method: req.method,
    path: req.path,
    params: req.params,
    headers: req.headers
  });
  next();
}, createProxyMiddleware({
  target: 'https://api.lumalabs.ai',
  changeOrigin: true,
  pathRewrite: (path, req) => {
    const id = path.split('/').pop();
    const newPath = `/dream-machine/v1/generations/${id}`;
    console.log(`パスの書き換え: ${path} -> ${newPath}`);
    return newPath;
  },
  onProxyReq: (proxyReq, req, res) => {
    if (process.env.LUMA_API_KEY) {
      proxyReq.setHeader('Authorization', `Bearer ${process.env.LUMA_API_KEY}`);
    }
    proxyReq.setHeader('Content-Type', 'application/json');
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log('Luma 生成ID応答:', {
      statusCode: proxyRes.statusCode,
      statusMessage: proxyRes.statusMessage
    });
    
    // レスポンスボディを収集
    let responseBody = '';
    proxyRes.on('data', (chunk) => {
      responseBody += chunk;
    });
    
    proxyRes.on('end', () => {
      try {
        const parsedBody = JSON.parse(responseBody);
        console.log('Luma 生成ID応答ボディ:', parsedBody);
      } catch (e) {
        console.log('Luma 生成ID応答ボディ (パース不可):', responseBody);
      }
    });
  },
  onError: handleProxyError
}));

// グローバルエラーハンドラー
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('サーバーエラー:', err);
  res.status(500).json({
    error: true,
    message: err.message || 'サーバー内部エラー'
  });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app; 