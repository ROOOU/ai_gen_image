'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import OutpaintEditor from '@/components/OutpaintEditor';
import HistoryPanel from '@/components/HistoryPanel';

// --- Constants & Types ---

const MODELS = [
  { id: 'gemini-2.5-flash-image', name: 'Nano Flash', description: 'Fast & Efficient', supports4K: false },
  { id: 'gemini-3-pro-image-preview', name: 'Nano Pro', description: 'Professional Quality', supports4K: true },
];

const ASPECT_RATIOS = [
  { id: 'auto', name: '🔄 Auto' },
  { id: '1:1', name: '1:1 Square' },
  { id: '9:16', name: '9:16 Story' },
  { id: '16:9', name: '16:9 Wide' },
  { id: '3:2', name: '3:2 Photo' },
  { id: '2:3', name: '2:3 Portrait' },
];

const RESOLUTIONS = [
  { id: '1K', name: '1K Standard' },
  { id: '2K', name: '2K HD' },
  { id: '4K', name: '4K Ultra' },
];

const MAX_IMAGES = 10;

interface UploadedImage { data: string; name: string; mimeType: string; }
interface GeneratedImage { data: string; mimeType: string; }
interface OutpaintData {
  compositeImage: string; maskImage: string; originalImage: string;
  originalX: number; originalY: number; originalWidth: number; originalHeight: number;
  width: number; height: number; targetWidth: number; targetHeight: number; scale: number;
}

// --- Component ---

export default function Home() {
  // UI State
  const [activeTab, setActiveTab] = useState<'create' | 'gallery' | 'history'>('create');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Auth & Settings
  const [apiKey, setApiKey] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  // Generation State
  const [activeMode, setActiveMode] = useState<'text2img' | 'img2img' | 'outpaint'>('text2img');
  const [selectedModel, setSelectedModel] = useState(MODELS[1].id);
  const [selectedRatio, setSelectedRatio] = useState('auto');
  const [selectedResolution, setSelectedResolution] = useState('1K');
  const [prompt, setPrompt] = useState('');
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultImages, setResultImages] = useState<GeneratedImage[]>([]);
  const [resultText, setResultText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outpaintData, setOutpaintData] = useState<OutpaintData | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persistence
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  // Auto-switch to gallery on mobile when generating
  useEffect(() => {
    if (isGenerating && window.innerWidth < 1024) setActiveTab('gallery');
  }, [isGenerating]);

  // --- Handlers ---

  const testApiKey = async (keyToTest: string) => {
    if (!keyToTest.trim()) return;
    setApiKeyStatus('testing');
    try {
      const res = await fetch('/api/gemini', { headers: { 'x-api-key': keyToTest.trim() } });
      const data = await res.json();
      if (data.success) {
        setApiKeyStatus('valid');
        localStorage.setItem('gemini_api_key', keyToTest.trim());
        setStatusMsg('API Key Verified Successfully');
      } else {
        setApiKeyStatus('invalid');
        setStatusMsg(data.error || 'Invalid API Key');
      }
    } catch {
      setApiKeyStatus('invalid');
      setStatusMsg('Connection Error');
    }
    setTimeout(() => setStatusMsg(''), 3000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newImgs: UploadedImage[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setUploadedImages(prev => [...prev, { data: ev.target?.result as string, name: file.name, mimeType: file.type }]);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleGenerate = async () => {
    if (!apiKey) { setError('Please set your API Key first'); return; }
    if (isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setResultImages([]);

    try {
      const body: any = {
        model: selectedModel,
        prompt: prompt.trim() || (activeMode === 'outpaint' ? 'Expand this image' : 'A beautiful photo'),
      };

      if (activeMode === 'outpaint' && outpaintData) {
        body.images = [
          { data: outpaintData.compositeImage, mimeType: 'image/jpeg' },
          { data: outpaintData.maskImage, mimeType: 'image/png' }
        ];
      } else if (activeMode === 'img2img' && uploadedImages.length > 0) {
        body.images = uploadedImages.map(img => ({ data: img.data, mimeType: img.mimeType }));
      }

      if (selectedRatio !== 'auto') body.aspectRatio = selectedRatio;

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey.trim() },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (data.success) {
        setResultImages(data.images || []);
        setResultText(data.text || null);

        // Save to History
        if (data.images?.[0]) {
          fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey.trim() },
            body: JSON.stringify({
              imageData: data.images[0].data,
              prompt: body.prompt,
              mode: activeMode,
              model: selectedModel
            })
          }).catch(console.error);
        }
      } else {
        setError(data.error || 'Generation failed');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadImage = (img: GeneratedImage) => {
    const link = document.createElement('a');
    link.href = img.data;
    link.download = `banana-${Date.now()}.jpg`;
    link.click();
  };

  // --- Render Sections ---

  const renderSidebar = () => (
    <aside className={`panel ${activeTab === 'create' ? 'mobile-visible' : ''}`}>
      <div className="panel-header">
        <span style={{ fontSize: 24 }}>🍌</span>
        <span className="logo-text">Nano Banana</span>
      </div>

      <div className="panel-content">
        {/* API Section */}
        <section>
          <h2>Credentials</h2>
          <div className="textarea-wrapper" style={{ minHeight: 'auto', padding: '10px 16px' }}>
            <input
              type="password"
              placeholder="Google AI API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={() => testApiKey(apiKey)}
              style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', width: '100%', fontSize: 13 }}
            />
          </div>
          {statusMsg && <p style={{ fontSize: 11, color: apiKeyStatus === 'valid' ? 'var(--ios-success)' : 'var(--ios-danger)', marginTop: 8 }}>{statusMsg}</p>}
        </section>

        {/* Mode Switcher */}
        <section>
          <h2>Creation Mode</h2>
          <div className="selection-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <button className={`selection-btn ${activeMode === 'text2img' ? 'active' : ''}`} onClick={() => setActiveMode('text2img')}>Text</button>
            <button className={`selection-btn ${activeMode === 'img2img' ? 'active' : ''}`} onClick={() => setActiveMode('img2img')}>Ref</button>
            <button className={`selection-btn ${activeMode === 'outpaint' ? 'active' : ''}`} onClick={() => setActiveMode('outpaint')}>Expand</button>
          </div>
        </section>

        {/* Prompt Section */}
        <section>
          <h2>Prompt</h2>
          <div className="textarea-wrapper">
            <textarea
              placeholder="Describe your imagination..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
        </section>

        {/* Configuration */}
        <section>
          <h2>Parameters</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Aspect Ratio</p>
              <div className="selection-grid">
                {ASPECT_RATIOS.map(r => (
                  <button key={r.id} className={`selection-btn ${selectedRatio === r.id ? 'active' : ''}`} onClick={() => setSelectedRatio(r.id)}>{r.name.split(' ')[0]}</button>
                ))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Model & Speed</p>
              <select
                className="selection-btn"
                style={{ width: '100%', textAlign: 'left', appearance: 'none' }}
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {MODELS.map(m => <option key={m.id} value={m.id}>{m.name} - {m.description}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* Uploads (Conditional) */}
        {activeMode === 'img2img' && (
          <section>
            <h2>References ({uploadedImages.length}/{MAX_IMAGES})</h2>
            <div
              style={{ padding: 12, border: '1px dashed var(--border-color)', borderRadius: 12, textAlign: 'center', cursor: 'pointer', fontSize: 13, color: 'var(--accent-primary)' }}
              onClick={() => fileInputRef.current?.click()}
            >
              + Upload Images
            </div>
            <input ref={fileInputRef} type="file" multiple accept="image/*" hidden onChange={handleFileUpload} />
          </section>
        )}

        {/* Outpaint Editor (Conditional) */}
        {activeMode === 'outpaint' && (
          <section>
            <h2>Outpaint Canvas</h2>
            <OutpaintEditor onCompositeReady={setOutpaintData} />
          </section>
        )}

        <button
          className="btn-primary"
          disabled={isGenerating || (!prompt.trim() && activeMode !== 'outpaint')}
          onClick={handleGenerate}
          style={{ marginTop: 'auto' }}
        >
          {isGenerating ? '🎨 Crafting...' : '✨ Generate'}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="app-container">
      {renderSidebar()}

      <main className={`main-stage ${activeTab === 'gallery' ? 'mobile-visible' : ''}`}>
        <header className="canvas-header">
          <h1 style={{ fontSize: 16, fontWeight: 600 }}>Workbench</h1>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="selection-btn" style={{ padding: '6px 12px' }} onClick={() => setIsHistoryOpen(true)}>📜 History</button>
          </div>
        </header>

        <div className={`canvas-content ${isGenerating ? 'shimmer-active' : ''}`}>
          {error ? (
            <div style={{ color: 'var(--ios-danger)', textAlign: 'center' }}>
              <p style={{ fontSize: 40 }}>⚠️</p>
              <p>{error}</p>
              <button className="ios-secondary-btn" style={{ marginTop: 12 }} onClick={() => setError(null)}>Retry</button>
            </div>
          ) : isGenerating ? (
            <div style={{ textAlign: 'center' }}>
              <div className="loading-spinner" style={{ width: 48, height: 48, marginBottom: 24 }}></div>
              <p style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-secondary)' }}>AI is visualizing your thoughts...</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>Estimated time: 10-20 seconds</p>
            </div>
          ) : resultImages.length > 0 ? (
            <div className="result-card">
              <img src={resultImages[0].data} className="result-image" alt="Output" />
              <div className="result-footer">
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="selection-btn" onClick={() => downloadImage(resultImages[0])}>📥 Download</button>
                  <button className="selection-btn">🔗 Share</button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Generated with {MODELS.find(m => m.id === selectedModel)?.name}</p>
              </div>
              {resultText && (
                <div style={{ padding: '0 24px 20px', fontSize: 13, color: 'var(--text-secondary)', borderTop: '0.5px solid var(--border-color)', paddingTop: 16 }}>
                  {resultText}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', opacity: 0.5 }}>
              <p style={{ fontSize: 80 }}>🌴</p>
              <h2 style={{ textTransform: 'none', color: 'white', fontSize: 24, marginTop: 16 }}>Ready to Create?</h2>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Input a prompt or upload an image to start.</p>
            </div>
          )}
        </div>
      </main>

      {/* History Panel Integration (Handled by existing component) */}
      <HistoryPanel
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectItem={(item) => {
          setResultImages([{ data: item.imageUrl, mimeType: 'image/jpeg' }]);
          setPrompt(item.prompt);
          setIsHistoryOpen(false);
        }}
        apiKey={apiKey}
      />

      {/* Mobile Nav */}
      <nav className="floating-nav">
        <div className={`nav-item ${activeTab === 'create' ? 'active' : ''}`} onClick={() => setActiveTab('create')}>
          <span>✍️</span> <span>Create</span>
        </div>
        <div className={`nav-item ${activeTab === 'gallery' ? 'active' : ''}`} onClick={() => setActiveTab('gallery')}>
          <span>🖼️</span> <span>Gallery</span>
        </div>
        <div className={`nav-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setIsHistoryOpen(true)}>
          <span>📜</span> <span>Archive</span>
        </div>
      </nav>
    </div>
  );
}
