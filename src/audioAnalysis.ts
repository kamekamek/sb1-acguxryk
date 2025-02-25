import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '');

export interface AudioSegment {
  startTime: number;
  endTime: number;
  blob: Blob;
}

export interface SegmentAnalysis {
  startTime: number;
  endTime: number;
  story: string;
  visual: string;
  emotion: string;
  imagePrompt: string;
}

/**
 * 音声ファイルをセグメントに分割する
 * @param audioFile 音声ファイル
 * @param segmentDuration セグメントの長さ（秒）
 * @returns 分割されたセグメントの配列
 */
export async function splitAudioIntoSegments(
  audioFile: File,
  segmentDuration: number = 30
): Promise<AudioSegment[]> {
  return new Promise((resolve, reject) => {
    const audioContext = new AudioContext();
    const fileReader = new FileReader();

    fileReader.onload = async (event) => {
      try {
        if (!event.target?.result) {
          throw new Error('ファイルの読み込みに失敗しました');
        }

        const audioData = event.target.result as ArrayBuffer;
        const audioBuffer = await audioContext.decodeAudioData(audioData);
        
        const totalDuration = audioBuffer.duration;
        const segments: AudioSegment[] = [];
        
        // セグメントに分割
        for (let startTime = 0; startTime < totalDuration; startTime += segmentDuration) {
          const endTime = Math.min(startTime + segmentDuration, totalDuration);
          
          // セグメントの抽出
          const segmentLength = (endTime - startTime) * audioBuffer.sampleRate;
          const segmentBuffer = audioContext.createBuffer(
            audioBuffer.numberOfChannels,
            segmentLength,
            audioBuffer.sampleRate
          );
          
          // チャンネルごとにデータをコピー
          for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const channelData = audioBuffer.getChannelData(channel);
            const segmentData = segmentBuffer.getChannelData(channel);
            
            const startIndex = Math.floor(startTime * audioBuffer.sampleRate);
            for (let i = 0; i < segmentLength; i++) {
              segmentData[i] = channelData[startIndex + i];
            }
          }
          
          // WAVに変換
          const offlineContext = new OfflineAudioContext(
            segmentBuffer.numberOfChannels,
            segmentBuffer.length,
            segmentBuffer.sampleRate
          );
          
          const source = offlineContext.createBufferSource();
          source.buffer = segmentBuffer;
          source.connect(offlineContext.destination);
          source.start();
          
          const renderedBuffer = await offlineContext.startRendering();
          
          // Blobに変換
          const wavBlob = await bufferToWav(renderedBuffer);
          
          segments.push({
            startTime,
            endTime,
            blob: wavBlob
          });
        }
        
        resolve(segments);
      } catch (error) {
        reject(error);
      }
    };
    
    fileReader.onerror = () => {
      reject(new Error('ファイルの読み込みに失敗しました'));
    };
    
    fileReader.readAsArrayBuffer(audioFile);
  });
}

/**
 * AudioBufferからWAV形式のBlobを生成
 * @param buffer AudioBuffer
 * @returns WAV形式のBlob
 */
async function bufferToWav(buffer: AudioBuffer): Promise<Blob> {
  const numOfChannels = buffer.numberOfChannels;
  const length = buffer.length * numOfChannels * 2;
  const sampleRate = buffer.sampleRate;
  
  // WAVヘッダーの作成
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);
  
  // "RIFF"
  view.setUint8(0, 'R'.charCodeAt(0));
  view.setUint8(1, 'I'.charCodeAt(0));
  view.setUint8(2, 'F'.charCodeAt(0));
  view.setUint8(3, 'F'.charCodeAt(0));
  
  // ファイルサイズ
  view.setUint32(4, 36 + length, true);
  
  // "WAVE"
  view.setUint8(8, 'W'.charCodeAt(0));
  view.setUint8(9, 'A'.charCodeAt(0));
  view.setUint8(10, 'V'.charCodeAt(0));
  view.setUint8(11, 'E'.charCodeAt(0));
  
  // "fmt "
  view.setUint8(12, 'f'.charCodeAt(0));
  view.setUint8(13, 'm'.charCodeAt(0));
  view.setUint8(14, 't'.charCodeAt(0));
  view.setUint8(15, ' '.charCodeAt(0));
  
  // fmtチャンクのサイズ
  view.setUint32(16, 16, true);
  
  // フォーマットタイプ（1 = PCM）
  view.setUint16(20, 1, true);
  
  // チャンネル数
  view.setUint16(22, numOfChannels, true);
  
  // サンプルレート
  view.setUint32(24, sampleRate, true);
  
  // バイトレート
  view.setUint32(28, sampleRate * numOfChannels * 2, true);
  
  // ブロックサイズ
  view.setUint16(32, numOfChannels * 2, true);
  
  // ビット深度
  view.setUint16(34, 16, true);
  
  // "data"
  view.setUint8(36, 'd'.charCodeAt(0));
  view.setUint8(37, 'a'.charCodeAt(0));
  view.setUint8(38, 't'.charCodeAt(0));
  view.setUint8(39, 'a'.charCodeAt(0));
  
  // データサイズ
  view.setUint32(40, length, true);
  
  // オーディオデータの作成
  const audioData = new Int16Array(length);
  let offset = 0;
  
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      audioData[offset++] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
  }
  
  // WAVヘッダーとオーディオデータを結合
  const wavBlob = new Blob([wavHeader, audioData], { type: 'audio/wav' });
  return wavBlob;
}

/**
 * 音声セグメントをGemini APIで分析
 * @param segment 分析する音声セグメント
 * @returns セグメントの分析結果
 */
export async function analyzeAudioSegment(segment: AudioSegment): Promise<SegmentAnalysis> {
  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
  
  // セグメントの時間情報をフォーマット
  const startTimeFormatted = formatTime(segment.startTime);
  const endTimeFormatted = formatTime(segment.endTime);
  
  const analysisPrompt = `
この音楽セグメント（${startTimeFormatted}～${endTimeFormatted}）の世界観を分析してください。

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
  
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSON形式の応答が見つかりませんでした');
    }
    
    const analysis = JSON.parse(jsonMatch[0]);
    
    if (!analysis.story || !analysis.visual || !analysis.emotion) {
      throw new Error('応答に必要な情報が含まれていません');
    }
    
    // 画像生成プロンプトの作成
    const promptGenerationPrompt = `
以下の分析結果から、画像生成AI向けの英語プロンプトを生成してください。
この音楽セグメントは${startTimeFormatted}～${endTimeFormatted}の部分です。

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

    const promptJson = JSON.parse(promptText.match(/\{[\s\S]*\}/)?.[0] || '{}');
    
    return {
      startTime: segment.startTime,
      endTime: segment.endTime,
      story: analysis.story,
      visual: analysis.visual,
      emotion: analysis.emotion,
      imagePrompt: promptJson.imagePrompt || ''
    };
  } catch (error) {
    console.error('Gemini応答のパースエラー:', error);
    throw new Error('音楽の分析に失敗しました。もう一度お試しください。');
  }
}

/**
 * 秒数を「分:秒」形式にフォーマット
 * @param seconds 秒数
 * @returns フォーマットされた時間文字列
 */
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * 音声ファイルを分割して各セグメントを分析
 * @param audioFile 音声ファイル
 * @param segmentDuration セグメントの長さ（秒）
 * @returns 各セグメントの分析結果
 */
export async function analyzeAudioFile(
  audioFile: File,
  segmentDuration: number = 30,
  onProgress?: (progress: number, total: number) => void
): Promise<SegmentAnalysis[]> {
  try {
    // 音声ファイルをセグメントに分割
    const segments = await splitAudioIntoSegments(audioFile, segmentDuration);
    const analyses: SegmentAnalysis[] = [];
    
    // 各セグメントを順番に分析
    for (let i = 0; i < segments.length; i++) {
      const analysis = await analyzeAudioSegment(segments[i]);
      analyses.push(analysis);
      
      // 進捗状況を報告
      if (onProgress) {
        onProgress(i + 1, segments.length);
      }
    }
    
    return analyses;
  } catch (error) {
    console.error('音声分析エラー:', error);
    throw error;
  }
} 