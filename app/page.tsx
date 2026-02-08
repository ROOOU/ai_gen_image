'use client';

import { useState, useEffect, useCallback } from 'react';
import OutpaintEditor from '@/components/OutpaintEditor';
import ImageToImageUploader from '@/components/ImageToImageUploader';

const MODELS = [
    { id: 'gemini-2.5-flash-image', name: 'Nano Flash', description: '快速高效，适合日常创作' },
    { id: 'gemini-3-pro-image-preview', name: 'Nano Pro', description: '专业级质量，支持高分辨率' },
];

const ASPECT_RATIOS = [
    { id: '1:1', name: '1:1', label: '正方形' },
    { id: '9:16', name: '9:16', label: '手机竖屏' },
    { id: '16:9', name: '16:9', label: '宽屏' },
    { id: '3:2', name: '3:2', label: '摄影' },
    { id: '2:3', name: '2:3', label: '肖像' },
];

const RESOLUTIONS = [
    { id: '1K', name: '1K', width: 1024 },
    { id: '2K', name: '2K', width: 2048 },
    { id: '4K', name: '4K', width: 4096 },
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
    const [activeView, setActiveView] = useState<'inspiration' | 'generate' | 'assets' | 'canvas' | 'api'>('generate');
    const [apiKey, setApiKey] = useState('');
    const [prompt, setPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('');
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
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
    const [generationProgress, setGenerationProgress] = useState(0);

    useEffect(() => {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) setApiKey(savedKey);
        loadHistory();
    }, []);

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
            setActiveView('api');
            return;
        }

        if (!prompt.trim()) {
            setError('请输入提示词');
            return;
        }

        setIsGenerating(true);
        setError(null);
        setGenerationProgress(0);

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

    return (
        <div className="pro-layout pro-theme">
            <aside className="pro-sidebar">
                <div className="pro-sidebar-logo">🍌</div>
                <nav className="pro-nav-list">
                    <button
                        className={`pro-nav-item ${activeView === 'inspiration' ? 'active' : ''}`}
                        onClick={() => setActiveView('inspiration')}
                    >
                        <span className="nav-icon">💡</span>
                        <span className="nav-label-small">灵感</span>
                    </button>
                    <button
                        className={`pro-nav-item ${activeView === 'generate' ? 'active' : ''}`}
                        onClick={() => setActiveView('generate')}
                    >
                        <span className="nav-icon">✨</span>
                        <span className="nav-label-small">生成</span>
                    </button>
                    <button
                        className={`pro-nav-item ${activeView === 'assets' ? 'active' : ''}`}
                        onClick={() => setActiveView('assets')}
                    >
                        <span className="nav-icon">📁</span>
                        <span className="nav-label-small">资产</span>
                    </button>
                </nav>
                <div className="pro-sidebar-bottom">
                    <button
                        className={`pro-nav-item ${activeView === 'api' ? 'active' : ''}`}
                        onClick={() => setActiveView('api')}
                        title="API 设置"
                    >
                        <span className="nav-icon">⚙️</span>
                    </button>
                </div>
            </aside>

            <main className="pro-stage">
                <header className="pro-top-nav">
                    {['图片', '视频', '无限画布'].map((cat) => (
                        <button
                            key={cat}
                            className={`top-cat-item ${cat === '图片' ? 'active' : ''}`}
                        >
                            {cat}
                        </button>
                    ))}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
                        {apiKey ? (
                            <span style={{ fontSize: 12, color: 'var(--pro-accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--pro-accent)' }}></span>
                                API 已连接
                            </span>
                        ) : (
                            <button
                                className="top-cat-item"
                                onClick={() => setActiveView('api')}
                                style={{ color: '#ef4444' }}
                            >
                                未设置 API Key
                            </button>
                        )}
                    </div>
                </header>

                <div className="pro-view-content">
                    {activeView === 'generate' && (
                        <div className="pro-workbench">
                            <div className="workbench-controls">
                                <div>
                                    <p className="pro-section-title">创作模式</p>
                                    <div className="mode-selector">
                                        <button
                                            className={`mode-btn ${activeMode === 'text2img' ? 'active' : ''}`}
                                            onClick={() => setActiveMode('text2img')}
                                        >
                                            <span className="mode-icon">📝</span>
                                            <span className="mode-label">文生图</span>
                                            <span className="mode-desc">文本生成图片</span>
                                        </button>
                                        <button
                                            className={`mode-btn ${activeMode === 'img2img' ? 'active' : ''}`}
                                            onClick={() => setActiveMode('img2img')}
                                        >
                                            <span className="mode-icon">🎨</span>
                                            <span className="mode-label">图生图</span>
                                            <span className="mode-desc">基于参考图创作</span>
                                        </button>
                                        <button
                                            className={`mode-btn ${activeMode === 'outpaint' ? 'active' : ''}`}
                                            onClick={() => setActiveMode('outpaint')}
                                        >
                                            <span className="mode-icon">🔍</span>
                                            <span className="mode-label">扩图</span>
                                            <span className="mode-desc">扩展图片边界</span>
                                        </button>
                                    </div>
                                </div>

                                {activeMode === 'img2img' && (
                                    <div>
                                        <p className="pro-section-title">参考图片</p>
                                        <ImageToImageUploader
                                            onImageReady={setReferenceImage}
                                            currentImage={referenceImage?.data}
                                        />
                                    </div>
                                )}

                                {activeMode === 'outpaint' && (
                                    <div>
                                        <p className="pro-section-title">扩图编辑</p>
                                        <OutpaintEditor onCompositeReady={setOutpaintData} />
                                    </div>
                                )}

                                <div>
                                    <p className="pro-section-title">提示词</p>
                                    <div className="prompt-input-wrapper">
                                        <textarea
                                            className="prompt-textarea"
                                            placeholder="描述你想要的画面，例如：一只可爱的猫咪在草地上玩耍..."
                                            value={prompt}
                                            onChange={(e) => setPrompt(e.target.value)}
                                            rows={4}
                                        />
                                        <div className="prompt-actions">
                                            <button
                                                className="prompt-action-btn"
                                                onClick={() => setPrompt('')}
                                                disabled={!prompt}
                                            >
                                                清空
                                            </button>
                                            <span className="prompt-count">{prompt.length} 字</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <p className="pro-section-title">模型选择</p>
                                    <div className="model-selector">
                                        {MODELS.map((model) => (
                                            <button
                                                key={model.id}
                                                className={`model-btn ${selectedModel === model.id ? 'active' : ''}`}
                                                onClick={() => setSelectedModel(model.id)}
                                            >
                                                <span className="model-name">{model.name}</span>
                                                <span className="model-desc">{model.description}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <p className="pro-section-title">图片比例</p>
                                    <div className="ratio-grid">
                                        {ASPECT_RATIOS.map((r) => (
                                            <button
                                                key={r.id}
                                                className={`ratio-btn ${selectedRatio === r.id ? 'active' : ''}`}
                                                onClick={() => setSelectedRatio(r.id)}
                                            >
                                                <span className="ratio-name">{r.name}</span>
                                                <span className="ratio-label">{r.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {selectedModel === 'gemini-3-pro-image-preview' && (
                                    <div>
                                        <p className="pro-section-title">分辨率</p>
                                        <div className="resolution-grid">
                                            {RESOLUTIONS.map((res) => (
                                                <button
                                                    key={res.id}
                                                    className={`resolution-btn ${selectedResolution === res.id ? 'active' : ''}`}
                                                    onClick={() => setSelectedResolution(res.id)}
                                                >
                                                    {res.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <button
                                    className="generate-btn"
                                    disabled={isGenerating || !prompt.trim()}
                                    onClick={handleGenerate}
                                >
                                    {isGenerating ? (
                                        <>
                                            <span className="spinner"></span>
                                            <span>生成中... {Math.round(generationProgress)}%</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>✨</span>
                                            <span>开始生成</span>
                                        </>
                                    )}
                                </button>

                                {error && (
                                    <div className="error-message">
                                        <span>⚠️</span>
                                        <span>{error}</span>
                                    </div>
                                )}
                            </div>

                            <div className="workbench-canvas">
                                {isGenerating ? (
                                    <div className="generating-state">
                                        <div className="progress-ring">
                                            <svg viewBox="0 0 100 100">
                                                <circle
                                                    className="progress-ring-bg"
                                                    cx="50"
                                                    cy="50"
                                                    r="45"
                                                />
                                                <circle
                                                    className="progress-ring-fill"
                                                    cx="50"
                                                    cy="50"
                                                    r="45"
                                                    style={{
                                                        strokeDasharray: `${2 * Math.PI * 45}`,
                                                        strokeDashoffset: `${2 * Math.PI * 45 * (1 - generationProgress / 100)}`,
                                                    }}
                                                />
                                            </svg>
                                            <div className="progress-text">{Math.round(generationProgress)}%</div>
                                        </div>
                                        <p className="generating-text">正在构思艺术品...</p>
                                    </div>
                                ) : resultImage ? (
                                    <div className="result-container">
                                        <div className="result-image-wrapper">
                                            <img src={resultImage} alt="Generated" className="result-image" />
                                        </div>
                                        <div className="result-actions">
                                            <button className="result-btn primary" onClick={handleDownload}>
                                                <span>⬇️</span>
                                                <span>下载</span>
                                            </button>
                                            <button className="result-btn" onClick={handleCopy}>
                                                <span>📋</span>
                                                <span>复制</span>
                                            </button>
                                            <button
                                                className="result-btn"
                                                onClick={() => {
                                                    setReferenceImage({ data: resultImage, mimeType: 'image/png' });
                                                    setActiveMode('img2img');
                                                }}
                                            >
                                                <span>🎨</span>
                                                <span>以此为参考</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="empty-state">
                                        <div className="empty-icon">🍌</div>
                                        <p className="empty-title">准备好开始创作了吗？</p>
                                        <p className="empty-desc">
                                            {activeMode === 'text2img' && '输入提示词，让 AI 为你生成独特的图片'}
                                            {activeMode === 'img2img' && '上传参考图片，让 AI 在此基础上创作'}
                                            {activeMode === 'outpaint' && '上传图片并扩展边界，创造更大画面'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeView === 'assets' && (
                        <div className="pro-assets-view">
                            {Object.keys(groupedHistory).length > 0 ? (
                                Object.entries(groupedHistory).map(([date, items]: [string, any]) => (
                                    <div key={date} className="date-group">
                                        <h3 className="date-group-title">{date}</h3>
                                        <div className="asset-grid">
                                            {items.map((item: HistoryItem) => (
                                                <div
                                                    key={item.id}
                                                    className="asset-card"
                                                    onClick={() => {
                                                        setResultImage(item.imageUrl);
                                                        setPrompt(item.prompt);
                                                        setActiveView('generate');
                                                    }}
                                                >
                                                    <img src={item.thumbnailUrl || item.imageUrl} alt={item.prompt} loading="lazy" />
                                                    <div className="asset-card-overlay">
                                                        <span className="asset-card-mode">{getModeLabel(item.mode)}</span>
                                                        <p className="asset-card-prompt">{item.prompt}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="empty-assets">
                                    <span className="empty-assets-icon">📭</span>
                                    <p>暂无生成记录</p>
                                    <p className="empty-assets-hint">开始创作你的第一幅作品吧</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeView === 'api' && (
                        <div className="api-settings">
                            <div className="api-settings-card">
                                <h2>API 配置</h2>
                                <p className="api-settings-desc">请配置您的 Google AI Studio API Key 以开始使用</p>
                                
                                <div className="api-input-group">
                                    <label>API Key</label>
                                    <input
                                        type="password"
                                        value={apiKey}
                                        onChange={(e) => {
                                            setApiKey(e.target.value);
                                            localStorage.setItem('gemini_api_key', e.target.value);
                                        }}
                                        placeholder="输入您的 API Key"
                                    />
                                    <p className="api-input-hint">
                                        API Key 仅存储在本地浏览器中，不会上传到服务器
                                    </p>
                                </div>

                                <div className="api-info">
                                    <h3>如何获取 API Key？</h3>
                                    <ol>
                                        <li>访问 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a></li>
                                        <li>登录您的 Google 账号</li>
                                        <li>点击 &quot;Create API Key&quot; 创建新密钥</li>
                                        <li>复制生成的密钥并粘贴到上方输入框</li>
                                    </ol>
                                </div>

                                <div className="api-actions">
                                    <button
                                        className="api-test-btn"
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
                                                if (data.success) {
                                                    alert('API Key 验证成功！');
                                                } else {
                                                    alert(`验证失败: ${data.error}`);
                                                }
                                            } catch {
                                                alert('验证请求失败');
                                            }
                                        }}
                                        disabled={!apiKey}
                                    >
                                        测试连接
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeView === 'inspiration' && (
                        <div className="inspiration-view">
                            <div className="inspiration-header">
                                <h2>灵感画廊</h2>
                                <p>探索 AI 艺术创作的无限可能</p>
                            </div>
                            <div className="inspiration-grid">
                                {[
                                    { title: '赛博朋克城市', prompt: 'Cyberpunk city at night, neon lights, rain, futuristic', style: '🌃' },
                                    { title: '梦幻森林', prompt: 'Enchanted forest with glowing mushrooms, fairy lights, magical atmosphere', style: '🌲' },
                                    { title: '未来科技', prompt: 'Futuristic technology interface, holographic displays, sleek design', style: '🚀' },
                                    { title: '古风山水', prompt: 'Traditional Chinese landscape painting, mountains, mist, ink wash style', style: '🏔️' },
                                    { title: '可爱动物', prompt: 'Cute fluffy kitten playing with yarn, soft lighting, cozy home', style: '🐱' },
                                    { title: '美食摄影', prompt: 'Gourmet food photography, delicious pasta, professional lighting', style: '🍝' },
                                ].map((item, idx) => (
                                    <div
                                        key={idx}
                                        className="inspiration-card"
                                        onClick={() => {
                                            setPrompt(item.prompt);
                                            setActiveView('generate');
                                        }}
                                    >
                                        <span className="inspiration-icon">{item.style}</span>
                                        <h4>{item.title}</h4>
                                        <p>{item.prompt}</p>
                                        <button className="inspiration-use-btn">使用此提示词</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
