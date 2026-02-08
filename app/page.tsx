'use client';

import { useState, useEffect, useCallback } from 'react';
import OutpaintEditor from '@/components/OutpaintEditor';
import ImageToImageUploader from '@/components/ImageToImageUploader';

const MODELS = [
    { id: 'gemini-2.5-flash-image', name: 'Nano Flash', description: '快速高效' },
    { id: 'gemini-3-pro-image-preview', name: 'Nano Pro', description: '专业品质' },
];

const ASPECT_RATIOS = [
    { id: '1:1', name: '1:1', label: '正方形' },
    { id: '9:16', name: '9:16', label: '手机竖屏' },
    { id: '16:9', name: '16:9', label: '宽屏' },
    { id: '3:2', name: '3:2', label: '摄影' },
    { id: '2:3', name: '2:3', label: '肖像' },
];

const RESOLUTIONS = [
    { id: '1K', name: '1K' },
    { id: '2K', name: '2K' },
    { id: '4K', name: '4K' },
];

interface HistoryItem {
    id: string;
    timestamp: number;
    prompt: string;
    mode: 'text2img' | 'img2img' | 'outpaint';
    model: string;
    imageUrl: string;
    thumbnailUrl?: string;
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
    const [outpaintData, setOutpaintData] = useState<any>(null);
    const [referenceImage, setReferenceImage] = useState<{ data: string; mimeType: string } | null>(null);
    const [generationProgress, setGenerationProgress] = useState(0);
    const [showInspiration, setShowInspiration] = useState(false);
    const [showWelcomeTip, setShowWelcomeTip] = useState(true);

    useEffect(() => {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) setApiKey(savedKey);
        loadHistory();
        
        const hasSeenTip = localStorage.getItem('has_seen_welcome_tip');
        if (hasSeenTip) setShowWelcomeTip(false);
    }, []);

    const dismissWelcomeTip = () => {
        setShowWelcomeTip(false);
        localStorage.setItem('has_seen_welcome_tip', 'true');
    };

    const loadHistory = async () => {
        const key = localStorage.getItem('gemini_api_key');
        if (!key) return;
        try {
            const res = await fetch('/api/history', { headers: { 'x-api-key': key } });
            const data = await res.json();
            if (data.success) setHistory(data.history);
        } catch {
            console.error('Failed to load history');
        }
    };

    const handleGenerate = async () => {
        if (!apiKey) {
            setError('请先配置 API Key');
            setActiveTab('settings');
            return;
        }

        if (!prompt.trim()) {
            setError('请输入提示词');
            return;
        }

        setIsGenerating(true);
        setError(null);
        setGenerationProgress(0);
        setShowWelcomeTip(false);

        const progressInterval = setInterval(() => {
            setGenerationProgress(prev => {
                if (prev >= 90) return prev;
                return prev + Math.random() * 15;
            });
        }, 800);

        try {
            const body: any = {
                model: selectedModel,
                prompt: prompt.trim(),
            };

            if (selectedRatio) body.aspectRatio = selectedRatio;

            if (selectedModel === 'gemini-3-pro-image-preview' && selectedResolution) {
                body.imageSize = selectedResolution;
            }

            if (activeMode === 'outpaint' && outpaintData) {
                body.images = [
                    { data: outpaintData.compositeImage, mimeType: 'image/jpeg' },
                    { data: outpaintData.maskImage, mimeType: 'image/png' },
                ];
            } else if (activeMode === 'img2img' && referenceImage?.data) {
                body.images = [
                    { data: referenceImage.data, mimeType: referenceImage.mimeType },
                ];
            }

            const res = await fetch('/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                body: JSON.stringify(body),
            });

            const data = await res.json();
            clearInterval(progressInterval);
            setGenerationProgress(100);

            if (data.success) {
                setResultImage(data.images[0].data);
                await fetch('/api/history', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                    body: JSON.stringify({
                        imageData: data.images[0].data,
                        prompt: body.prompt,
                        mode: activeMode,
                        model: selectedModel,
                    }),
                });
                loadHistory();
            } else {
                setError(data.error || '生成失败');
            }
        } catch (err: any) {
            setError(err.message || '请求失败');
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

    const groupedHistory = history.reduce((groups: any, item) => {
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
            case 'outpaint': return '上传图片并扩展边界，创造更大画面';
            default: return '';
        }
    };

    const inspirationPrompts = [
        { title: '赛博朋克城市', prompt: 'Cyberpunk city at night, neon lights, rain, futuristic', emoji: '🌃' },
        { title: '梦幻森林', prompt: 'Enchanted forest with glowing mushrooms, fairy lights, magical atmosphere', emoji: '🌲' },
        { title: '未来科技', prompt: 'Futuristic technology interface, holographic displays, sleek design', emoji: '🚀' },
        { title: '古风山水', prompt: 'Traditional Chinese landscape painting, mountains, mist, ink wash style', emoji: '🏔️' },
        { title: '可爱动物', prompt: 'Cute fluffy kitten playing with yarn, soft lighting, cozy home', emoji: '🐱' },
        { title: '美食摄影', prompt: 'Gourmet food photography, delicious pasta, professional lighting', emoji: '🍝' },
    ];

    return (
        <div className="app-container">
            <header className="app-header">
                <div className="header-logo">
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
                    {apiKey ? (
                        <span className="api-status connected">
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
                    <div className="generate-layout">
                        {/* Mobile Preview Area - Only shows when generating or has result */}
                        <div className={`mobile-preview ${isGenerating || resultImage ? 'active' : ''}`}>
                            {isGenerating ? (
                                <div className="generating-view">
                                    <div className="progress-circle">
                                        <svg viewBox="0 0 100 100">
                                            <circle className="circle-bg" cx="50" cy="50" r="45" />
                                            <circle 
                                                className="circle-progress" 
                                                cx="50" 
                                                cy="50" 
                                                r="45"
                                                style={{
                                                    strokeDasharray: `${2 * Math.PI * 45}`,
                                                    strokeDashoffset: `${2 * Math.PI * 45 * (1 - generationProgress / 100)}`,
                                                }}
                                            />
                                        </svg>
                                        <span className="progress-value">{Math.round(generationProgress)}%</span>
                                    </div>
                                    <p>正在创作中...</p>
                                </div>
                            ) : resultImage ? (
                                <div className="result-view">
                                    <div className="result-image-container">
                                        <img src={resultImage} alt="Generated" />
                                    </div>
                                    <div className="result-toolbar">
                                        <button className="toolbar-btn primary" onClick={handleDownload}>
                                            下载
                                        </button>
                                        <button className="toolbar-btn" onClick={handleCopy}>
                                            复制
                                        </button>
                                        <button 
                                            className="toolbar-btn"
                                            onClick={() => {
                                                setReferenceImage({ data: resultImage, mimeType: 'image/png' });
                                                setActiveMode('img2img');
                                            }}
                                        >
                                            参考
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        <div className="controls-panel">
                            {/* Desktop Preview - Only shows on desktop */}
                            <div className="desktop-preview">
                                {isGenerating ? (
                                    <div className="generating-view">
                                        <div className="progress-circle">
                                            <svg viewBox="0 0 100 100">
                                                <circle className="circle-bg" cx="50" cy="50" r="45" />
                                                <circle 
                                                    className="circle-progress" 
                                                    cx="50" 
                                                    cy="50" 
                                                    r="45"
                                                    style={{
                                                        strokeDasharray: `${2 * Math.PI * 45}`,
                                                        strokeDashoffset: `${2 * Math.PI * 45 * (1 - generationProgress / 100)}`,
                                                    }}
                                                />
                                            </svg>
                                            <span className="progress-value">{Math.round(generationProgress)}%</span>
                                        </div>
                                        <p>正在创作中...</p>
                                    </div>
                                ) : resultImage ? (
                                    <div className="result-view">
                                        <div className="result-image-container">
                                            <img src={resultImage} alt="Generated" />
                                        </div>
                                        <div className="result-toolbar">
                                            <button className="toolbar-btn primary" onClick={handleDownload}>
                                                下载
                                            </button>
                                            <button className="toolbar-btn" onClick={handleCopy}>
                                                复制
                                            </button>
                                            <button 
                                                className="toolbar-btn"
                                                onClick={() => {
                                                    setReferenceImage({ data: resultImage, mimeType: 'image/png' });
                                                    setActiveMode('img2img');
                                                }}
                                            >
                                                参考创作
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="empty-view">
                                        <div className="empty-illustration">
                                            <span className="empty-emoji">🎨</span>
                                        </div>
                                        <h3>开始你的创作</h3>
                                        <p>{getModeDescription()}</p>
                                    </div>
                                )}
                            </div>

                            <div className="control-section">
                                <label className="control-label">创作模式</label>
                                <div className="mode-tabs">
                                    <button
                                        className={`mode-tab ${activeMode === 'text2img' ? 'active' : ''}`}
                                        onClick={() => setActiveMode('text2img')}
                                    >
                                        <span className="tab-icon">📝</span>
                                        <span className="tab-title">文生图</span>
                                    </button>
                                    <button
                                        className={`mode-tab ${activeMode === 'img2img' ? 'active' : ''}`}
                                        onClick={() => setActiveMode('img2img')}
                                    >
                                        <span className="tab-icon">🎨</span>
                                        <span className="tab-title">图生图</span>
                                    </button>
                                    <button
                                        className={`mode-tab ${activeMode === 'outpaint' ? 'active' : ''}`}
                                        onClick={() => setActiveMode('outpaint')}
                                    >
                                        <span className="tab-icon">🔍</span>
                                        <span className="tab-title">扩图</span>
                                    </button>
                                </div>
                            </div>

                            {/* Welcome Tip Card - Mobile Only */}
                            {!resultImage && !isGenerating && showWelcomeTip && (
                                <div className="welcome-tip-card">
                                    <button className="tip-close" onClick={dismissWelcomeTip}>✕</button>
                                    <div className="tip-content">
                                        <span className="tip-emoji">💡</span>
                                        <div className="tip-text">
                                            <strong>提示</strong>
                                            <p>{getModeDescription()}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeMode === 'img2img' && (
                                <div className="control-section">
                                    <label className="control-label">参考图片</label>
                                    <ImageToImageUploader
                                        onImageReady={setReferenceImage}
                                        currentImage={referenceImage?.data}
                                    />
                                </div>
                            )}

                            {activeMode === 'outpaint' && (
                                <div className="control-section">
                                    <label className="control-label">扩图编辑</label>
                                    <OutpaintEditor onCompositeReady={setOutpaintData} />
                                </div>
                            )}

                            <div className="control-section">
                                <div className="label-row">
                                    <label className="control-label">提示词</label>
                                    <button 
                                        className="inspiration-toggle"
                                        onClick={() => setShowInspiration(!showInspiration)}
                                    >
                                        灵感
                                    </button>
                                </div>
                                <div className="prompt-box">
                                    <textarea
                                        placeholder="描述你想要的画面..."
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        rows={3}
                                    />
                                    <div className="prompt-footer">
                                        <button 
                                            className="clear-prompt"
                                            onClick={() => setPrompt('')}
                                            disabled={!prompt}
                                        >
                                            清空
                                        </button>
                                        <span className="char-count">{prompt.length}</span>
                                    </div>
                                </div>

                                {showInspiration && (
                                    <div className="inspiration-panel">
                                        <div className="inspiration-list">
                                            {inspirationPrompts.map((item, idx) => (
                                                <button
                                                    key={idx}
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
                                    </div>
                                )}
                            </div>

                            <div className="control-section">
                                <label className="control-label">模型</label>
                                <div className="model-options">
                                    {MODELS.map((model) => (
                                        <button
                                            key={model.id}
                                            className={`model-option ${selectedModel === model.id ? 'active' : ''}`}
                                            onClick={() => setSelectedModel(model.id)}
                                        >
                                            <span className="option-name">{model.name}</span>
                                            <span className="option-desc">{model.description}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="control-section">
                                <label className="control-label">图片比例</label>
                                <div className="ratio-options">
                                    {ASPECT_RATIOS.map((r) => (
                                        <button
                                            key={r.id}
                                            className={`ratio-option ${selectedRatio === r.id ? 'active' : ''}`}
                                            onClick={() => setSelectedRatio(r.id)}
                                        >
                                            {r.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {selectedModel === 'gemini-3-pro-image-preview' && (
                                <div className="control-section">
                                    <label className="control-label">分辨率</label>
                                    <div className="resolution-options">
                                        {RESOLUTIONS.map((res) => (
                                            <button
                                                key={res.id}
                                                className={`resolution-option ${selectedResolution === res.id ? 'active' : ''}`}
                                                onClick={() => setSelectedResolution(res.id)}
                                            >
                                                {res.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button
                                className="generate-button"
                                disabled={isGenerating || !prompt.trim()}
                                onClick={handleGenerate}
                            >
                                {isGenerating ? (
                                    <>
                                        <span className="btn-spinner"></span>
                                        生成中 {Math.round(generationProgress)}%
                                    </>
                                ) : (
                                    <>开始生成</>
                                )}
                            </button>

                            {error && (
                                <div className="error-alert">
                                    {error}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="history-view">
                        <h2 className="view-title">生成历史</h2>
                        {Object.keys(groupedHistory).length > 0 ? (
                            <div className="history-list">
                                {Object.entries(groupedHistory).map(([date, items]: [string, any]) => (
                                    <div key={date} className="history-group">
                                        <h3 className="history-date">{date}</h3>
                                        <div className="history-grid">
                                            {items.map((item: HistoryItem) => (
                                                <div
                                                    key={item.id}
                                                    className="history-item"
                                                    onClick={() => {
                                                        setResultImage(item.imageUrl);
                                                        setPrompt(item.prompt);
                                                        setActiveTab('generate');
                                                    }}
                                                >
                                                    <img src={item.thumbnailUrl || item.imageUrl} alt="" loading="lazy" />
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
        </div>
    );
}
