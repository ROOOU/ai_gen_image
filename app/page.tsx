'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import OutpaintEditor from '@/components/OutpaintEditor';
import HistoryPanel from '@/components/HistoryPanel';

// 模型列表
const MODELS = [
  {
    id: 'gemini-2.5-flash-image',
    name: 'Nano Banana',
    description: '快速高效，适合批量生成',
    supports4K: false,
  },
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Nano Banana Pro',
    description: '专业级质量，支持高分辨率和复杂指令',
    supports4K: true,
  },
];

// 图片比例列表
const ASPECT_RATIOS = [
  { id: '1:1', name: '1:1 方形' },
  { id: '2:3', name: '2:3 竖版' },
  { id: '3:2', name: '3:2 横版' },
  { id: '3:4', name: '3:4 竖版' },
  { id: '4:3', name: '4:3 横版' },
  { id: '4:5', name: '4:5 竖版' },
  { id: '5:4', name: '5:4 横版' },
  { id: '9:16', name: '9:16 手机' },
  { id: '16:9', name: '16:9 宽屏' },
  { id: '21:9', name: '21:9 超宽' },
];

// 分辨率列表
const RESOLUTIONS = [
  { id: '1K', name: '1K' },
  { id: '2K', name: '2K' },
  { id: '4K', name: '4K' },
];

// 上传图片类型
interface UploadedImage {
  data: string;
  name: string;
  mimeType: string;
}

// 生成结果图片类型
interface GeneratedImage {
  data: string;
  mimeType: string;
}

// 扩图合成数据
interface OutpaintData {
  compositeImage: string;
  width: number;
  height: number;
}

// 最大上传图片数
const MAX_IMAGES = 14;

export default function Home() {
  // API Key 状态
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle');
  const [apiKeyMessage, setApiKeyMessage] = useState('');

  // 模式和配置
  const [activeTab, setActiveTab] = useState<'text2img' | 'img2img' | 'outpaint'>('text2img');
  const [selectedModel, setSelectedModel] = useState(MODELS[1].id); // 默认使用 Pro
  const [selectedRatio, setSelectedRatio] = useState('1:1');
  const [selectedResolution, setSelectedResolution] = useState('1K');

  // 生成状态
  const [prompt, setPrompt] = useState('');
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultImages, setResultImages] = useState<GeneratedImage[]>([]);
  const [resultText, setResultText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 扩图状态
  const [outpaintData, setOutpaintData] = useState<OutpaintData | null>(null);

  // 历史记录面板
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载保存的 API Key
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      setApiKey(savedKey);
      setApiKeyStatus('idle');
    }
  }, []);

  // 保存 API Key
  const saveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('gemini_api_key', apiKey.trim());
      setApiKeyMessage('API Key 已保存');
      setTimeout(() => setApiKeyMessage(''), 2000);
    }
  };

  // 测试 API Key
  const testApiKey = async () => {
    if (!apiKey.trim()) {
      setApiKeyStatus('invalid');
      setApiKeyMessage('请输入 API Key');
      return;
    }

    setApiKeyStatus('testing');
    setApiKeyMessage('正在验证...');

    try {
      const res = await fetch('/api/gemini', {
        method: 'GET',
        headers: {
          'x-api-key': apiKey.trim(),
        },
      });

      const data = await res.json();

      if (data.success) {
        setApiKeyStatus('valid');
        setApiKeyMessage('验证成功');
        saveApiKey();
      } else {
        setApiKeyStatus('invalid');
        setApiKeyMessage(data.error || '验证失败');
      }
    } catch (err) {
      setApiKeyStatus('invalid');
      setApiKeyMessage('网络错误');
    }
  };

  // 处理文件上传
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    processFiles(Array.from(files));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 处理文件
  const processFiles = (files: File[]) => {
    const remainingSlots = MAX_IMAGES - uploadedImages.length;
    if (remainingSlots <= 0) {
      setError(`最多只能上传 ${MAX_IMAGES} 张图片`);
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);

    filesToProcess.forEach((file) => {
      if (!file.type.startsWith('image/')) {
        setError('只支持图片文件');
        return;
      }

      if (file.size > 20 * 1024 * 1024) {
        setError('图片大小不能超过 20MB');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImages((prev) => [
          ...prev,
          {
            data: event.target?.result as string,
            name: file.name,
            mimeType: file.type,
          },
        ]);
        setActiveTab('img2img');
        setError(null);
      };
      reader.readAsDataURL(file);
    });
  };

  // 拖拽处理
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('dragover');
  };

  // 移除上传的图片
  const removeImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
  };

  // 处理扩图合成数据更新
  const handleOutpaintComposite = useCallback((compositeData: string, width: number, height: number) => {
    setOutpaintData({
      compositeImage: compositeData,
      width,
      height,
    });
  }, []);

  // 生成图片
  const handleGenerate = async () => {
    if (!apiKey.trim()) {
      setError('请先设置 API Key');
      return;
    }

    // 扩图模式需要有合成图
    if (activeTab === 'outpaint') {
      if (!outpaintData) {
        setError('请先上传要扩展的图片');
        return;
      }
    } else {
      if (!prompt.trim()) {
        setError('请输入提示词');
        return;
      }
    }

    setIsGenerating(true);
    setError(null);
    setResultImages([]);
    setResultText(null);

    try {
      const requestBody: Record<string, any> = {
        model: selectedModel,
      };

      if (activeTab === 'outpaint') {
        // 扩图模式：使用更明确的提示词
        // 关键是告诉 AI 这是一个 inpainting/outpainting 任务
        const baseInstruction = `This is an image editing task. The image contains a photograph surrounded by gray/neutral colored areas. Your task is to REGENERATE and FILL IN the gray areas with new content that naturally extends the original photograph. The gray areas should be completely replaced with realistic content that seamlessly blends with the original image. Maintain the same style, lighting, perspective, and color palette as the original photograph.`;

        const outpaintPrompt = prompt.trim()
          ? `${baseInstruction} Additional guidance for the extended areas: ${prompt.trim()}`
          : baseInstruction;


        requestBody.prompt = outpaintPrompt;
        requestBody.images = [{
          data: outpaintData!.compositeImage,
          mimeType: 'image/jpeg',
        }];
      } else {
        requestBody.prompt = prompt.trim();
        requestBody.aspectRatio = selectedRatio;

        // 如果是 Pro 模型，添加分辨率
        if (selectedModel === 'gemini-3-pro-image-preview') {
          requestBody.imageSize = selectedResolution;
        }

        // 如果有上传图片（图生图模式）
        if (uploadedImages.length > 0) {
          requestBody.images = uploadedImages.map((img) => ({
            data: img.data,
            mimeType: img.mimeType,
          }));
        }
      }

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
        },
        body: JSON.stringify(requestBody),
      });

      const data = await res.json();

      if (data.success) {
        setResultImages(data.images || []);
        setResultText(data.text || null);

        // 保存到历史记录（异步，不阻塞UI）
        if (data.images && data.images.length > 0) {
          const historyPrompt = activeTab === 'outpaint'
            ? (prompt.trim() || '扩展图片')
            : prompt.trim();

          fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageData: data.images[0].data,
              prompt: historyPrompt,
              mode: activeTab,
              model: selectedModel,
              aspectRatio: selectedRatio,
            }),
          }).catch(err => console.log('保存历史记录失败:', err));
        }
      } else {
        setError(data.error || '生成失败');
      }
    } catch (err: any) {
      setError(err.message || '网络错误');
    } finally {
      setIsGenerating(false);
    }
  };

  // 下载图片
  const downloadImage = (image: GeneratedImage, index: number) => {
    const link = document.createElement('a');
    link.href = image.data;
    const ext = image.mimeType?.split('/')[1] || 'png';
    link.download = `generated-${Date.now()}-${index}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 获取当前选择的模型
  const currentModel = MODELS.find((m) => m.id === selectedModel);

  // 判断生成按钮是否可用
  const canGenerate = () => {
    if (!apiKey.trim()) return false;
    if (isGenerating) return false;
    if (activeTab === 'outpaint') {
      return !!outpaintData;
    }
    return !!prompt.trim();
  };

  return (
    <>
      {/* 头部导航 */}
      <header className="header">
        <div className="logo">
          <div className="logo-icon">🍌</div>
          <span>Nano Banana</span>
        </div>
        <div className="header-right">
          <button
            className="history-btn"
            onClick={() => setIsHistoryOpen(true)}
          >
            📜 历史记录
          </button>
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="help-link"
          >
            获取 API Key →
          </a>
        </div>
      </header>

      {/* 主内容 */}
      <div className="main-container">
        {/* 左侧控制面板 */}
        <aside className="control-panel">
          {/* API Key 设置 */}
          <div className="panel-section">
            <div className="section-title">🔑 API Key</div>
            <div className="api-key-section">
              <div className="api-key-input-group">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  className="api-key-input"
                  placeholder="输入 Google AI Studio API Key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <button
                  className="api-key-toggle"
                  onClick={() => setShowApiKey(!showApiKey)}
                  title={showApiKey ? '隐藏' : '显示'}
                >
                  {showApiKey ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              <div className="api-key-actions">
                <button
                  className={`api-key-btn ${apiKeyStatus === 'testing' ? 'loading' : ''}`}
                  onClick={testApiKey}
                  disabled={apiKeyStatus === 'testing'}
                >
                  {apiKeyStatus === 'testing' ? '验证中...' : '验证'}
                </button>
                <button className="api-key-btn save" onClick={saveApiKey}>
                  保存
                </button>
              </div>
              {apiKeyMessage && (
                <div className={`api-key-message ${apiKeyStatus}`}>
                  {apiKeyMessage}
                </div>
              )}
            </div>
          </div>

          {/* 模式切换 */}
          <div className="panel-section">
            <div className="mode-tabs three-tabs">
              <button
                className={`mode-tab ${activeTab === 'text2img' ? 'active' : ''}`}
                onClick={() => setActiveTab('text2img')}
              >
                📝 文生图
              </button>
              <button
                className={`mode-tab ${activeTab === 'img2img' ? 'active' : ''}`}
                onClick={() => setActiveTab('img2img')}
              >
                🖼️ 图生图
              </button>
              <button
                className={`mode-tab ${activeTab === 'outpaint' ? 'active' : ''}`}
                onClick={() => setActiveTab('outpaint')}
              >
                🔲 扩图
              </button>
            </div>
          </div>

          {/* 模型选择 */}
          <div className="panel-section">
            <div className="section-title">🤖 模型</div>
            <div className="model-cards">
              {MODELS.map((model) => (
                <div
                  key={model.id}
                  className={`model-card ${selectedModel === model.id ? 'active' : ''}`}
                  onClick={() => setSelectedModel(model.id)}
                >
                  <div className="model-card-name">{model.name}</div>
                  <div className="model-card-desc">{model.description}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 扩图编辑器 */}
          {activeTab === 'outpaint' && (
            <div className="panel-section">
              <div className="section-title">🔲 扩图设置</div>
              <OutpaintEditor onCompositeReady={handleOutpaintComposite} />
            </div>
          )}

          {/* 图片配置 - 非扩图模式 */}
          {activeTab !== 'outpaint' && (
            <div className="panel-section">
              <div className="section-title">📐 图片比例</div>
              <div className="ratio-grid">
                {ASPECT_RATIOS.map((ratio) => (
                  <button
                    key={ratio.id}
                    className={`ratio-btn ${selectedRatio === ratio.id ? 'active' : ''}`}
                    onClick={() => setSelectedRatio(ratio.id)}
                  >
                    {ratio.id}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 分辨率（仅 Pro 模型，非扩图模式） */}
          {currentModel?.supports4K && activeTab !== 'outpaint' && (
            <div className="panel-section">
              <div className="section-title">📏 分辨率</div>
              <div className="resolution-btns">
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

          {/* 提示词 */}
          <div className="panel-section">
            <div className="prompt-container">
              <div className="prompt-header">
                <span className="prompt-label">
                  {activeTab === 'outpaint' ? '✨ 扩展描述（可选）' : '✨ 提示词'}
                </span>
              </div>
              <textarea
                className="prompt-textarea"
                placeholder={
                  activeTab === 'outpaint'
                    ? '可选：描述扩展区域的内容，如"继续延伸草原和蓝天"...'
                    : '描述你想要生成的图片...'
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={4000}
              />
              <div className="char-count">{prompt.length}/4000</div>
            </div>
          </div>

          {/* 图片上传（图生图模式） */}
          {activeTab === 'img2img' && (
            <div className="panel-section">
              <div className="section-title">📷 参考图片</div>
              <div
                className="upload-zone"
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <div className="upload-icon">📁</div>
                <div className="upload-text">点击或拖拽上传图片</div>
                <div className="upload-hint">支持 JPG、PNG，最多 {MAX_IMAGES} 张</div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              {uploadedImages.length > 0 && (
                <div className="uploaded-images">
                  {uploadedImages.map((img, index) => (
                    <div key={index} className="uploaded-image">
                      <img src={img.data} alt={img.name} />
                      <button className="remove-image" onClick={() => removeImage(index)}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="error-message">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* 生成按钮 */}
          <button
            className="generate-btn"
            onClick={handleGenerate}
            disabled={!canGenerate()}
          >
            {isGenerating ? (
              <>
                <span className="loading-spinner" style={{ width: 20, height: 20, marginBottom: 0 }} />
                <span>生成中...</span>
              </>
            ) : (
              <>
                <span>🍌 {activeTab === 'outpaint' ? '扩展图片' : '生成图片'}</span>
                <span className="model-tag">{currentModel?.name}</span>
              </>
            )}
          </button>
        </aside>

        {/* 右侧预览区 */}
        <main className="preview-panel">
          <div className="preview-header">
            <h2 className="preview-title">预览</h2>
          </div>

          <div className="preview-content">
            {isGenerating ? (
              <div className="generating-state">
                <div className="loading-spinner" />
                <div className="generating-text">
                  {activeTab === 'outpaint' ? 'AI 正在扩展图片...' : 'AI 正在生成图片...'}
                </div>
                <div className="generating-hint">
                  {selectedModel === 'gemini-3-pro-image-preview'
                    ? 'Pro 模型生成高质量图片，可能需要 10-30 秒'
                    : '快速模型生成中，通常需要 5-15 秒'}
                </div>
              </div>
            ) : resultImages.length > 0 ? (
              <div className="result-gallery">
                {resultImages.map((img, index) => (
                  <div key={index} className="result-image-container">
                    <img src={img.data} alt={`Generated ${index + 1}`} className="result-image" />
                    <div className="image-actions">
                      <button
                        className="action-btn download"
                        onClick={() => downloadImage(img, index)}
                      >
                        📥 下载
                      </button>
                    </div>
                  </div>
                ))}
                {resultText && (
                  <div className="result-text">
                    <div className="result-text-label">AI 说明：</div>
                    <div className="result-text-content">{resultText}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🍌</div>
                <div className="empty-title">Nano Banana 图片生成</div>
                <div className="empty-desc">
                  {activeTab === 'outpaint'
                    ? '上传图片，调整扩展区域，AI 自动填充周围内容'
                    : '输入提示词，选择模型和参数，点击生成按钮开始创作'}
                </div>
                <div className="empty-tips">
                  {activeTab === 'outpaint' ? (
                    <>
                      <div className="tip">📤 上传原图后可拖动调整位置</div>
                      <div className="tip">🔲 选择扩展比例和方向</div>
                      <div className="tip">✨ 可添加描述来引导扩展内容</div>
                    </>
                  ) : (
                    <>
                      <div className="tip">💡 提示：描述越详细，生成效果越好</div>
                      <div className="tip">🎨 支持中英文混合提示词</div>
                      <div className="tip">⚡ Pro 模型支持 4K 高分辨率输出</div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* 历史记录面板 */}
      <HistoryPanel
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectItem={(item) => {
          // 点击历史记录时，在新窗口打开图片
          window.open(item.imageUrl, '_blank');
        }}
      />
    </>
  );
}
