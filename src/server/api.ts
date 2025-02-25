import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { Request, Response } from 'express';
import { Url } from 'url';

// ESMでの__dirnameの代替
const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename); // 未使用なので削除またはコメントアウト

// 環境変数の読み込み
config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORSの設定を強化
app.use(cors({
  origin: '*', // すべてのオリジンを許可
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

// プリフライトリクエストに対応
app.options('*', cors());

app.use(express.json());

// エラーハンドリングミドルウェア
const handleProxyError = (err: Error, _req: Request, res: Response, _target?: string | Partial<Url>) => {
  console.error('プロキシエラー:', err);
  res.status(500).json({
    error: true,
    message: `APIリクエストに失敗しました: ${err.message || 'Unknown error'}`,
    code: (err as any).code
  });
};

// Luma API用のプロキシエンドポイント
app.use('/api/luma', (req, _res, next) => {
  console.log('Luma APIリクエスト:', {
    method: req.method,
    path: req.path,
    body: req.body,
    headers: {
      ...req.headers,
      authorization: req.headers.authorization ? '***認証情報は非表示***' : undefined
    }
  });
  console.log('リクエスト先URL:', 'https://api.lumalabs.ai/dream-machine/v1/generations' + req.path);
  next();
}, createProxyMiddleware({
  target: 'https://api.lumalabs.ai',
  changeOrigin: true,
  pathRewrite: {
    '^/api/luma': '/dream-machine/v1/generations'
  },
  timeout: 300000, // 5分のタイムアウト設定
  proxyTimeout: 300000, // プロキシのタイムアウト設定
  onProxyReq: (proxyReq, req, _res) => {
    // リクエストヘッダーの設定
    if (process.env.LUMA_API_KEY) {
      proxyReq.setHeader('Authorization', `Bearer ${process.env.LUMA_API_KEY}`);
      console.log('APIキーを設定:', process.env.LUMA_API_KEY.substring(0, 10) + '...');
    } else {
      console.error('APIキーが設定されていません');
    }
    proxyReq.setHeader('Content-Type', 'application/json');
    
    // リクエストボディのログ出力
    if (req.body) {
      console.log('リクエストボディ:', JSON.stringify(req.body, null, 2));
      
      // リクエストボディを文字列に変換
      const bodyData = JSON.stringify(req.body);
      // Content-Lengthヘッダーを設定
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      
      // リクエストボディを書き込む
      proxyReq.write(bodyData);
      proxyReq.end();
    }
    
    console.log('プロキシリクエストヘッダー:', {
      ...Object.fromEntries(
        Object.entries(proxyReq.getHeaders())
          .map(([key, value]) => [key, key.toLowerCase() === 'authorization' ? '***認証情報は非表示***' : value])
      )
    });
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log('Luma API応答:', {
      statusCode: proxyRes.statusCode,
      statusMessage: proxyRes.statusMessage,
      headers: proxyRes.headers
    });
    
    // レスポンスボディを収集（ログ記録用）
    let responseBody = '';
    proxyRes.on('data', (chunk) => {
      responseBody += chunk;
    });
    
    proxyRes.on('end', () => {
      try {
        const parsedBody = JSON.parse(responseBody);
        console.log('Luma API応答ボディ:', parsedBody);
        
        // レスポンスヘッダーにCORSヘッダーを追加
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');
        
      } catch (e) {
        console.log('Luma API応答ボディ (パース不可):', responseBody);
      }
    });
  },
  onError: handleProxyError
}));

// 特定のLuma生成IDの状態を取得するエンドポイント
app.use('/api/luma/:id', (req, _res, next) => {
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
  timeout: 300000, // 5分のタイムアウト設定
  proxyTimeout: 300000, // プロキシのタイムアウト設定
  pathRewrite: (path, _req) => {
    const id = path.split('/').pop();
    const newPath = `/dream-machine/v1/generations/${id}`;
    console.log(`パスの書き換え: ${path} -> ${newPath}`);
    return newPath;
  },
  onProxyReq: (proxyReq, _req, _res) => {
    if (process.env.LUMA_API_KEY) {
      proxyReq.setHeader('Authorization', `Bearer ${process.env.LUMA_API_KEY}`);
    }
    proxyReq.setHeader('Content-Type', 'application/json');
  },
  onProxyRes: (proxyRes, _req, res) => {
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
        
        // レスポンスヘッダーにCORSヘッダーを追加
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');
        
      } catch (e) {
        console.log('Luma 生成ID応答ボディ (パース不可):', responseBody);
      }
    });
  },
  onError: handleProxyError
}));

// グローバルエラーハンドラー
app.use((err: Error, _req: Request, res: Response, _next: any) => {
  console.error('サーバーエラー:', err);
  res.status(500).json({
    error: true,
    message: err.message || 'サーバー内部エラー'
  });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`LUMA_API_KEY environment variable is ${process.env.LUMA_API_KEY ? 'set' : 'not set'}`);
  if (process.env.LUMA_API_KEY) {
    console.log(`LUMA_API_KEY starts with: ${process.env.LUMA_API_KEY.substring(0, 10)}...`);
  }
  console.log('Luma API URL:', 'https://api.lumalabs.ai/dream-machine/v1/generations');
});

export default app; 