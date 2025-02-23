import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '');

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