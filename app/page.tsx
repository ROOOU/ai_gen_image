'use client';

import { useCallback, useState, useEffect } from 'react';
import OutpaintEditor from '@/components/OutpaintEditor';
import ImageToImageUploader from '@/components/ImageToImageUploader';
import { NANO_BANANA_CASES } from '@/lib/nanoBananaCases';

type ExampleCaseFilter = 'all' | 'design' | 'analysis' | 'visual' | 'story';

/**
 * 将 base64 图片缩小为缩略图 (最大 200px)
 */
function generateThumbnail(dataUrl: string, maxSize = 200): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = () => resolve(dataUrl); // fallback to original
        img.src = dataUrl;
    });
}

/**
 * 压缩图片以避免超出 Vercel body 大小限制 (4.5MB)
 */
function compressImage(dataUrl: string, maxDimension = 1024, quality = 0.8): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(maxDimension / img.width, maxDimension / img.height, 1);
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}


const MODELS = [
    { id: 'gemini-2.5-flash-image', name: 'Nano Flash', description: '快速高效' },
    { id: 'gemini-3-pro-image-preview', name: 'Nano Pro', description: '专业品质' },
];

const RESOLUTIONS = [
    { id: '1K', name: '1K' },
    { id: '2K', name: '2K' },
    { id: '4K', name: '4K' },
];

const ASPECT_RATIOS = [
    { id: '1:1', name: '1:1' },
    { id: '3:4', name: '3:4' },
    { id: '4:3', name: '4:3' },
    { id: '9:16', name: '9:16' },
    { id: '16:9', name: '16:9' },
];

interface HistoryItem {
    id: string;
    timestamp: number;
    prompt: string;
    mode: 'text2img' | 'img2img' | 'outpaint';
    model: string;
    imageUrl: string;
    thumbnailUrl?: string;
    inputImageUrls?: string[];
}

interface PreviewDetailItem {
    imageUrl: string;
    prompt: string;
    mode: 'text2img' | 'img2img' | 'outpaint';
    model: string;
    timestamp: number;
    inputImageUrls?: string[];
}

interface OutpaintData {
    originalImage: string;
    compositeImage: string;
    maskImage: string;
}

interface GenerateRequestBody {
    model: string;
    prompt: string;
    mode: 'text2img' | 'img2img' | 'outpaint';
    aspectRatio?: string;
    imageSize?: string;
    images?: Array<{ data: string; mimeType: string }>;
}

export default function Home() {
    const [activeTab, setActiveTab] = useState<'generate' | 'history' | 'settings'>('generate');
    const [apiKey, setApiKey] = useState('');
    const [prompt, setPrompt] = useState('');
    const [selectedModel, setSelectedModel] = useState(MODELS[1].id);
    const [selectedRatio, setSelectedRatio] = useState('1:1');
    const [selectedResolution, setSelectedResolution] = useState('2K');
    const [isGenerating, setIsGenerating] = useState(false);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeMode, setActiveMode] = useState<'text2img' | 'img2img' | 'outpaint'>('text2img');
    const [outpaintData, setOutpaintData] = useState<OutpaintData | null>(null);
    const [referenceImages, setReferenceImages] = useState<Array<{ data: string; mimeType: string }>>([]);
    const [generationProgress, setGenerationProgress] = useState(0);
    const [showInspiration, setShowInspiration] = useState(false);
    const [isServerKeyConfigured, setIsServerKeyConfigured] = useState(false);
    const [outpaintView, setOutpaintView] = useState<'editor' | 'result'>('editor');
    const [selectedCaseFilter, setSelectedCaseFilter] = useState<ExampleCaseFilter>('all');
    const [latestPreviewMeta, setLatestPreviewMeta] = useState<Omit<PreviewDetailItem, 'imageUrl'> | null>(null);
    const [previewDetailItem, setPreviewDetailItem] = useState<PreviewDetailItem | null>(null);

    const inspirationPrompts = [
        { title: '赛博朋克城市', prompt: 'Cyberpunk city at night, neon lights, rain, futuristic', emoji: '🌃' },
        { title: '梦幻森林', prompt: 'Enchanted forest with glowing mushrooms, fairy lights, magical atmosphere', emoji: '🌲' },
        { title: '未来科技', prompt: 'Futuristic technology interface, holographic displays, sleek design', emoji: '🚀' },
        { title: '古风山水', prompt: 'Traditional Chinese landscape painting, mountains, mist, ink wash style', emoji: '🏔️' },
        { title: '可爱动物', prompt: 'Cute fluffy kitten playing with yarn, soft lighting, cozy home', emoji: '🐱' },
        { title: '美食摄影', prompt: 'Gourmet food photography, delicious pasta, professional lighting', emoji: '🍝' },
    ];

    const loadHistory = useCallback(async (currentApiKey: string = apiKey) => {
        try {
            const headers: HeadersInit = {};
            if (currentApiKey) {
                headers['x-api-key'] = currentApiKey;
            }

            const res = await fetch('/api/history', { headers });
            const data = await res.json();
            if (data.success) {
                setHistory(data.history);
            }
        } catch {
            console.error('Failed to load history');
        }
    }, [apiKey]);

    useEffect(() => {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) setApiKey(savedKey);

        // Check if server has API key configured
        const checkServerKey = async () => {
            try {
                const res = await fetch('/api/gemini');
                const data = await res.json();
                if (data.success) {
                    setIsServerKeyConfigured(true);
                    if (!savedKey) {
                        loadHistory('');
                    }
                }
            } catch {
                // Ignore error
            }
        };
        checkServerKey();

        loadHistory(savedKey || '');

    }, [loadHistory]);

    const handleGenerate = async () => {
        if (!apiKey && !isServerKeyConfigured) {
            setError('请先配置 API Key（或在服务器环境变量中设置）');
            setActiveTab('settings');
            return;
        }

        if (activeMode === 'img2img' && referenceImages.length === 0) {
            setError('图生图模式请先上传参考图片');
            return;
        }

        if (activeMode === 'outpaint' && !outpaintData?.originalImage) {
            setError('扩图模式请先上传并调整原图');
            return;
        }

        const finalPrompt = activeMode === 'outpaint'
            ? (prompt.trim() || `Expand the canvas of this image to ${selectedRatio || '16:9'} aspect ratio. Keep the original content and its position completely unchanged. Naturally extend the background, environment, and scene beyond the original borders. Match the style, lighting, colors, and atmosphere seamlessly.`)
            : prompt.trim();

        if (activeMode !== 'outpaint' && !finalPrompt) {
            setError('请输入提示词');
            return;
        }

        setIsGenerating(true);
        if (activeMode === 'outpaint') setOutpaintView('result');
        setError(null);
        setGenerationProgress(0);

        const progressInterval = setInterval(() => {
            setGenerationProgress(prev => {
                if (prev >= 90) return prev;
                return prev + Math.random() * 15;
            });
        }, 800);

        try {
            const body: GenerateRequestBody = {
                model: selectedModel,
                prompt: finalPrompt,
                mode: 'text2img',
            };

            if (selectedRatio) body.aspectRatio = selectedRatio;

            if (selectedModel === 'gemini-3-pro-image-preview' && selectedResolution) {
                body.imageSize = selectedResolution;
            }

            if (activeMode === 'outpaint' && outpaintData) {
                body.mode = 'outpaint';
                // 发送合成图 + mask 图给 Gemini，提供 masked outpainting 上下文
                const compressedComposite = await compressImage(outpaintData.compositeImage, 1024, 0.8);
                body.images = [
                    { data: compressedComposite, mimeType: 'image/jpeg' },
                    { data: outpaintData.maskImage, mimeType: 'image/png' },
                ];
            } else if (activeMode === 'img2img' && referenceImages.length > 0) {
                body.mode = 'img2img';
                body.images = await Promise.all(
                    referenceImages.map(async img => {
                        const compressed = await compressImage(img.data, 1024, 0.8);
                        return { data: compressed, mimeType: 'image/jpeg' };
                    })
                );
            } else {
                body.mode = 'text2img';
            }

            const requestHeaders: HeadersInit = { 'Content-Type': 'application/json' };
            if (apiKey) {
                requestHeaders['x-api-key'] = apiKey;
            }

            const res = await fetch('/api/gemini', {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify(body),
            });

            const data = await res.json();
            clearInterval(progressInterval);
            setGenerationProgress(100);

            if (data.success) {
                const finalImage = data.images[0].data;

                setResultImage(finalImage);
                if (activeMode === 'outpaint') setOutpaintView('result');
                setLatestPreviewMeta({
                    prompt: body.prompt,
                    mode: activeMode,
                    model: selectedModel,
                    timestamp: Date.now(),
                });
                const thumbnailData = await generateThumbnail(finalImage);
                try {
                    const historyHeaders: HeadersInit = { 'Content-Type': 'application/json' };
                    if (apiKey) {
                        historyHeaders['x-api-key'] = apiKey;
                    }



                    await fetch('/api/history', {
                        method: 'POST',
                        headers: historyHeaders,
                        body: JSON.stringify({
                            imageData: finalImage,
                            thumbnailData,
                            prompt: body.prompt,
                            mode: activeMode,
                            model: selectedModel,
                            inputImagesData: activeMode === 'img2img'
                                ? referenceImages.map(img => img.data)
                                : (activeMode === 'outpaint' && outpaintData?.originalImage
                                    ? [outpaintData.originalImage]
                                    : undefined),
                            inputImageMimeType: 'image/jpeg',
                        }),
                    });
                } catch (e) {
                    console.warn('History save failed:', e);
                }
                loadHistory(apiKey);
            } else {
                setError(data.error || '生成失败');
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : '请求失败');
        } finally {
            clearInterval(progressInterval);
            setIsGenerating(false);
            setTimeout(() => setGenerationProgress(0), 500);
        }
    };

    const handleDownload = () => {
        if (!resultImage) return;
        const link = document.createElement('a');
        link.href = resultImage;
        link.download = `generated-${Date.now()}.png`;
        link.click();
    };

    const handleCopy = async () => {
        if (!resultImage) return;
        try {
            const response = await fetch(resultImage);
            const blob = await response.blob();
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            alert('图片已复制到剪贴板');
        } catch {
            alert('复制失败');
        }
    };

    const groupedHistory = history.reduce<Record<string, HistoryItem[]>>((groups, item) => {
        const date = new Date(item.timestamp).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
        const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
        const label = date === today ? '今天' : date;
        if (!groups[label]) groups[label] = [];
        groups[label].push(item);
        return groups;
    }, {});

    const getModeLabel = (mode: string) => {
        switch (mode) {
            case 'text2img': return '文生图';
            case 'img2img': return '图生图';
            case 'outpaint': return '扩图';
            default: return mode;
        }
    };

    const getModeDescription = () => {
        switch (activeMode) {
            case 'text2img': return '输入提示词，AI 将为你生成独特图片';
            case 'img2img': return '上传参考图，AI 将在此基础上创作';
            case 'outpaint': return '在画布上拖动图片并选择比例进行扩展';
            default: return '';
        }
    };

    const applyExampleCase = (exampleCase: typeof NANO_BANANA_CASES[number]) => {
        setPrompt(exampleCase.prompt);
        setActiveMode(exampleCase.mode);
        setShowInspiration(false);
    };

    const caseFilterOptions: Array<{ id: ExampleCaseFilter; label: string }> = [
        { id: 'all', label: '全部' },
        { id: 'design', label: '设计' },
        { id: 'analysis', label: '解析' },
        { id: 'visual', label: '视觉特效' },
        { id: 'story', label: '叙事世界观' },
    ];

    const filteredExampleCases = selectedCaseFilter === 'all'
        ? NANO_BANANA_CASES
        : NANO_BANANA_CASES.filter((item) => item.category === selectedCaseFilter);

    const applyRandomCase = () => {
        if (filteredExampleCases.length === 0) {
            return;
        }
        const randomIndex = Math.floor(Math.random() * filteredExampleCases.length);
        applyExampleCase(filteredExampleCases[randomIndex]);
    };

    const openPreviewDetail = (item: PreviewDetailItem) => {
        setPreviewDetailItem(item);
    };

    const applyPreviewDetail = () => {
        if (!previewDetailItem) return;
        setResultImage(previewDetailItem.imageUrl);
        setPrompt(previewDetailItem.prompt);
        setActiveMode(previewDetailItem.mode);
        setActiveTab('generate');
        setPreviewDetailItem(null);
    };

    const renderPreviewContent = () => {
        if (isGenerating) {
            return (
                <div className="generating-view">
                    <div className="progress-circle">
                        <svg viewBox="0 0 100 100"><circle className="circle-bg" cx="50" cy="50" r="45" /><circle className="circle-progress" cx="50" cy="50" r="45" style={{ strokeDasharray: 283, strokeDashoffset: 283 * (1 - generationProgress / 100) }} /></svg>
                        <span className="progress-value">{Math.round(generationProgress)}%</span>
                    </div>
                    <p>创作中...</p>
                </div>
            );
        }

        if (resultImage) {
            const previewMeta = latestPreviewMeta || {
                prompt,
                mode: activeMode,
                model: selectedModel,
                timestamp: Date.now(),
            };

            return (
                <div className="result-view">
                    <div
                        className="result-image-container preview-clickable"
                        onClick={() => openPreviewDetail({ imageUrl: resultImage, ...previewMeta })}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={resultImage} alt="Generated" />
                    </div>
                    <div className="result-toolbar">
                        <button className="toolbar-btn primary" onClick={handleDownload}>下载</button>
                        <button className="toolbar-btn" onClick={handleCopy}>复制</button>
                    </div>
                </div>
            );
        }

        return (
            <div className="empty-view">
                <div className="empty-illustration"><span className="empty-emoji">🎨</span></div>
                <p>{getModeDescription()}</p>
            </div>
        );
    };

    return (
        <div className="app-container">
            <header className="app-header">
                <div
                    className="header-logo"
                    onClick={() => setActiveTab('generate')}
                    style={{ cursor: 'pointer' }}
                    title="返回首页"
                >
                    <span className="logo-icon">🍌</span>
                    <span className="logo-text">Nano Banana</span>
                </div>

                <nav className="header-nav">
                    <button
                        className={`nav-tab ${activeTab === 'generate' ? 'active' : ''}`}
                        onClick={() => setActiveTab('generate')}
                    >
                        创作
                    </button>
                    <button
                        className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`}
                        onClick={() => setActiveTab('history')}
                    >
                        历史 ({history.length})
                    </button>
                </nav>

                <div className="header-actions">
                    {(apiKey || isServerKeyConfigured) ? (
                        <span className="api-status connected" title={isServerKeyConfigured && !apiKey ? "使用服务器配置的 API Key" : "使用本地配置的 API Key"}>
                            <span className="status-dot"></span>
                            已连接
                        </span>
                    ) : (
                        <button
                            className="api-status disconnected"
                            onClick={() => setActiveTab('settings')}
                        >
                            <span className="status-dot"></span>
                            未配置 API
                        </button>
                    )}
                    <button
                        className={`settings-btn ${activeTab === 'settings' ? 'active' : ''}`}
                        onClick={() => setActiveTab('settings')}
                    >
                        设置
                    </button>
                </div>
            </header>

            <main className="app-main">
                {activeTab === 'generate' && (
                    <div className="generate-tab-view">
                        <div className="mobile-mode-switcher">
                            <button
                                className={`mobile-mode-btn ${activeMode === 'outpaint' ? 'active' : ''}`}
                                onClick={() => setActiveMode('outpaint')}
                            >
                                扩图
                            </button>
                            <button
                                className={`mobile-mode-btn ${activeMode === 'text2img' ? 'active' : ''}`}
                                onClick={() => setActiveMode('text2img')}
                            >
                                文生图
                            </button>
                            <button
                                className={`mobile-mode-btn ${activeMode === 'img2img' ? 'active' : ''}`}
                                onClick={() => setActiveMode('img2img')}
                            >
                                图生图
                            </button>
                        </div>

                        <div className={`generate-layout ${activeMode === 'outpaint' ? 'outpaint-mobile-layout' : ''}`}>
                            <div className={`mobile-preview ${activeMode !== 'outpaint' ? 'active' : ''}`}>
                                {renderPreviewContent()}
                            </div>
                            <aside className="controls-panel">
                                <div className="control-section mode-control-section">
                                    <label className="control-label">任务</label>
                                    <div className="mode-tabs">
                                        <button
                                            className={`mode-tab ${activeMode === 'outpaint' ? 'active' : ''}`}
                                            onClick={() => setActiveMode('outpaint')}
                                        >
                                            <span className="tab-icon">扩</span>
                                            <span className="tab-title">Outpaint</span>
                                        </button>
                                        <button
                                            className={`mode-tab ${activeMode === 'text2img' ? 'active' : ''}`}
                                            onClick={() => setActiveMode('text2img')}
                                        >
                                            <span className="tab-icon">文</span>
                                            <span className="tab-title">Imagine</span>
                                        </button>
                                        <button
                                            className={`mode-tab ${activeMode === 'img2img' ? 'active' : ''}`}
                                            onClick={() => setActiveMode('img2img')}
                                        >
                                            <span className="tab-icon">图</span>
                                            <span className="tab-title">Image</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="control-section">
                                    <label className="control-label">模型</label>
                                    <div className="prompt-box" style={{ padding: '4px 8px' }}>
                                        <select
                                            value={selectedModel}
                                            onChange={(e) => setSelectedModel(e.target.value)}
                                            style={{
                                                width: '100%',
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--text-primary)',
                                                padding: '8px 4px',
                                                outline: 'none',
                                                fontSize: '14px'
                                            }}
                                        >
                                            {MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {activeMode !== 'outpaint' && (
                                    <div className="control-section">
                                        <label className="control-label">图片比例</label>
                                        <div className="ratio-options">
                                            {ASPECT_RATIOS.map((ratio) => (
                                                <button
                                                    key={ratio.id}
                                                    className={`ratio-option ${selectedRatio === ratio.id ? 'active' : ''}`}
                                                    onClick={() => setSelectedRatio(ratio.id)}
                                                >
                                                    {ratio.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedModel === 'gemini-3-pro-image-preview' && (
                                    <div className="control-section">
                                        <label className="control-label">分辨率</label>
                                        <div className="resolution-options">
                                            {RESOLUTIONS.map(r => (
                                                <button
                                                    key={r.id}
                                                    className={`resolution-option ${selectedResolution === r.id ? 'active' : ''}`}
                                                    onClick={() => setSelectedResolution(r.id)}
                                                >
                                                    {r.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeMode === 'img2img' && (
                                    <div className="control-section">
                                        <label className="control-label">输入图片</label>
                                        <ImageToImageUploader
                                            onImagesReady={setReferenceImages}
                                            currentImages={referenceImages}
                                            maxImages={selectedModel === 'gemini-3-pro-image-preview' ? 14 : 3}
                                        />
                                    </div>
                                )}

                                <div className="control-section">
                                    <div className="label-row">
                                        <label className="control-label">提示词*</label>
                                        <button className="inspiration-toggle" onClick={() => setPrompt('')}>清空</button>
                                    </div>
                                    <div className="prompt-box">
                                        <textarea
                                            placeholder="撰写提示..."
                                            value={prompt}
                                            onChange={(e) => setPrompt(e.target.value)}
                                            rows={4}
                                        />
                                    </div>
                                    <button className="inspiration-toggle" style={{ alignSelf: 'flex-end' }} onClick={() => setShowInspiration(!showInspiration)}>帮我写</button>
                                    {showInspiration && (
                                        <div className="inspiration-panel">
                                            <div className="inspiration-list">
                                                {inspirationPrompts.map((item) => (
                                                    <button
                                                        key={item.title}
                                                        className="inspiration-item"
                                                        onClick={() => {
                                                            setPrompt(item.prompt);
                                                            setShowInspiration(false);
                                                        }}
                                                    >
                                                        <span>{item.emoji}</span>
                                                        <span>{item.title}</span>
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="example-cases-header">精选案例（来自 Awesome-Nano-Banana-images）</div>
                                            <div className="example-cases-toolbar">
                                                <div className="example-case-filters">
                                                    {caseFilterOptions.map((option) => (
                                                        <button
                                                            key={option.id}
                                                            className={`example-case-filter ${selectedCaseFilter === option.id ? 'active' : ''}`}
                                                            onClick={() => setSelectedCaseFilter(option.id)}
                                                        >
                                                            {option.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <button className="example-case-random" onClick={applyRandomCase}>随机来一个</button>
                                            </div>
                                            <div className="example-cases-list">
                                                {filteredExampleCases.map((exampleCase) => (
                                                    <div key={exampleCase.id} className="example-case-card">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={exampleCase.imageUrl} alt={exampleCase.title} className="example-case-image" loading="lazy" />
                                                        <div className="example-case-content">
                                                            <p className="example-case-title">{exampleCase.title}</p>
                                                            <p className="example-case-mode">{exampleCase.mode === 'img2img' ? '图生图案例' : '文生图案例'}</p>
                                                            <div className="example-case-actions">
                                                                <button className="example-case-use" onClick={() => applyExampleCase(exampleCase)}>使用提示词</button>
                                                                <a className="example-case-link" href={exampleCase.sourceUrl} target="_blank" rel="noopener noreferrer">来源</a>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="generate-action-bar">
                                    <button
                                        className="generate-button"
                                        disabled={isGenerating || (activeMode !== 'outpaint' && !prompt.trim())}
                                        onClick={handleGenerate}
                                    >
                                        {isGenerating ? <><span className="btn-spinner"></span> 运行中</> : <>运行</>}
                                    </button>
                                </div>

                                {error && <div className="error-alert">{error}</div>}
                            </aside>

                            <div className="main-content">
                                {activeMode === 'outpaint' && (
                                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24, gap: 12 }}>
                                        <div className="alignment-toolbar" style={{ margin: 0, padding: '4px 12px' }}>
                                            <button className={`nav-tab ${outpaintView === 'editor' ? 'active' : ''}`} onClick={() => setOutpaintView('editor')}>扩绘编辑器</button>
                                            <button className={`nav-tab ${outpaintView === 'result' ? 'active' : ''}`} onClick={() => setOutpaintView('result')}>结果{resultImage ? ' ✓' : ''}</button>
                                        </div>
                                    </div>
                                )}

                                {activeMode === 'outpaint' && outpaintView === 'editor' ? (
                                    <OutpaintEditor
                                        onCompositeReady={(data) => setOutpaintData({
                                            originalImage: data.originalImage,
                                            compositeImage: data.compositeImage,
                                            maskImage: data.maskImage,
                                        })}
                                        aspectRatio={selectedRatio}
                                        onAspectRatioChange={setSelectedRatio}
                                    />
                                ) : (
                                    <div className="desktop-preview" style={{ flex: 1, margin: 0 }}>
                                        {renderPreviewContent()}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="history-view">
                        <h2 className="view-title">生成历史</h2>
                        {Object.keys(groupedHistory).length > 0 ? (
                            <div className="history-list">
                                {Object.entries(groupedHistory).map(([date, items]) => (
                                    <div key={date} className="history-group">
                                        <h3 className="history-date">{date}</h3>
                                        <div className="history-grid">
                                            {items.map((item: HistoryItem) => (
                                                <div
                                                    key={item.id}
                                                    className="history-item"
                                                    onClick={() => {
                                                        openPreviewDetail({
                                                            imageUrl: item.imageUrl,
                                                            prompt: item.prompt,
                                                            mode: item.mode,
                                                            model: item.model,
                                                            timestamp: item.timestamp,
                                                            inputImageUrls: item.inputImageUrls,
                                                        });
                                                    }}
                                                >
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={item.thumbnailUrl || item.imageUrl} alt="" loading="lazy" />
                                                    {item.inputImageUrls && item.inputImageUrls.length > 0 && (
                                                        <div className="history-input-badge" title="此记录包含参考图">
                                                            <span>参考×{item.inputImageUrls.length}</span>
                                                        </div>
                                                    )}
                                                    <div className="history-overlay">
                                                        <span className="history-mode">{getModeLabel(item.mode)}</span>
                                                        <p className="history-prompt">{item.prompt}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-history">
                                <span className="empty-icon">📭</span>
                                <p>暂无生成记录</p>
                                <button onClick={() => setActiveTab('generate')}>开始创作</button>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="settings-view">
                        <div className="settings-card">
                            <h2>设置</h2>

                            <div className="setting-item">
                                <label>Google AI API Key</label>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => {
                                        setApiKey(e.target.value);
                                        localStorage.setItem('gemini_api_key', e.target.value);
                                    }}
                                    placeholder="输入 API Key"
                                />
                                <p className="setting-hint">
                                    API Key 仅存储在本地浏览器中
                                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">
                                        获取 API Key
                                    </a>
                                </p>
                            </div>

                            <div className="setting-actions">
                                <button
                                    className="test-api-btn"
                                    onClick={async () => {
                                        if (!apiKey) {
                                            alert('请先输入 API Key');
                                            return;
                                        }
                                        try {
                                            const res = await fetch('/api/gemini', {
                                                headers: { 'x-api-key': apiKey },
                                            });
                                            const data = await res.json();
                                            alert(data.success ? 'API Key 有效' : data.error);
                                        } catch {
                                            alert('测试失败');
                                        }
                                    }}
                                    disabled={!apiKey}
                                >
                                    测试 API 连接
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {previewDetailItem && (
                <div className="preview-detail-overlay" onClick={() => setPreviewDetailItem(null)}>
                    <div className="preview-detail-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="preview-detail-close" onClick={() => setPreviewDetailItem(null)}>✕</button>
                        <div className="preview-detail-image-wrap">
                            <div className="preview-image-tight-container">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={previewDetailItem.imageUrl} alt="preview" />
                                {previewDetailItem.inputImageUrls && previewDetailItem.inputImageUrls.length > 0 && (
                                    <div style={{ marginTop: 12 }}>
                                        <span style={{ fontSize: 12, color: 'var(--pro-text-dim)', marginBottom: 6, display: 'block' }}>参考图 ({previewDetailItem.inputImageUrls.length})</span>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            {previewDetailItem.inputImageUrls.map((url, i) => (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img key={i} src={url} alt={`参考图 ${i + 1}`} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--pro-border)' }} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="preview-detail-body">
                            <div className="preview-detail-meta">
                                <span>{getModeLabel(previewDetailItem.mode)}</span>
                                <span>{new Date(previewDetailItem.timestamp).toLocaleString('zh-CN')}</span>
                            </div>
                            <p className="preview-detail-prompt">{previewDetailItem.prompt}</p>

                            <div className="preview-detail-actions">
                                <button className="toolbar-btn primary" onClick={applyPreviewDetail}>应用到创作</button>
                                <button className="toolbar-btn" onClick={() => setPreviewDetailItem(null)}>关闭</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
