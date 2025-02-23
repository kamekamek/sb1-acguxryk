import React from 'react';
import { Upload, Image as ImageIcon, Video } from 'lucide-react';
import { analyzeWithGemini, GeminiAnalysis } from './geminiAnalysis';
import { generateLumaImage, generateLumaVideo, LumaResponse } from './lumaGeneration';

function App() {
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [analysis, setAnalysis] = React.useState<GeminiAnalysis | null>(null);
  const [generatingImage, setGeneratingImage] = React.useState(false);
  const [generatingVideo, setGeneratingVideo] = React.useState(false);
  const [generatedImage, setGeneratedImage] = React.useState<LumaResponse | null>(null);
  const [generatedVideo, setGeneratedVideo] = React.useState<LumaResponse | null>(null);
  const [pollingStatus, setPollingStatus] = React.useState<string>('');

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setUploading(true);
    setError(null);

    try {
      const result = await analyzeWithGemini(selectedFile);
      setAnalysis(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!analysis?.imagePrompt) return;

    setGeneratingImage(true);
    setError(null);

    try {
      const result = await generateLumaImage(analysis.imagePrompt);
      setGeneratedImage(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!analysis?.imagePrompt || !generatedImage?.imageUrl) return;

    setGeneratingVideo(true);
    setError(null);

    try {
      setPollingStatus('動画生成を開始しています...');
      const result = await generateLumaVideo({
        prompt: analysis.imagePrompt,
        imageUrl: generatedImage.imageUrl,
        model: 'ray-2'
      });
      
      if (result.state === 'failed') {
        throw new Error(`動画生成に失敗しました: ${result.failure_reason}`);
      }
      
      setGeneratedVideo(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGeneratingVideo(false);
      setPollingStatus('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold mb-4 text-center">音楽分析アプリ</h1>
        
        <div className="mb-4">
          <label htmlFor="file-upload" className="block w-full">
            <div className="flex items-center justify-center w-full p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-500 transition-colors">
              <Upload className="w-6 h-6 mr-2 text-gray-500" />
              <span className="text-gray-600">
                {file ? file.name : '音楽ファイルをアップロード'}
              </span>
              <input 
                id="file-upload"
                type="file" 
                accept="audio/*"
                className="hidden" 
                onChange={handleFileUpload}
              />
            </div>
          </label>
        </div>

        {uploading && (
          <div className="text-center text-gray-600">
            <div className="animate-spin inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full mb-2" />
            <p>分析中...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            {error}
          </div>
        )}

        {analysis && (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-2">ストーリー</h3>
              <p className="text-gray-800">{analysis.story}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-2">ビジュアルイメージ</h3>
              <p className="text-gray-800">{analysis.visual}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-2">感情</h3>
              <p className="text-gray-800">{analysis.emotion}</p>
              {analysis.imagePrompt && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-600 mb-2">生成プロンプト</h3>
                  <p className="text-gray-800 bg-gray-50 p-3 rounded-md font-mono text-sm">{analysis.imagePrompt}</p>
                </div>
              )}
            </div>

            {!generatingImage && !generatedImage && (
              <button
                onClick={handleGenerateImage}
                className="flex items-center justify-center w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <ImageIcon className="w-4 h-4 mr-2" />
                画像を生成
              </button>
            )}

            {generatingImage && (
              <div className="text-center text-gray-600">
                <div className="animate-spin inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full mb-2" />
                <p>画像生成中...</p>
              </div>
            )}

            {generatedImage?.state === 'completed' && generatedImage.imageUrl && (
              <div>
                <img
                  src={generatedImage.imageUrl}
                  alt="Generated artwork"
                  className="w-full h-auto rounded-lg shadow-sm mb-4"
                />
                {!generatingVideo && !generatedVideo && (
                  <button
                    onClick={handleGenerateVideo}
                    className="flex items-center justify-center w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    <Video className="w-4 h-4 mr-2" />
                    動画を生成
                  </button>
                )}
                {generatingVideo && (
                  <div className="text-center text-gray-600">
                    <div className="animate-spin inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full mb-2" />
                    <p>{pollingStatus || '動画生成中...'}</p>
                  </div>
                )}
                {generatedVideo?.state === 'completed' && generatedVideo.videoUrl && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-600 mb-2">生成された動画</h4>
                    <video
                      src={generatedVideo.videoUrl}
                      controls
                      className="w-full h-auto rounded-lg shadow-sm"
                    >
                      お使いのブラウザは動画の再生に対応していません。
                    </video>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;