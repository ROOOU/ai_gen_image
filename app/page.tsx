'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import OutpaintEditor from '@/components/OutpaintEditor';

// --- Constants & Types ---

const MODELS = [
  { id: 'gemini-2.5-flash-image', name: 'Nano Flash', description: 'Fast & Efficient' },
  { id: 'gemini-3-pro-image-preview', name: 'Nano Pro', description: 'Professional Quality' },
];

const ASPECT_RATIOS = [
  { id: '1:1', name: '1:1', icon: '正方形' },
  { id: '9:16', name: '9:16', icon: '手机竖屏' },
  { id: '16:9', name: '16:9', icon: '宽屏' },
  { id: '3:2', name: '3:2', icon: '摄影' },
  { id: '2:3', name: '2:3', icon: '肖像' },
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

// --- Main Component ---

export default function Home() {
  const [activeView, setActiveView] = useState<'inspiration' | 'generate' | 'assets' | 'canvas' | 'api'>('generate');
  const [activeCategory, setActiveCategory] = useState('图片');

  // States carry over from previous logic
  const [apiKey, setApiKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState(MODELS[1].id);
  const [selectedRatio, setSelectedRatio] = useState('1:1');
  const [isGenerating, setIsGenerating] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<'text2img' | 'img2img' | 'outpaint'>('text2img');
  const [outpaintData, setOutpaintData] = useState<any>(null);

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
    } catch (err) { console.error('Failed to load history', err); }
  };

  const handleGenerate = async () => {
    if (!apiKey) { setError('请先配置 API Key'); setActiveView('api'); return; }
    setIsGenerating(true);
    setError(null);
    try {
      const body: any = { model: selectedModel, prompt: prompt.trim() || 'A masterpiece' };
      if (selectedRatio) body.aspectRatio = selectedRatio;
      if (activeMode === 'outpaint' && outpaintData) {
        body.images = [
          { data: outpaintData.compositeImage, mimeType: 'image/jpeg' },
          { data: outpaintData.maskImage, mimeType: 'image/png' }
        ];
      }
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        setResultImage(data.images[0].data);
        // Trigger history save
        await fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({ imageData: data.images[0].data, prompt: body.prompt, mode: activeMode, model: selectedModel })
        });
        loadHistory();
      } else { setError(data.error); }
    } catch (err: any) { setError(err.message); }
    finally { setIsGenerating(false); }
  };

  // Group history by date
  const groupedHistory = history.reduce((groups: any, item) => {
    const date = new Date(item.timestamp).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
    const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
    const label = date === today ? '今天' : date;
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
    return groups;
  }, {});

  return (
    <div className="pro-layout pro-theme">
      {/* 🚀 左侧图标侧边栏 */}
      <aside className="pro-sidebar">
        <div className="pro-sidebar-logo">🍌</div>
        <nav className="pro-nav-list">
          <button className={`pro-nav-item ${activeView === 'inspiration' ? 'active' : ''}`} onClick={() => setActiveView('inspiration')}>
            <span className="nav-icon">💡</span>
            <span className="nav-label-small">灵感</span>
          </button>
          <button className={`pro-nav-item ${activeView === 'generate' ? 'active' : ''}`} onClick={() => setActiveView('generate')}>
            <span className="nav-icon">✨</span>
            <span className="nav-label-small">生成</span>
          </button>
          <button className={`pro-nav-item ${activeView === 'assets' ? 'active' : ''}`} onClick={() => setActiveView('assets')}>
            <span className="nav-icon">📁</span>
            <span className="nav-label-small">资产</span>
          </button>
          <button className={`pro-nav-item ${activeView === 'canvas' ? 'active' : ''}`} onClick={() => setActiveView('canvas')}>
            <span className="nav-icon">🖼️</span>
            <span className="nav-label-small">画布</span>
          </button>
        </nav>
        <div className="pro-sidebar-bottom">
          <button className={`pro-nav-item ${activeView === 'api' ? 'active' : ''}`} onClick={() => setActiveView('api')}>
            <span className="nav-icon">⚙️</span>
          </button>
        </div>
      </aside>

      {/* 🎬 主内容舞台 */}
      <main className="pro-stage">
        {/* 顶部导航 */}
        <header className="pro-top-nav">
          {['图片', '视频', '无限画布', '图片编辑器', '故事', '音频'].map(cat => (
            <button
              key={cat}
              className={`top-cat-item ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
            <button className="top-cat-item">所有图片</button>
            <button className="top-cat-item">超清</button>
            <button className="top-cat-item">我的收藏</button>
          </div>
        </header>

        {/* 视图内容切换 */}
        <div className="pro-view-content">
          {activeView === 'generate' && (
            <div className="pro-workbench">
              <div className="workbench-controls">
                <div>
                  <p className="pro-section-title">创作模式</p>
                  <div className="selection-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    <button className={`selection-btn ${activeMode === 'text2img' ? 'active' : ''}`} onClick={() => setActiveMode('text2img')}>文本</button>
                    <button className={`selection-btn ${activeMode === 'img2img' ? 'active' : ''}`} onClick={() => setActiveMode('img2img')}>参考</button>
                    <button className={`selection-btn ${activeMode === 'outpaint' ? 'active' : ''}`} onClick={() => setActiveMode('outpaint')}>扩图</button>
                  </div>
                </div>

                <div>
                  <p className="pro-section-title">提示词</p>
                  <textarea
                    className="pro-input-group"
                    style={{ width: '100%', height: 120, background: '#0A0A0B', border: '1px solid #222', padding: 12, fontSize: 13 }}
                    placeholder="描述你想要的画面..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                </div>

                <div>
                  <p className="pro-section-title">图片比例</p>
                  <div className="selection-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    {ASPECT_RATIOS.map(r => (
                      <button key={r.id} className={`selection-btn ${selectedRatio === r.id ? 'active' : ''}`} onClick={() => setSelectedRatio(r.id)}>{r.name}</button>
                    ))}
                  </div>
                </div>

                <button
                  className="btn-primary"
                  style={{ marginTop: 'auto', background: 'var(--pro-accent)', color: '#000' }}
                  disabled={isGenerating}
                  onClick={handleGenerate}
                >
                  {isGenerating ? '生成中...' : '开始生成'}
                </button>
              </div>

              <div className="workbench-canvas">
                {isGenerating ? (
                  <div style={{ textAlign: 'center' }}>
                    <div className="loading-spinner" style={{ width: 48, height: 48, borderColor: 'var(--pro-accent) transparent transparent transparent' }}></div>
                    <p style={{ marginTop: 20, color: 'var(--pro-text-dim)' }}>正在构思艺术品...</p>
                  </div>
                ) : resultImage ? (
                  <div style={{ maxWidth: '100%', maxHeight: '100%' }}>
                    <img src={resultImage} style={{ maxWidth: '100%', borderRadius: 8 }} alt="Result" />
                  </div>
                ) : activeMode === 'outpaint' ? (
                  <div style={{ width: '100%', maxWidth: 600 }}><OutpaintEditor onCompositeReady={setOutpaintData} /></div>
                ) : (
                  <div style={{ textAlign: 'center', opacity: 0.3 }}>
                    <span style={{ fontSize: 64 }}>🍌</span>
                    <p>准备好开始创作了吗？</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeView === 'assets' && (
            <div className="pro-assets-view">
              {Object.keys(groupedHistory).length > 0 ? Object.entries(groupedHistory).map(([date, items]: [string, any]) => (
                <div key={date} className="date-group">
                  <h3 className="date-group-title">{date}</h3>
                  <div className="asset-grid">
                    {items.map((item: HistoryItem) => (
                      <div key={item.id} className="asset-card" onClick={() => { setResultImage(item.imageUrl); setPrompt(item.prompt); setActiveView('generate'); }}>
                        <img src={item.thumbnailUrl || item.imageUrl} alt={item.prompt} loading="lazy" />
                        <div className="asset-card-overlay">
                          <p style={{ fontSize: 10, color: '#fff' }}>{item.prompt.slice(0, 20)}...</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )) : (
                <div style={{ textAlign: 'center', padding: '100px 0', opacity: 0.5 }}>
                  <p style={{ fontSize: 48 }}>📭</p>
                  <p>暂无资产记录</p>
                </div>
              )}
            </div>
          )}

          {activeView === 'api' && (
            <div style={{ maxWidth: 400, margin: '100px auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
              <h2 style={{ textAlign: 'center' }}>API 配置</h2>
              <div className="pro-input-group">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); localStorage.setItem('gemini_api_key', e.target.value); }}
                  placeholder="Google AI API Key"
                  style={{ width: '100%', background: 'transparent', border: 'none', color: '#fff', outline: 'none' }}
                />
              </div>
              <p style={{ fontSize: 12, color: 'var(--pro-text-dim)', textAlign: 'center' }}>Key 安全存储在本地浏览器中</p>
            </div>
          )}

          {activeView === 'inspiration' && (
            <div style={{ textAlign: 'center', padding: '100px 0', opacity: 0.5 }}>
              <h2>灵感模块开发中...</h2>
              <p>敬请期待更多创意内容</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
