import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { 
  generateLumaImage, 
  LumaResponse, 
  ImageGenerationOptions,
  pollGenerationStatus
} from './lumaGeneration';

function App() {
  const [prompt, setPrompt] = React.useState<string>('');
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = React.useState<LumaResponse | null>(null);

  const handleGenerateImage = async () => {
    if (!prompt.trim()) {
      setError('プロンプトを入力してください');
      return;
    }

    setGenerating(true);
    setError(null);
    setGeneratedImage(null);

    try {
      const options: ImageGenerationOptions = {
        prompt: prompt,
        aspect_ratio: '16:9',
        model: 'photon-1'
      };

      const response = await generateLumaImage(options);
      
      if (response.state === 'failed') {
        throw new Error(response.failure_reason || '画像生成に失敗しました');
      }
      
      // 生成が完了するまでポーリング
      if (response.state === 'pending' || response.state === 'processing') {
        const finalResponse = await pollGenerationStatus(response.id);
        setGeneratedImage(finalResponse);
      } else {
        setGeneratedImage(response);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-800">画像生成アプリ</h1>
          <p className="text-gray-600 mt-2">Luma APIを使用して画像を生成します</p>
        </header>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="mb-4">
            <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-1">
              プロンプト
            </label>
            <textarea
              id="prompt"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="生成したい画像の詳細な説明を入力してください..."
            />
          </div>

          <button
            onClick={handleGenerateImage}
            disabled={generating || !prompt.trim()}
            className={`w-full py-2 px-4 rounded-md flex items-center justify-center ${
              generating || !prompt.trim()
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {generating ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                生成中...
              </>
            ) : (
              <>
                <ImageIcon className="mr-2 h-5 w-5" />
                画像を生成
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {generatedImage && generatedImage.imageUrl && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">生成された画像</h2>
            <div className="overflow-hidden rounded-lg">
              <img 
                src={generatedImage.imageUrl} 
                alt="生成された画像" 
                className="w-full object-cover"
              />
            </div>
            <div className="mt-4 text-sm text-gray-600">
              <p><strong>プロンプト:</strong> {prompt}</p>
              <p><strong>生成ID:</strong> {generatedImage.id}</p>
              <p><strong>ステータス:</strong> {generatedImage.state}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;