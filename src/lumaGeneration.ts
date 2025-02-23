import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '');

export interface LumaResponse {
  id: string;
  state: 'pending' | 'processing' | 'completed' | 'failed';
  imageUrl?: string;
  videoUrl?: string;
  failure_reason?: string;
}

export interface VideoGenerationOptions {
  prompt: string;
  imageUrl: string;
  model?: string;
}

export interface GeminiAnalysis {
  story: string;
  visual: string;
  emotion: string;
  imagePrompt?: string;
}

export async function analyzeWithGemini(file: File): Promise<GeminiAnalysis> {
  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

  const fileName = file.name;

  const analysisPrompt = `
この音楽ファイル "${fileName}" の世界観を分析してください。

以下の3つの観点から分析して、それぞれ日本語で200文字程度で説明してください：

1. ストーリー/シーン描写：この音楽が表現している物語や情景
2. ビジュアルイメージ：色彩、光、空間、質感などの視覚的な要素
3. 感情表現：この音楽が喚起する感情や心理状態

必ず以下のJSON形式で回答してください：

{
  "story": "ストーリーの説明を200文字程度で",
  "visual": "ビジュアルイメージの説明を200文字程度で",
  "emotion": "感情表現の説明を200文字程度で"
}

注意：
- 必ずJSON形式で返してください
- 各説明は200文字程度にしてください
- 改行を含めないでください`;

  const result = await model.generateContent(analysisPrompt);
  const response = await result.response;
  const text = response.text();
  
  console.log('=== Gemini Analysis Log ===');
  console.log('Analysis Prompt:', analysisPrompt);
  console.log('Raw Response:', text);
  
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSON形式の応答が見つかりませんでした');
    }
    
    const analysis = JSON.parse(jsonMatch[0]);
    
    if (!analysis.story || !analysis.visual || !analysis.emotion) {
      throw new Error('応答に必要な情報が含まれていません');
    }
    
    console.log('=== Analysis Complete ===');

    const promptGenerationPrompt = `
以下の分析結果から、画像生成AI向けの英語プロンプトを生成してください。

分析結果:
${JSON.stringify(analysis, null, 2)}

以下の要素を含む、自然な英語の文章を1つ作成してください：
- 色合い
- 風景/シーン
- 感情
- 光の強さや陰影

必ず以下のJSON形式で返してください：

{
  "imagePrompt": "生成された英語プロンプト"
}`;

    const promptResult = await model.generateContent(promptGenerationPrompt);
    const promptResponse = await promptResult.response;
    const promptText = promptResponse.text();

    console.log('=== Prompt Generation Log ===');
    console.log('Prompt Generation Request:', promptGenerationPrompt);
    console.log('Raw Response:', promptText);

    const promptJson = JSON.parse(promptText.match(/\{[\s\S]*\}/)?.[0] || '{}');
    console.log('Generated Image Prompt:', promptJson);

    return {
      ...analysis,
      imagePrompt: promptJson.imagePrompt
    };

  } catch (error) {
    console.error('Gemini応答のパースエラー:', error);
    throw new Error('音楽の分析に失敗しました。もう一度お試しください。');
  }
}

async function pollGenerationStatus(id: string): Promise<LumaResponse> {
  let completed = false;
  let attempts = 0;
  const maxAttempts = 30;
  const pollingInterval = 2000;

  while (!completed && attempts < maxAttempts) {
    const response = await fetch(`/api/luma/${id}`, {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_LUMA_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('生成状態の取得に失敗しました');
    }

    const status = await response.json();

    if (status.state === 'completed') {
      completed = true;
      return {
        id: status.id,
        state: 'completed',
        imageUrl: status.assets?.image,
        videoUrl: status.assets?.video
      };
    } else if (status.state === 'failed') {
      return {
        id: status.id,
        state: 'failed',
        failure_reason: status.failure_reason
      };
    }

    await new Promise(r => setTimeout(r, pollingInterval));
    attempts++;
  }

  throw new Error('生成がタイムアウトしました');
}

export async function generateLumaImage(prompt: string): Promise<LumaResponse> {
  try {
    const response = await fetch('/api/luma', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_LUMA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt,
        aspect_ratio: '1:1',
        model: 'photon-1'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '画像生成リクエストに失敗しました');
    }

    const generation = await response.json();
    return await pollGenerationStatus(generation.id);
  } catch (error) {
    console.error('画像生成エラー:', error);
    return {
      id: 'unknown',
      state: 'failed',
      failure_reason: error instanceof Error ? error.message : '不明なエラー'
    };
  }
}

export async function generateLumaVideo(options: VideoGenerationOptions): Promise<LumaResponse> {
  try {
    const response = await fetch('/api/luma', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_LUMA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: options.prompt,
        model: options.model || 'ray-2',
        keyframes: {
          frame0: {
            type: 'image',
            url: options.imageUrl
          }
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '動画生成リクエストに失敗しました');
    }

    const generation = await response.json();
    return await pollGenerationStatus(generation.id);
  } catch (error) {
    console.error('動画生成エラー:', error);
    return {
      id: 'unknown',
      state: 'failed',
      failure_reason: error instanceof Error ? error.message : '不明なエラー'
    };
  }
}