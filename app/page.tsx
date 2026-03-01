'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { GEMINI_MODELS, ASPECT_RATIOS as ALL_ASPECT_RATIOS, RESOLUTIONS as ALL_RESOLUTIONS } from '@/lib/gemini';
import { generateThumbnail, compressImage } from '@/lib/image';
import ImageToImageUploader from '@/components/ImageToImageUploader';
import OutpaintEditor, { OutpaintEditorHandle } from '@/components/OutpaintEditor';

const DEFAULT_MODEL = GEMINI_MODELS[0].id;

type GenerateMode = 'text2img' | 'img2img' | 'outpaint';

interface HistoryItem {
    id: string;
    timestamp: number;
    prompt: string;
    mode: 'text2img' | 'img2img' | 'outpaint';
    model: string;
    imageUrl: string;
    thumbnailUrl?: string;
    inputImageUrls?: string[];
    aspectRatio?: string;
}

interface GenerateRequestBody {
    model: string;
    prompt: string;
    mode: GenerateMode;
    aspectRatio: string;
    imageSize: string;
    images?: Array<{ data: string; mimeType: string }>;
}

const FLASH_ONLY_RATIOS = new Set(['4:1', '1:4', '8:1', '1:8']);

export default function Home() {
    const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');
    const [activeMode, setActiveMode] = useState<GenerateMode>('text2img');
    const [apiKey, setApiKey] = useState('');
    const [prompt, setPrompt] = useState('');
    const [uploadedImages, setUploadedImages] = useState<Array<{ data: string; mimeType: string }>>([]);
    const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
    const [selectedRatio, setSelectedRatio] = useState('1:1');
    const [selectedResolution, setSelectedResolution] = useState('1K');
    const [isGenerating, setIsGenerating] = useState(false);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [outpaintComposite, setOutpaintComposite] = useState<string | null>(null);
    const [outpaintOriginal, setOutpaintOriginal] = useState<string | null>(null);
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [isServerKeyConfigured, setIsServerKeyConfigured] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
    const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);

    const outpaintEditorRef = useRef<OutpaintEditorHandle | null>(null);

    const isFlashModel = selectedModel === 'gemini-3.1-flash-image-preview';
    const ASPECT_RATIOS = ALL_ASPECT_RATIOS.filter(r => isFlashModel || !FLASH_ONLY_RATIOS.has(r.id));
    const RESOLUTIONS = ALL_RESOLUTIONS.filter(r => isFlashModel || r.id !== '512px');
    const maxImages = GEMINI_MODELS.find(m => m.id === selectedModel)?.maxImages ?? 14;
    const ratioOptions = activeMode === 'outpaint' ? ASPECT_RATIOS.filter(r => r.id !== 'auto') : ASPECT_RATIOS;

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

    useEffect(() => {
        setError(null);
        if (activeMode !== 'img2img') setUploadedImages([]);
        if (activeMode !== 'outpaint') {
            setOutpaintComposite(null);
            setOutpaintOriginal(null);
        }
    }, [activeMode]);

    useEffect(() => {
        if (activeMode === 'outpaint' && selectedRatio === 'auto') setSelectedRatio('1:1');
    }, [activeMode, selectedRatio]);

    const loadHistory = useCallback(async () => {
        if (!apiKey) {
            setHistory([]);
            setHistoryError('请输入 API Key 后查看历史记录');
            return;
        }

        setHistoryLoading(true);
        setHistoryError(null);
        try {
            const res = await fetch('/api/history', {
                headers: {
                    'x-api-key': apiKey,
                },
            });
            const data = await res.json();
            if (data.success) {
                setHistory(data.history || []);
            } else {
                setHistoryError(data.error || '获取历史记录失败');
            }
        } catch (err: unknown) {
            setHistoryError(err instanceof Error ? err.message : '获取历史记录失败');
        } finally {
            setHistoryLoading(false);
        }
    }, [apiKey]);

    useEffect(() => {
        if (activeTab === 'history') {
            loadHistory();
        }
    }, [activeTab, loadHistory]);

    const saveToHistory = useCallback(async (generatedDataUrl: string) => {
        if (!apiKey) return;
        try {
            const thumbnailData = await generateThumbnail(generatedDataUrl, 220);

            const requestHeaders: HeadersInit = { 'Content-Type': 'application/json', 'x-api-key': apiKey };

            let inputImagesData: string[] = [];
            let inputImageMimeType: string | undefined;
            if (activeMode === 'img2img') {
                inputImagesData = await Promise.all(
                    uploadedImages.map(async (img) => compressImage(img.data, 1024, 0.82))
                );
                if (inputImagesData.length > 0) inputImageMimeType = 'image/jpeg';
            } else if (activeMode === 'outpaint' && outpaintOriginal) {
                inputImagesData = [await compressImage(outpaintOriginal, 1024, 0.82)];
                inputImageMimeType = 'image/jpeg';
            }

            const promptText = prompt.trim() || (activeMode === 'outpaint' ? '向四周自然延展画面，保持原图主体不变，风格一致。' : '');

            const res = await fetch('/api/history', {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify({
                    imageData: generatedDataUrl,
                    thumbnailData,
                    inputImagesData: inputImagesData.length > 0 ? inputImagesData : undefined,
                    inputImageMimeType: inputImagesData.length > 0 ? inputImageMimeType : undefined,
                    prompt: promptText,
                    mode: activeMode,
                    model: selectedModel,
                    aspectRatio: selectedRatio,
                }),
            });

            const data = await res.json();
            if (data.success && activeTab === 'history') {
                loadHistory();
            }
        } catch { }
    }, [apiKey, activeMode, uploadedImages, outpaintOriginal, prompt, selectedModel, selectedRatio, activeTab, loadHistory]);

    const deleteHistoryItem = useCallback(async (id: string) => {
        if (!apiKey) return;
        setDeletingHistoryId(id);
        try {
            const res = await fetch(`/api/history?id=${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: {
                    'x-api-key': apiKey,
                },
            });
            const data = await res.json();
            if (data.success) {
                setHistory(prev => prev.filter(i => i.id !== id));
                if (selectedHistoryItem?.id === id) setSelectedHistoryItem(null);
            } else {
                alert(data.error || '删除失败');
            }
        } catch {
            alert('删除失败');
        } finally {
            setDeletingHistoryId(null);
        }
    }, [apiKey, selectedHistoryItem]);

    const getMimeTypeFromDataUrl = (dataUrl: string): string => {
        const match = dataUrl.match(/^data:([^;]+);base64,/);
        return match?.[1] || 'image/jpeg';
    };

    const handleGenerate = async () => {
        if (!apiKey && !isServerKeyConfigured) {
            setShowApiKeyModal(true);
            return;
        }
        const promptText = prompt.trim() || (activeMode === 'outpaint' ? '向四周自然延展画面，保持原图主体不变，风格一致。' : '');
        if (!promptText) {
            setError('请输入提示词 / Please enter a prompt');
            return;
        }
        if (activeMode === 'img2img' && uploadedImages.length === 0) {
            setError('请上传至少一张参考图 / Please upload at least one image');
            return;
        }
        if (activeMode === 'outpaint' && !outpaintComposite) {
            setError('请先上传图片并调整扩图画布');
            return;
        }
        setIsGenerating(true);
        setError(null);
        try {
            const requestHeaders: HeadersInit = { 'Content-Type': 'application/json' };
            if (apiKey) requestHeaders['x-api-key'] = apiKey;

            const body: GenerateRequestBody = {
                model: selectedModel,
                prompt: promptText,
                mode: activeMode,
                aspectRatio: selectedRatio,
                imageSize: selectedResolution,
            };
            if (activeMode === 'img2img') {
                body.images = uploadedImages;
            } else if (activeMode === 'outpaint' && outpaintComposite) {
                body.images = [
                    { data: outpaintComposite, mimeType: 'image/jpeg' },
                    ...(outpaintOriginal ? [{ data: outpaintOriginal, mimeType: getMimeTypeFromDataUrl(outpaintOriginal) }] : []),
                ];
            }

            const res = await fetch('/api/gemini', {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify(body),
            });

            const data = await res.json();
            if (data.success) {
                const firstImage = data.images?.[0]?.data;
                if (firstImage) {
                    setResultImage(firstImage);
                    saveToHistory(firstImage);
                } else {
                    setError('未获取到生成结果');
                }
            } else {
                setError(data.error || 'Generate Failed');
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Request Failed');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center py-8 px-6 font-sans text-gray-800">

            {/* Top Toggle */}
            <div className="bg-white p-1 rounded-full shadow-sm border border-gray-100 flex items-center mb-6">
                <button
                    type="button"
                    onClick={() => setActiveTab('generate')}
                    aria-pressed={activeTab === 'generate'}
                    className={`px-6 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'generate' ? 'bg-[#EEF2FF] text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                    Create
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('history')}
                    aria-pressed={activeTab === 'history'}
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
                                type="button"
                                onClick={() => setActiveMode('text2img')}
                                aria-pressed={activeMode === 'text2img'}
                                className={`flex-1 flex justify-center items-center gap-2 py-2.5 text-xs font-semibold rounded-lg transition-all ${activeMode === 'text2img' ? 'bg-white shadow-sm text-gray-900 border border-gray-100' : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                                Text to Image
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveMode('img2img')}
                                aria-pressed={activeMode === 'img2img'}
                                className={`flex-1 flex justify-center items-center gap-2 py-2.5 text-xs font-semibold rounded-lg transition-all ${activeMode === 'img2img' ? 'bg-white shadow-sm text-gray-900 border border-gray-100' : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                                Image to Image
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveMode('outpaint')}
                                aria-pressed={activeMode === 'outpaint'}
                                className={`flex-1 flex justify-center items-center gap-2 py-2.5 text-xs font-semibold rounded-lg transition-all ${activeMode === 'outpaint' ? 'bg-white shadow-sm text-gray-900 border border-gray-100' : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 8v8M8 12h8" /></svg>
                                Outpaint
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
                                        if (!switchingToFlash && FLASH_ONLY_RATIOS.has(selectedRatio)) setSelectedRatio('1:1');
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
                                aria-label="Prompt"
                                placeholder={activeMode === 'outpaint' ? '扩图指令（可选）：例如“保持主体不变，向外补全天空与远景”' : 'Describe the image you want to generate in detail...'}
                                className="w-full h-32 resize-none bg-[#FAFAFA] border border-gray-200 rounded-xl p-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white focus:border-indigo-400"
                            />
                        </div>

                        {activeMode === 'outpaint' && (
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-semibold text-gray-600">扩图图片</label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => outpaintEditorRef.current?.openFileDialog()}
                                        className="flex-1 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
                                    >
                                        上传图片
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            outpaintEditorRef.current?.clear();
                                            setOutpaintComposite(null);
                                            setOutpaintOriginal(null);
                                        }}
                                        disabled={!outpaintOriginal}
                                        className={`px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${outpaintOriginal ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50' : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'}`}
                                    >
                                        清除
                                    </button>
                                </div>
                                <div className="text-[11px] text-gray-400">
                                    {outpaintOriginal ? '已选择 1 张图片' : '未选择图片'}
                                </div>
                            </div>
                        )}

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
                                        type="button"
                                        key={r.id}
                                        onClick={() => setSelectedResolution(r.id)}
                                        aria-pressed={selectedResolution === r.id}
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
                            <div className="flex flex-wrap gap-2">
                                {ratioOptions.map(r => (
                                    <button
                                        type="button"
                                        key={r.id}
                                        onClick={() => setSelectedRatio(r.id)}
                                        aria-pressed={selectedRatio === r.id}
                                        className={`px-3 py-2 text-xs font-semibold rounded-full border transition-colors ${selectedRatio === r.id
                                            ? 'bg-[#EEF2FF] border-indigo-200 text-indigo-600'
                                            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                            }`}
                                    >
                                        {r.name}
                                    </button>
                                ))}
                            </div>
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
                                aria-label="API Key"
                                placeholder="Enter Gemini API Key (Optional if server configured)"
                                className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
                            />
                        </div>

                        <div className="mt-auto pt-4 border-t border-gray-100 flex flex-col gap-3">
                            {error && <div className="text-red-500 text-xs text-center">{error}</div>}
                            {(!apiKey && !isServerKeyConfigured) ? (
                                <button
                                    type="button"
                                    onClick={() => setShowApiKeyModal(true)}
                                    className="w-full py-4 bg-[#FF9500] hover:bg-[#F58D00] text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
                                    Connect API Key
                                </button>
                            ) : (
                                <button
                                    type="button"
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
                        {activeMode === 'outpaint' ? (
                            resultImage ? (
                                <div className="w-full h-full flex items-center justify-center relative">
                                    <button
                                        type="button"
                                        onClick={() => setResultImage(null)}
                                        className="absolute top-6 right-6 px-4 py-2 rounded-full text-xs font-semibold border border-gray-200 bg-white/90 hover:bg-white text-gray-700 backdrop-blur"
                                    >
                                        重新编辑
                                    </button>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={resultImage} alt="Outpaint result" className="max-w-full max-h-full object-contain rounded-xl shadow-lg" />
                                </div>
                            ) : isGenerating ? (
                                <div className="flex flex-col items-center gap-4 text-gray-400">
                                    <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"></div>
                                    <p className="text-sm">Creating your masterpiece...</p>
                                </div>
                            ) : (
                                <div className="w-full max-w-[900px]">
                                    <OutpaintEditor
                                        ref={outpaintEditorRef}
                                        aspectRatio={selectedRatio}
                                        imageSize={selectedResolution}
                                        onCompositeReady={({ compositeImage, originalImage }) => {
                                            setOutpaintComposite(compositeImage);
                                            setOutpaintOriginal(originalImage);
                                        }}
                                    />
                                    <div className="mt-4 text-xs text-gray-400 text-center">
                                        调整画布后点击 Generate 进行扩图
                                    </div>
                                </div>
                            )
                        ) : (
                            resultImage ? (
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
                            )
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'history' && (
                <div className="w-full max-w-[1300px] h-[calc(100vh-140px)] bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-gray-800 font-semibold text-lg">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-500"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                            历史记录
                        </div>
                        <button
                            onClick={loadHistory}
                            disabled={historyLoading}
                            className={`px-4 py-2 rounded-full text-xs font-semibold border transition-colors ${historyLoading ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                        >
                            刷新
                        </button>
                    </div>

                    {!apiKey && (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-3">
                            <p className="text-sm">请输入 API Key 后查看历史记录</p>
                            <button
                                onClick={() => setShowApiKeyModal(true)}
                                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-colors"
                            >
                                输入 API Key
                            </button>
                        </div>
                    )}

                    {apiKey && (
                        <>
                            {historyError && (
                                <div className="text-red-500 text-sm mb-4">{historyError}</div>
                            )}

                            {historyLoading ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-4">
                                    <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"></div>
                                    <p className="text-sm">加载中...</p>
                                </div>
                            ) : history.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
                                    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-gray-200"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                                    <p className="text-sm">暂无历史记录</p>
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                        {history.map(item => (
                                            <div
                                                key={item.id}
                                                onClick={() => setSelectedHistoryItem(item)}
                                                className="group relative rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 cursor-pointer hover:border-indigo-200 transition-colors"
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={item.thumbnailUrl || item.imageUrl}
                                                    alt={item.prompt}
                                                    loading="lazy"
                                                    className="w-full aspect-square object-cover block"
                                                    onError={(e) => {
                                                        const el = e.currentTarget;
                                                        if (item.thumbnailUrl && el.src !== item.imageUrl) el.src = item.imageUrl;
                                                    }}
                                                />
                                                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                                                    <p className="text-[11px] text-white line-clamp-2">{item.prompt}</p>
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (confirm('确定要删除这条记录吗？')) deleteHistoryItem(item.id);
                                                    }}
                                                    disabled={deletingHistoryId === item.id}
                                                    className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs transition-colors ${deletingHistoryId === item.id ? 'bg-black/40 cursor-not-allowed' : 'bg-black/60 hover:bg-red-500/90'}`}
                                                    title="删除"
                                                >
                                                    {deletingHistoryId === item.id ? '...' : '🗑️'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
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
                                    if (apiKey) localStorage.setItem('gemini_api_key', apiKey);
                                    else localStorage.removeItem('gemini_api_key');
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

            {selectedHistoryItem && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-4" onClick={() => setSelectedHistoryItem(null)}>
                    <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-gray-900">历史记录预览</span>
                                <span className="text-xs text-gray-400">{new Date(selectedHistoryItem.timestamp).toLocaleString('zh-CN')}</span>
                            </div>
                            <button
                                onClick={() => setSelectedHistoryItem(null)}
                                className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
                                aria-label="关闭"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2">
                            <div className="bg-black flex items-center justify-center p-4">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={selectedHistoryItem.imageUrl}
                                    alt={selectedHistoryItem.prompt}
                                    className="max-h-[70vh] w-auto object-contain rounded-xl"
                                />
                            </div>
                            <div className="p-6 flex flex-col gap-4">
                                <div>
                                    <div className="text-xs text-gray-500 mb-1">提示词</div>
                                    <div className="text-sm text-gray-900 whitespace-pre-wrap">{selectedHistoryItem.prompt}</div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <span className="px-3 py-1 rounded-full bg-gray-50 text-gray-600 text-xs border border-gray-100">模式: {selectedHistoryItem.mode}</span>
                                    <span className="px-3 py-1 rounded-full bg-gray-50 text-gray-600 text-xs border border-gray-100">模型: {selectedHistoryItem.model}</span>
                                    {selectedHistoryItem.aspectRatio && (
                                        <span className="px-3 py-1 rounded-full bg-gray-50 text-gray-600 text-xs border border-gray-100">比例: {selectedHistoryItem.aspectRatio}</span>
                                    )}
                                </div>
                                {selectedHistoryItem.inputImageUrls && selectedHistoryItem.inputImageUrls.length > 0 && (
                                    <div>
                                        <div className="text-xs text-gray-500 mb-2">参考图（{selectedHistoryItem.inputImageUrls.length}）</div>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedHistoryItem.inputImageUrls.map((url, idx) => (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img key={idx} src={url} alt={`参考图 ${idx + 1}`} className="w-16 h-16 rounded-xl object-cover border border-gray-100" />
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className="mt-auto flex gap-3">
                                    <button
                                        onClick={() => {
                                            setActiveTab('generate');
                                            setActiveMode(selectedHistoryItem.mode === 'outpaint' ? 'outpaint' : selectedHistoryItem.mode);
                                            setPrompt(selectedHistoryItem.prompt);
                                            setSelectedModel(selectedHistoryItem.model);
                                            if (selectedHistoryItem.aspectRatio) setSelectedRatio(selectedHistoryItem.aspectRatio);
                                            setResultImage(selectedHistoryItem.imageUrl);
                                            setSelectedHistoryItem(null);
                                        }}
                                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors"
                                    >
                                        应用到创作页
                                    </button>
                                    <a
                                        href={selectedHistoryItem.imageUrl}
                                        download
                                        className="px-5 py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl font-bold border border-gray-100 transition-colors"
                                    >
                                        下载
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
