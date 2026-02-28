'use client';

import { useCallback, useState, useEffect } from 'react';
import { GEMINI_MODELS } from '@/lib/gemini';
import { generateThumbnail, compressImage } from '@/lib/image';
import ImageToImageUploader from '@/components/ImageToImageUploader';

const DEFAULT_MODEL = GEMINI_MODELS[0].id;

const RESOLUTIONS_BASE = [
    { id: '1K', name: '1K' },
    { id: '2K', name: '2K' },
    { id: '4K', name: '4K' },
];

const RESOLUTION_512 = { id: '512px', name: '512px' };

const ASPECT_RATIOS_BASE = [
    { id: '1:1', name: '1:1' },
    { id: '4:3', name: '4:3' },
    { id: '16:9', name: '16:9' },
    { id: '3:4', name: '3:4' },
    { id: '9:16', name: '9:16' },
];

const EXTRA_RATIOS_FLASH = [
    { id: '1:4', name: '1:4' },
    { id: '1:8', name: '1:8' },
    { id: '4:1', name: '4:1' },
    { id: '8:1', name: '8:1' },
];

export default function Home() {
    const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');
    const [activeMode, setActiveMode] = useState<'text2img' | 'img2img'>('text2img');
    const [apiKey, setApiKey] = useState('');
    const [prompt, setPrompt] = useState('');
    const [uploadedImages, setUploadedImages] = useState<Array<{ data: string; mimeType: string }>>([]);
    const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
    const [selectedRatio, setSelectedRatio] = useState('1:1');
    const [selectedResolution, setSelectedResolution] = useState('1K');
    const [isGenerating, setIsGenerating] = useState(false);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [isServerKeyConfigured, setIsServerKeyConfigured] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isFlashModel = selectedModel === 'gemini-3.1-flash-image-preview';
    const ASPECT_RATIOS = isFlashModel ? [...ASPECT_RATIOS_BASE, ...EXTRA_RATIOS_FLASH] : ASPECT_RATIOS_BASE;
    const RESOLUTIONS = isFlashModel ? [RESOLUTION_512, ...RESOLUTIONS_BASE] : RESOLUTIONS_BASE;
    const maxImages = isFlashModel ? 3 : 14;

    useEffect(() => {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) setApiKey(savedKey);

        const checkServerKey = async () => {
            try {
                const res = await fetch('/api/gemini');
                const data = await res.json();
                if (data.success) {
                    setIsServerKeyConfigured(true);
                }
            } catch { }
        };
        checkServerKey();
    }, []);

    const handleGenerate = async () => {
        if (!apiKey && !isServerKeyConfigured) {
            setShowApiKeyModal(true);
            return;
        }
        if (!prompt.trim()) {
            setError('请输入提示词 / Please enter a prompt');
            return;
        }
        if (activeMode === 'img2img' && uploadedImages.length === 0) {
            setError('请上传至少一张参考图 / Please upload at least one image');
            return;
        }
        setIsGenerating(true);
        setError(null);
        try {
            const requestHeaders: HeadersInit = { 'Content-Type': 'application/json' };
            if (apiKey) requestHeaders['x-api-key'] = apiKey;

            const body = {
                model: selectedModel,
                prompt: prompt.trim(),
                mode: activeMode,
                aspectRatio: selectedRatio,
                imageSize: selectedResolution,
                ...(activeMode === 'img2img' && { images: uploadedImages })
            };

            const res = await fetch('/api/gemini', {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify(body),
            });

            const data = await res.json();
            if (data.success) {
                setResultImage(data.images[0].data);
            } else {
                setError(data.error || 'Generate Failed');
            }
        } catch (err: any) {
            setError(err.message || 'Request Failed');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center py-8 px-6 font-sans text-gray-800">

            {/* Top Toggle */}
            <div className="bg-white p-1 rounded-full shadow-sm border border-gray-100 flex items-center mb-6">
                <button
                    onClick={() => setActiveTab('generate')}
                    className={`px-6 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'generate' ? 'bg-[#EEF2FF] text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                    Create
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-6 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'history' ? 'bg-[#EEF2FF] text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                    History
                </button>
            </div>

            {activeTab === 'generate' && (
                <div className="w-full max-w-[1300px] flex gap-6 h-[calc(100vh-140px)]">
                    {/* Settings Panel */}
                    <div className="w-[360px] bg-white rounded-3xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col gap-6 overflow-y-auto custom-scrollbar flex-shrink-0">
                        <div className="flex items-center gap-2 text-gray-800 font-semibold text-lg">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-500"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
                            Settings
                        </div>

                        {/* Mode Toggle */}
                        <div className="bg-gray-50 p-1 rounded-xl flex">
                            <button
                                onClick={() => setActiveMode('text2img')}
                                className={`flex-1 flex justify-center items-center gap-2 py-2.5 text-xs font-semibold rounded-lg transition-all ${activeMode === 'text2img' ? 'bg-white shadow-sm text-gray-900 border border-gray-100' : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                                Text to Image
                            </button>
                            <button
                                onClick={() => setActiveMode('img2img')}
                                className={`flex-1 flex justify-center items-center gap-2 py-2.5 text-xs font-semibold rounded-lg transition-all ${activeMode === 'img2img' ? 'bg-white shadow-sm text-gray-900 border border-gray-100' : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                                Image to Image
                            </button>
                        </div>

                        {/* Model Select */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-semibold text-gray-600">Model</label>
                            <div className="relative">
                                <select
                                    value={selectedModel}
                                    onChange={(e) => {
                                        setSelectedModel(e.target.value);
                                        const switchingToFlash = e.target.value === 'gemini-3.1-flash-image-preview';
                                        const flashOnlyRatios = ['4:1', '1:4', '8:1', '1:8'];
                                        if (!switchingToFlash && flashOnlyRatios.includes(selectedRatio)) setSelectedRatio('1:1');
                                        if (!switchingToFlash && selectedResolution === '512px') setSelectedResolution('1K');
                                    }}
                                    className="w-full appearance-none bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                                >
                                    {GEMINI_MODELS.map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </select>
                                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-500">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                                </div>
                            </div>
                        </div>

                        {/* Prompt */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-semibold text-gray-600">Prompt</label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="Describe the image you want to generate in detail..."
                                className="w-full h-32 resize-none bg-[#FAFAFA] border border-gray-200 rounded-xl p-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white focus:border-indigo-400"
                            />
                        </div>

                        {/* Image to Image Uploader */}
                        {activeMode === 'img2img' && (
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-semibold text-gray-600">Reference Images</label>
                                <ImageToImageUploader
                                    onImagesReady={setUploadedImages}
                                    currentImages={uploadedImages}
                                    maxImages={maxImages}
                                />
                            </div>
                        )}

                        {/* Resolution */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-semibold text-gray-600">Resolution</label>
                            <div className="flex flex-wrap gap-2">
                                {RESOLUTIONS.map(r => (
                                    <button
                                        key={r.id}
                                        onClick={() => setSelectedResolution(r.id)}
                                        className={`flex-1 py-2 text-xs font-semibold rounded-full border transition-colors ${selectedResolution === r.id
                                            ? 'bg-[#EEF2FF] border-indigo-200 text-indigo-600'
                                            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                            }`}
                                    >
                                        {r.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Aspect Ratio */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-semibold text-gray-600">Aspect Ratio</label>
                            <div className="grid grid-cols-5 gap-2">
                                {ASPECT_RATIOS.slice(0, 5).map(r => (
                                    <button
                                        key={r.id}
                                        onClick={() => setSelectedRatio(r.id)}
                                        className={`py-2 text-xs font-semibold rounded-full border transition-colors ${selectedRatio === r.id
                                            ? 'bg-[#EEF2FF] border-indigo-200 text-indigo-600'
                                            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                            }`}
                                    >
                                        {r.name}
                                    </button>
                                ))}
                            </div>
                            {ASPECT_RATIOS.length > 5 && (
                                <div className="grid grid-cols-4 gap-2 mt-1">
                                    {ASPECT_RATIOS.slice(5).map(r => (
                                        <button
                                            key={r.id}
                                            onClick={() => setSelectedRatio(r.id)}
                                            className={`py-2 text-xs font-semibold rounded-full border transition-colors ${selectedRatio === r.id
                                                ? 'bg-[#EEF2FF] border-indigo-200 text-indigo-600'
                                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                                }`}
                                        >
                                            {r.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* API Key */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-semibold text-gray-600">API Key</label>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => {
                                    setApiKey(e.target.value);
                                    if (e.target.value) {
                                        localStorage.setItem('gemini_api_key', e.target.value);
                                    } else {
                                        localStorage.removeItem('gemini_api_key');
                                    }
                                }}
                                placeholder="Enter Gemini API Key (Optional if server configured)"
                                className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
                            />
                        </div>

                        <div className="mt-auto pt-4 border-t border-gray-100 flex flex-col gap-3">
                            {error && <div className="text-red-500 text-xs text-center">{error}</div>}
                            {(!apiKey && !isServerKeyConfigured) ? (
                                <button
                                    onClick={() => setShowApiKeyModal(true)}
                                    className="w-full py-4 bg-[#FF9500] hover:bg-[#F58D00] text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
                                    Connect API Key
                                </button>
                            ) : (
                                <button
                                    disabled={isGenerating}
                                    onClick={handleGenerate}
                                    className={`w-full py-4 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition-colors ${isGenerating ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
                                    {isGenerating ? 'Generating...' : 'Generate Image'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Main Canvas Area */}
                    <div className="flex-1 bg-white rounded-[32px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-gray-100 overflow-hidden relative flex flex-col items-center justify-center p-8">
                        {resultImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={resultImage} alt="Generated result" className="max-w-full max-h-full object-contain rounded-xl shadow-lg" />
                        ) : isGenerating ? (
                            <div className="flex flex-col items-center gap-4 text-gray-400">
                                <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"></div>
                                <p className="text-sm">Creating your masterpiece...</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-4 text-gray-400">
                                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-2">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                                </div>
                                <p className="text-[15px]">Your generated image will appear here</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'history' && (
                <div className="w-full max-w-[1300px] flex gap-6 h-[calc(100vh-140px)] bg-white rounded-3xl p-8 border border-gray-100 shadow-sm flex flex-col items-center justify-center text-gray-500">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-4 text-gray-300"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                    <p>History log is not available in light layout mode yet.</p>
                </div>
            )}

            {/* API Key Modal */}
            {showApiKeyModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
                        <h3 className="text-xl font-bold mb-4">API Key Required</h3>
                        <p className="text-gray-600 text-sm mb-4">Please enter your Google Gemini API Key to continue generation.</p>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={e => setApiKey(e.target.value)}
                            placeholder="Enter API Key"
                            className="w-full border border-gray-300 rounded-lg p-3 mb-6 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setShowApiKeyModal(false)} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Cancel</button>
                            <button
                                onClick={() => {
                                    localStorage.setItem('gemini_api_key', apiKey);
                                    setShowApiKeyModal(false);
                                }}
                                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
