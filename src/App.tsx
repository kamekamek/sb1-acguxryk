import React from 'react';
import { Upload, Image as ImageIcon, Video, Music, Clock } from 'lucide-react';
import { analyzeAudioFile, SegmentAnalysis } from './audioAnalysis';
import { 
  executeFullGenerationFlow, 
  GeneratedMedia, 
  LumaResponse, 
  createAudioFileUrl 
} from './lumaGeneration';

function App() {
  const [file, setFile] = React.useState<File | null>(null);
  const [segmentDuration, setSegmentDuration] = React.useState<number>(30);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [analyses, setAnalyses] = React.useState<SegmentAnalysis[]>([]);
  const [analysisProgress, setAnalysisProgress] = React.useState<{ current: number, total: number } | null>(null);
  const [generatingImages, setGeneratingImages] = React.useState(false);
  const [generatingVideo, setGeneratingVideo] = React.useState(false);
  const [generatedImages, setGeneratedImages] = React.useState<GeneratedMedia[]>([]);
  const [imageProgress, setImageProgress] = React.useState<{ current: number, total: number } | null>(null);
  const [generatedVideo, setGeneratedVideo] = React.useState<LumaResponse | null>(null);
  const [videoStatus, setVideoStatus] = React.useState<string>('');
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'analysis' | 'images' | 'video'>('analysis');

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setAudioUrl(createAudioFileUrl(selectedFile));
    setError(null);
    setAnalyses([]);
    setGeneratedImages([]);
    setGeneratedVideo(null);
    setActiveTab('analysis');
  };

  const handleAnalyzeAudio = async () => {
    if (!file) return;

    setAnalyzing(true);
    setError(null);
    setAnalyses([]);

    try {
      const results = await analyzeAudioFile(
        file, 
        segmentDuration,
        (progress, total) => setAnalysisProgress({ current: progress, total })
      );
      setAnalyses(results);
      setActiveTab('analysis');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAnalyzing(false);
      setAnalysisProgress(null);
    }
  };

  const handleGenerateMedia = async () => {
    if (!file || analyses.length === 0) return;

    setGeneratingImages(true);
    setGeneratingVideo(true);
    setError(null);

    try {
      const videoResponse = await executeFullGenerationFlow(
        file,
        analyses,
        (progress, total) => {
          setImageProgress({ current: progress, total });
          if (progress === total) {
            setGeneratingImages(false);
          }
        },
        (status) => setVideoStatus(status)
      );
      
      setGeneratedVideo(videoResponse);
      setActiveTab('video');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGeneratingImages(false);
      setGeneratingVideo(false);
      setImageProgress(null);
      setVideoStatus('');
    }
  };

  const renderAnalysisTab = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">音声分析結果</h2>
      
      {analyses.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 rounded-lg">
          <p className="text-gray-500">分析結果がありません。音声ファイルを分析してください。</p>
        </div>
      ) : (
        <div className="space-y-6">
          {analyses.map((segment, index) => (
            <div key={index} className="border rounded-lg p-4 bg-white shadow-sm">
              <h3 className="text-md font-medium mb-2">
                セグメント {index + 1}: {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-600 mb-1">ストーリー</h4>
                  <p className="text-sm text-gray-800">{segment.story}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-600 mb-1">ビジュアル</h4>
                  <p className="text-sm text-gray-800">{segment.visual}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-600 mb-1">感情</h4>
                  <p className="text-sm text-gray-800">{segment.emotion}</p>
                </div>
              </div>
              <div className="mt-3">
                <h4 className="text-sm font-medium text-gray-600 mb-1">画像生成プロンプト</h4>
                <p className="text-xs bg-gray-50 p-2 rounded font-mono">{segment.imagePrompt}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderImagesTab = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">生成された画像</h2>
      
      {generatedImages.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 rounded-lg">
          <p className="text-gray-500">生成された画像がありません。「メディアを生成」ボタンをクリックしてください。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {generatedImages.map((item, index) => (
            item.imageResponse.state === 'completed' && item.imageResponse.imageUrl && (
              <div key={index} className="border rounded-lg overflow-hidden bg-white shadow-sm">
                <img 
                  src={item.imageResponse.imageUrl} 
                  alt={`Generated image ${index + 1}`}
                  className="w-full h-48 object-cover"
                />
                <div className="p-3">
                  <p className="text-sm font-medium">
                    {formatTime(item.startTime)} - {formatTime(item.endTime)}
                  </p>
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );

  const renderVideoTab = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">生成された動画</h2>
      
      {!generatedVideo || generatedVideo.state !== 'completed' || !generatedVideo.videoUrl ? (
        <div className="text-center p-8 bg-gray-50 rounded-lg">
          <p className="text-gray-500">生成された動画がありません。「メディアを生成」ボタンをクリックしてください。</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
          <video
            src={generatedVideo.videoUrl}
            controls
            className="w-full h-auto"
          >
            お使いのブラウザは動画の再生に対応していません。
          </video>
          <div className="p-4">
            <h3 className="text-lg font-medium mb-2">最終動画</h3>
            <p className="text-sm text-gray-600">
              {analyses.length}個のセグメントから生成された動画です。
            </p>
            {audioUrl && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">元の音声</h4>
                <audio src={audioUrl} controls className="w-full" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // 秒数を「分:秒」形式にフォーマット
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold mb-6 text-center">音声から動画生成システム</h1>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-end gap-4 mb-4">
            <div className="flex-1">
              <label htmlFor="file-upload" className="block w-full">
                <div className="flex items-center justify-center w-full p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-500 transition-colors">
                  <Music className="w-6 h-6 mr-2 text-gray-500" />
                  <span className="text-gray-600">
                    {file ? file.name : '音声ファイルをアップロード'}
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
            
            <div className="w-full md:w-64">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                セグメント長（秒）
              </label>
              <div className="flex items-center">
                <Clock className="w-5 h-5 mr-2 text-gray-500" />
                <input
                  type="number"
                  min="10"
                  max="120"
                  value={segmentDuration}
                  onChange={(e) => setSegmentDuration(Number(e.target.value))}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            
            <button
              onClick={handleAnalyzeAudio}
              disabled={!file || analyzing}
              className="w-full md:w-auto bg-indigo-600 text-white py-2 px-6 rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {analyzing ? '分析中...' : '音声を分析'}
            </button>
          </div>
          
          {analyzing && analysisProgress && (
            <div className="mb-4">
              <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-600 transition-all duration-300"
                  style={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 mt-1 text-center">
                分析中: {analysisProgress.current} / {analysisProgress.total} セグメント
              </p>
            </div>
          )}
          
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
              <strong className="font-bold">エラー: </strong>
              <span className="block sm:inline">{error}</span>
            </div>
          )}
          
          {analyses.length > 0 && (
            <div className="flex justify-center">
              <button
                onClick={handleGenerateMedia}
                disabled={generatingImages || generatingVideo}
                className="bg-green-600 text-white py-2 px-6 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {generatingImages || generatingVideo ? 'メディア生成中...' : 'メディアを生成'}
              </button>
            </div>
          )}
          
          {(generatingImages || generatingVideo) && (
            <div className="mt-4">
              {imageProgress && (
                <div className="mb-2">
                  <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-600 transition-all duration-300"
                      style={{ width: `${(imageProgress.current / imageProgress.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-600 mt-1 text-center">
                    画像生成: {imageProgress.current} / {imageProgress.total}
                  </p>
                </div>
              )}
              
              {videoStatus && (
                <p className="text-sm text-gray-600 text-center">{videoStatus}</p>
              )}
            </div>
          )}
        </div>
        
        {analyses.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex border-b mb-6">
              <button
                className={`px-4 py-2 font-medium ${activeTab === 'analysis' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('analysis')}
              >
                分析結果
              </button>
              <button
                className={`px-4 py-2 font-medium ${activeTab === 'images' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('images')}
              >
                生成画像
              </button>
              <button
                className={`px-4 py-2 font-medium ${activeTab === 'video' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('video')}
              >
                生成動画
              </button>
            </div>
            
            {activeTab === 'analysis' && renderAnalysisTab()}
            {activeTab === 'images' && renderImagesTab()}
            {activeTab === 'video' && renderVideoTab()}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;