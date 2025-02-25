import { GoogleGenerativeAI } from '@google/generative-ai';
import { SegmentAnalysis } from './audioAnalysis';

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
  keyframes: {
    [key: string]: {
      type: string;
      url: string;
      timing?: number;
    }
  };
  model?: string;
  audioUrl?: string;
}

export interface ImageGenerationOptions {
  prompt: string;
  aspect_ratio?: string;
  model?: string;
}

export interface GeneratedMedia {
  segmentIndex: number;
  startTime: number;
  endTime: number;
  imageResponse: LumaResponse;
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

/**
 * Luma APIの生成状態をポーリングする
 * @param id 生成ID
 * @returns 生成結果
 */
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
      let errorMessage = '生成状態の取得に失敗しました';
      let errorData;
      
      try {
        errorData = await response.json();
        console.error('APIエラーレスポンス:', errorData);
        
        if (errorData.detail === 'Insufficient credits') {
          errorMessage = 'Luma APIのクレジットが不足しています。APIキーの利用枠を確認してください。';
        } else {
          errorMessage = errorData.detail || errorData.message || errorMessage;
        }
      } catch (jsonError) {
        // JSONのパースに失敗した場合はステータステキストを使用
        errorMessage = `生成状態の取得に失敗しました (${response.status}: ${response.statusText})`;
      }
      
      return {
        id: id,
        state: 'failed',
        failure_reason: errorMessage
      };
    }

    const status = await response.json();
    console.log('Generation status:', status);

    if (status.state === 'completed') {
      completed = true;
      return {
        id: status.id,
        state: 'completed',
        imageUrl: status.assets?.video_0_thumb || status.assets?.image,
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

/**
 * Luma APIで画像を生成する
 * @param options 画像生成オプション
 * @returns 生成結果
 */
export async function generateLumaImage(options: ImageGenerationOptions): Promise<LumaResponse> {
  try {
    const response = await fetch('/api/luma', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_LUMA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: options.prompt,
        aspect_ratio: options.aspect_ratio || '16:9',
        model: options.model || 'ray-2'
      })
    });

    if (!response.ok) {
      let errorMessage = '画像生成リクエストに失敗しました';
      let errorData;
      
      try {
        errorData = await response.json();
        console.error('APIエラーレスポンス:', errorData);
        
        if (errorData.detail === 'Insufficient credits') {
          errorMessage = 'Luma APIのクレジットが不足しています。APIキーの利用枠を確認してください。';
        } else {
          errorMessage = errorData.detail || errorData.message || errorMessage;
        }
      } catch (jsonError) {
        // JSONのパースに失敗した場合はステータステキストを使用
        errorMessage = `画像生成リクエストに失敗しました (${response.status}: ${response.statusText})`;
      }
      
      return {
        id: 'error',
        state: 'failed',
        failure_reason: errorMessage
      };
    }

    const generation = await response.json();
    console.log('Image generation response:', generation);
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

/**
 * Luma APIで動画を生成する
 * @param options 動画生成オプション
 * @returns 生成結果
 */
export async function generateLumaVideo(options: VideoGenerationOptions): Promise<LumaResponse> {
  try {
    const requestBody: any = {
      prompt: options.prompt,
      model: options.model || 'ray-2',
      keyframes: options.keyframes
    };

    if (options.audioUrl) {
      requestBody.audio = { url: options.audioUrl };
    }

    console.log('Video generation request:', requestBody);

    const response = await fetch('/api/luma', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_LUMA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      let errorMessage = '動画生成リクエストに失敗しました';
      let errorData;
      
      try {
        errorData = await response.json();
        console.error('APIエラーレスポンス:', errorData);
        
        if (errorData.detail === 'Insufficient credits') {
          errorMessage = 'Luma APIのクレジットが不足しています。APIキーの利用枠を確認してください。';
        } else {
          errorMessage = errorData.detail || errorData.message || errorMessage;
        }
      } catch (jsonError) {
        // JSONのパースに失敗した場合はステータステキストを使用
        errorMessage = `動画生成リクエストに失敗しました (${response.status}: ${response.statusText})`;
      }
      
      return {
        id: 'error',
        state: 'failed',
        failure_reason: errorMessage
      };
    }

    const generation = await response.json();
    console.log('Video generation response:', generation);
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

/**
 * 複数の画像を並列で生成する
 * @param analyses セグメント分析結果の配列
 * @param onProgress 進捗状況のコールバック
 * @returns 生成された画像の配列
 */
export async function generateImagesInParallel(
  analyses: SegmentAnalysis[],
  onProgress?: (progress: number, total: number) => void
): Promise<GeneratedMedia[]> {
  const batchSize = 3; // 同時に生成する画像の数
  const results: GeneratedMedia[] = [];
  const errors: {index: number, error: any}[] = [];
  
  for (let i = 0; i < analyses.length; i += batchSize) {
    const batch = analyses.slice(i, i + batchSize);
    const batchPromises = batch.map((analysis, index) => {
      return generateLumaImage({
        prompt: analysis.imagePrompt,
        aspect_ratio: '16:9',
        model: 'ray-2'
      })
      .then(response => {
        return {
          segmentIndex: i + index,
          startTime: analysis.startTime,
          endTime: analysis.endTime,
          imageResponse: response
        };
      })
      .catch(error => {
        console.error(`セグメント ${i + index} の画像生成に失敗:`, error);
        errors.push({index: i + index, error});
        // エラーが発生しても処理を続行するために、失敗状態のレスポンスを返す
        return {
          segmentIndex: i + index,
          startTime: analysis.startTime,
          endTime: analysis.endTime,
          imageResponse: {
            id: `error-${i + index}`,
            state: 'failed',
            failure_reason: error instanceof Error ? error.message : '不明なエラー'
          }
        };
      });
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    if (onProgress) {
      onProgress(Math.min(i + batchSize, analyses.length), analyses.length);
    }
  }
  
  // エラーの概要をログに出力
  if (errors.length > 0) {
    console.warn(`${errors.length}個のセグメントで画像生成に失敗しました`);
  }
  
  return results.sort((a, b) => a.segmentIndex - b.segmentIndex);
}

/**
 * 生成された画像から動画を作成する
 * @param generatedImages 生成された画像の配列
 * @param audioUrl 音声ファイルのURL（オプション）
 * @param overallPrompt 全体的なプロンプト
 * @returns 生成された動画
 */
export async function createVideoFromImages(
  generatedImages: GeneratedMedia[],
  audioUrl?: string,
  overallPrompt?: string
): Promise<LumaResponse> {
  // 失敗した画像生成をフィルタリング
  const successfulImages = generatedImages.filter(
    img => img.imageResponse.state === 'completed' && img.imageResponse.imageUrl
  );
  
  if (successfulImages.length === 0) {
    throw new Error('有効な画像がありません。すべての画像生成に失敗しました。');
  }
  
  // 成功した画像が少なすぎる場合は警告を表示
  if (successfulImages.length < generatedImages.length * 0.5) {
    console.warn(`警告: 生成された画像の${Math.round((1 - successfulImages.length / generatedImages.length) * 100)}%が失敗しました。動画の品質が低下する可能性があります。`);
  }
  
  // キーフレームの作成
  const keyframes: Record<string, any> = {};
  
  successfulImages.forEach((img, index) => {
    if (img.imageResponse.imageUrl) {
      keyframes[`frame${index}`] = {
        type: 'image',
        url: img.imageResponse.imageUrl,
        timing: img.startTime
      };
    }
  });
  
  // 動画の生成
  const defaultPrompt = "Create a smooth video transition between these images, maintaining the visual style and atmosphere";
  
  return await generateLumaVideo({
    prompt: overallPrompt || defaultPrompt,
    keyframes: keyframes,
    model: 'ray-2',
    audioUrl
  });
}

/**
 * 音声ファイルのURLを作成する（一時的なもの）
 * @param audioFile 音声ファイル
 * @returns 音声ファイルのURL
 */
export function createAudioFileUrl(audioFile: File): string {
  return URL.createObjectURL(audioFile);
}

/**
 * 完全な音声から動画生成フローを実行する
 * @param audioFile 音声ファイル
 * @param analyses セグメント分析結果の配列
 * @param onImageProgress 画像生成の進捗状況
 * @param onVideoProgress 動画生成の進捗状況
 * @returns 生成された動画
 */
export async function executeFullGenerationFlow(
  audioFile: File,
  analyses: SegmentAnalysis[],
  onImageProgress?: (progress: number, total: number) => void,
  onVideoProgress?: (state: string) => void
): Promise<LumaResponse> {
  try {
    // 1. 並列で画像を生成
    if (onVideoProgress) onVideoProgress('画像の生成を開始しています...');
    const generatedImages = await generateImagesInParallel(analyses, onImageProgress);
    
    // 2. 音声ファイルのURLを作成
    const audioUrl = createAudioFileUrl(audioFile);
    
    // 3. 全体的なプロンプトの作成
    const overallPrompt = `Create a cinematic video that flows smoothly between scenes, 
    maintaining the visual style and atmosphere of each image. 
    The transitions should be smooth and natural, following the rhythm and mood of the music.`;
    
    // 4. 画像から動画を生成
    if (onVideoProgress) onVideoProgress('動画の生成を開始しています...');
    const videoResponse = await createVideoFromImages(generatedImages, audioUrl, overallPrompt);
    
    if (videoResponse.state === 'failed') {
      throw new Error(`動画生成に失敗しました: ${videoResponse.failure_reason}`);
    }
    
    if (onVideoProgress) onVideoProgress('動画の生成が完了しました');
    return videoResponse;
  } catch (error) {
    console.error('生成フローエラー:', error);
    throw error;
  }
}