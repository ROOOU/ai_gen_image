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
  { id: 'auto', name: '🔄 Auto' },
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
  maskImage: string;  // 遮罩图：黑色=保留，白色=生成
  originalImage: string;  // 原图数据用于后处理
  originalX: number;  // 原图在画布上的 X 位置比例 (0-1)
  originalY: number;  // 原图在画布上的 Y 位置比例 (0-1)
  originalWidth: number;  // 原图原始宽度
  originalHeight: number;  // 原图原始高度
  width: number;  // 发送给 API 的宽度（可能被缩放）
  height: number;  // 发送给 API 的高度（可能被缩放）
  targetWidth: number;  // 用户期望的目标宽度
  targetHeight: number;  // 用户期望的目标高度
  scale: number;  // 缩放因子（1 = 无缩放）
}

// 最大上传图片数
const MAX_IMAGES = 14;

export default function Home() {
  // API Key 状态
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle');
  const [apiKeyMessage, setApiKeyMessage] = useState('');

  // iOS 风格状态管理
  const [activeView, setActiveView] = useState<'create' | 'gallery'>('create');
  const [activeMode, setActiveMode] = useState<'text2img' | 'img2img' | 'outpaint'>('text2img');

  const [selectedModel, setSelectedModel] = useState(MODELS[1].id); // 默认使用 Pro
  const [selectedRatio, setSelectedRatio] = useState('auto');
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

  // 监听生成开始，自动切换到画廊（仅在移动端）
  useEffect(() => {
    if (isGenerating && window.innerWidth <= 768) {
      setActiveView('gallery');
    }
  }, [isGenerating]);

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
      setApiKeyMessage('验证请求失败');
    }
  };

  // 处理图片上传
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    processFiles(files);
  };

  // 处理文件拖拽
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files) return;

    processFiles(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // 检查是否需要压缩
  const compressImageIfNeeded = async (file: File): Promise<string> => {
    // 限制为 5MB
    const MAX_SIZE = 5 * 1024 * 1024;

    // 如果小于限制，直接返回 base64
    if (file.size <= MAX_SIZE) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });
    }

    // 需要压缩
    console.log(`[Compression] Compressing ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)...`);

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // 如果图片非常大，适当缩小尺寸以确保压缩效果
          const MAX_DIMENSION = 2048;
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
            width *= ratio;
            height *= ratio;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // 使用 JPEG 格式压缩，初始质量 0.8
          let quality = 0.8;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);

          // 循环尝试降低质量直到满足大小要求
          while (dataUrl.length > MAX_SIZE * 1.37 && quality > 0.1) { // base64 约为原大小的 1.37 倍
            quality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }

          console.log(`[Compression] Done. New size: ${(dataUrl.length / 1.37 / 1024 / 1024).toFixed(2)}MB, Quality: ${quality.toFixed(1)}`);
          resolve(dataUrl);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  // 处理文件
  const processFiles = async (files: FileList) => {
    if (files.length + uploadedImages.length > MAX_IMAGES) {
      alert(`最多只能上传 ${MAX_IMAGES} 张图片`);
      return;
    }

    const newImages: UploadedImage[] = [];
    let compressedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        try {
          // 使用压缩逻辑
          const isNeeded = file.size > 5 * 1024 * 1024;
          const dataUrl = await compressImageIfNeeded(file);
          if (isNeeded) compressedCount++;

          newImages.push({
            data: dataUrl,
            name: file.name,
            mimeType: 'image/jpeg', // 压缩后统一为 JPEG，或者如果是原图则保持（此处简化处理，compressImageIfNeeded返回base64）
          });
        } catch (err) {
          console.error('File processing error:', err);
        }
      }
    }

    if (compressedCount > 0) {
      setApiKeyMessage(`⚡ ${compressedCount} 张图片已自动压缩以满足 API 限制`);
      setTimeout(() => setApiKeyMessage(''), 3000);
    }

    setUploadedImages([...uploadedImages, ...newImages]);
  };

  // 移除图片
  const removeImage = (index: number) => {
    const newImages = [...uploadedImages];
    newImages.splice(index, 1);
    setUploadedImages(newImages);
  };

  // 处理扩图合成准备就绪
  const handleOutpaintComposite = (data: OutpaintData) => {
    setOutpaintData(data);
  };

  // 生成图片
  const handleGenerate = async () => {
    if (!canGenerate()) return;

    setIsGenerating(true);
    setError(null);
    setResultImages([]);
    setResultText(null);

    try {
      const requestBody: Record<string, any> = {
        model: selectedModel,
      };

      if (activeMode === 'outpaint') {
        // 扩图模式：使用遮罩来保护原图区域
        const baseInstruction = `This is an outpainting task with a mask. I'm providing two images:
1. The first image is the composite with the original photo and gray areas that need to be filled.
2. The second image is the mask where BLACK areas represent the original image that MUST be preserved EXACTLY as-is, and WHITE areas represent the regions that need to be generated with new content.

CRITICAL: Do NOT modify, regenerate, or alter ANY pixels in the black masked areas. Only generate new content in the white masked areas. The new content should seamlessly blend with the original image, matching its style, lighting, perspective, and color palette.`;

        const outpaintPrompt = prompt.trim()
          ? `${baseInstruction}\n\nAdditional guidance for the extended areas: ${prompt.trim()}`
          : baseInstruction;

        requestBody.prompt = outpaintPrompt;
        // 发送合成图 + 遮罩图
        requestBody.images = [
          {
            data: outpaintData!.compositeImage,
            mimeType: 'image/jpeg',
          },
          {
            data: outpaintData!.maskImage,
            mimeType: 'image/png',
          },
        ];
      } else {
        requestBody.prompt = prompt.trim();
        // 只有当比例不是 auto 时才传递（auto 模式让 API 自动匹配图片比例）
        if (selectedRatio !== 'auto') {
          requestBody.aspectRatio = selectedRatio;
        }

        // 如果该模型支持分辨率参数，且不是扩图模式
        const modelInfo = MODELS.find(m => m.id === selectedModel);
        if (modelInfo?.supports4K) {
          // 这里可以添加分辨率参数，目前 SDK 似乎主要是通过 prompt 或 config 控制
          // 暂时保留逻辑
        }

        if (activeMode === 'img2img' && uploadedImages.length > 0) {
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
        let finalImages = data.images || [];

        // 扩图模式：后处理合成，确保原图区域完全保留
        if (activeMode === 'outpaint' && outpaintData && finalImages.length > 0) {
          try {
            const processedImage = await postProcessOutpaint(
              finalImages[0].data,
              outpaintData
            );
            finalImages = [{ data: processedImage, mimeType: 'image/jpeg' }];
          } catch (err) {
            console.error('扩图后处理失败:', err);
            // 后处理失败时使用原始结果
          }
        }

        setResultImages(finalImages);
        setResultText(data.text || null);

        // 保存到历史记录（异步，不阻塞UI）
        if (finalImages.length > 0) {
          const historyPrompt = activeMode === 'outpaint'
            ? (prompt.trim() || '扩展图片')
            : prompt.trim();

          console.log('[handleGenerate] 开始保存历史记录...');

          // 生成缩略图
          const generateThumbnail = (imageData: string): Promise<string> => {
            return new Promise((resolve) => {
              const img = new Image();
              img.onload = () => {
                const THUMB_SIZE = 300;
                const scale = Math.min(THUMB_SIZE / img.width, THUMB_SIZE / img.height);
                const width = Math.floor(img.width * scale);
                const height = Math.floor(img.height * scale);

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(img, 0, 0, width, height);
                  resolve(canvas.toDataURL('image/jpeg', 0.7));
                } else {
                  resolve(''); // 失败时返回空
                }
              };
              img.onerror = () => resolve('');
              img.src = imageData;
            });
          };

          // 生成缩略图后发送
          generateThumbnail(finalImages[0].data).then(thumbnailData => {
            fetch('/api/history', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey.trim(),
              },
              body: JSON.stringify({
                imageData: finalImages[0].data,
                thumbnailData: thumbnailData || undefined,
                prompt: historyPrompt,
                mode: activeMode,
                model: selectedModel,
                aspectRatio: selectedRatio,
              }),
            })
              .then(async (res) => {
                const result = await res.json();
                if (result.success) {
                  console.log('[handleGenerate] 历史记录保存成功');
                } else {
                  console.error('[handleGenerate] 历史记录保存失败:', result.error);
                }
              })
              .catch(err => console.error('[handleGenerate] 历史记录保存请求失败:', err));
          });
        }
      } else {
        setError(data.error || '生成失败');
      }
    } catch (err: any) {
      setError(err.message || '请求失败');
    } finally {
      setIsGenerating(false);
    }
  };

  // 扩图后处理：将原图精确覆盖回 AI 生成的图片上
  const postProcessOutpaint = (
    aiResultData: string,
    outpaint: OutpaintData
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      // 加载 AI 生成的图片
      const aiImg = new Image();
      aiImg.onload = () => {
        // 加载原图
        const origImg = new Image();
        origImg.onload = () => {
          // 使用用户期望的目标尺寸作为输出
          const targetW = outpaint.targetWidth;
          const targetH = outpaint.targetHeight;

          // 创建目标画布
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('无法创建画布'));
            return;
          }

          // 第一步：绘制 AI 生成的图片（拉伸到目标尺寸）
          // AI 返回的图片可能是任意尺寸，我们需要将其拉伸到目标尺寸
          ctx.drawImage(aiImg, 0, 0, targetW, targetH);

          // 第二步：在原图位置绘制原图（覆盖 AI 生成的对应区域）
          // originalX/Y 是相对位置（0-1），转换为目标画布上的像素位置
          const drawX = outpaint.originalX * targetW;
          const drawY = outpaint.originalY * targetH;

          // 原图在目标画布上的尺寸：使用原始尺寸（不缩放）
          const drawWidth = outpaint.originalWidth;
          const drawHeight = outpaint.originalHeight;

          // 绘制原图，完全覆盖 AI 生成的对应区域
          ctx.drawImage(origImg, drawX, drawY, drawWidth, drawHeight);

          // 导出最终图片
          resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        origImg.onerror = () => reject(new Error('加载原图失败'));
        origImg.src = outpaint.originalImage;
      };
      aiImg.onerror = () => reject(new Error('加载 AI 结果失败'));
      aiImg.src = aiResultData;
    });
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
    if (activeMode === 'outpaint') {
      return !!outpaintData;
    }
    return !!prompt.trim();
  };

  // iOS 风格组件 (内联定义，简化 props 传递)
  const IOSGroup = ({ title, children }: { title?: string, children: React.ReactNode }) => (
    <div className="ios-group-container">
      {title && <div className="ios-group-header">{title}</div>}
      <div className="ios-group-content">
        {children}
      </div>
    </div>
  );

  const IOSListItem = ({
    icon,
    label,
    children,
    onClick,
    showArrow,
    className = ''
  }: any) => (
    <div className={`ios-list-item ${className}`} onClick={onClick}>
      <div className="ios-item-left">
        {icon && <span className="ios-item-icon">{icon}</span>}
        <span className="ios-item-label">{label}</span>
      </div>
      <div className="ios-item-right">
        {children}
        {showArrow && <span className="ios-arrow">›</span>}
      </div>
    </div>
  );

  return (
    <div className="ios-app-wrapper">
      {/* 顶部导航栏 (Glassmorphism) */}
      <header className="ios-nav-bar blur-effect">
        <div className="ios-nav-left">
          <span className="logo-emoji">🍌</span>
          <span className="nav-title">Nano Banana</span>
        </div>
        <div className="ios-nav-right">
          <button className="ios-icon-btn" onClick={() => setIsHistoryOpen(true)}>
            📜
          </button>
        </div>
      </header>

      {/* 主要内容区域 (视图切换) */}
      <div className="ios-content-area">

        {/* === 创作视图 === */}
        <div className={`ios-view ${activeView === 'create' ? 'active' : ''}`}>
          <div className="ios-scroll-container">

            {/* 1. API Key 设置 */}
            <IOSGroup title="设置">
              <IOSListItem icon="🔑" label="API Key">
                <div className="ios-input-wrapper">
                  {apiKeyStatus === 'valid' ? (
                    <span className="status-badge success" onClick={() => setApiKey('')}>已验证</span>
                  ) : (
                    <input
                      type="password"
                      className="ios-input-inline"
                      placeholder="配置 API Key"
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      onBlur={testApiKey}
                    />
                  )}
                </div>
              </IOSListItem>
            </IOSGroup>

            {/* 2. 创作模式 (Segmented Control) */}
            <IOSGroup title="创作模式">
              <div className="ios-segment-control">
                <button
                  className={activeMode === 'text2img' ? 'active' : ''}
                  onClick={() => setActiveMode('text2img')}
                >
                  文生图
                </button>
                <button
                  className={activeMode === 'img2img' ? 'active' : ''}
                  onClick={() => setActiveMode('img2img')}
                >
                  图生图
                </button>
                <button
                  className={activeMode === 'outpaint' ? 'active' : ''}
                  onClick={() => setActiveMode('outpaint')}
                >
                  扩图
                </button>
              </div>
            </IOSGroup>

            {/* 3. 提示词输入 */}
            <IOSGroup title="提示词">
              <div className="ios-textarea-container">
                <textarea
                  className="ios-textarea"
                  placeholder={activeMode === 'outpaint' ? "描述扩展区域的内容..." : "描述你想要生成的画面..."}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                />
                <div className="ios-char-count">{prompt.length}/4000</div>
              </div>
            </IOSGroup>

            {/* 4. 图片上传 (图生图/扩图) */}
            {(activeMode === 'img2img') && (
              <IOSGroup title="参考图片">
                <div
                  className="ios-upload-zone"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadedImages.length > 0 ? (
                    <div className="ios-upload-preview">
                      {uploadedImages.map((img, i) => (
                        <img key={i} src={img.data} className="preview-thumb" />
                      ))}
                      <span className="upload-add-btn">+</span>
                    </div>
                  ) : (
                    <div className="upload-placeholder">
                      <span className="upload-icon">📷</span>
                      <span>点击上传图片</span>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
              </IOSGroup>
            )}

            {activeMode === 'outpaint' && (
              <IOSGroup title="扩图设置">
                <OutpaintEditor onCompositeReady={handleOutpaintComposite} />
              </IOSGroup>
            )}

            {/* 5. 参数设置 (模型 & 比例) */}
            <IOSGroup title="参数配置">
              <IOSListItem label="模型" showArrow>
                <select
                  className="ios-select-overlay"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  {MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <span className="ios-value-text">{MODELS.find(m => m.id === selectedModel)?.name}</span>
              </IOSListItem>

              {activeMode !== 'outpaint' && (
                <IOSListItem label="图片比例">
                  <div className="ios-ratio-scroll">
                    {ASPECT_RATIOS.map(ratio => (
                      <button
                        key={ratio.id}
                        className={`ratio-chip-ios ${selectedRatio === ratio.id ? 'active' : ''}`}
                        onClick={() => setSelectedRatio(ratio.id)}
                      >
                        {ratio.name.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </IOSListItem>
              )}
            </IOSGroup>

            {apiKeyMessage && (
              <div className="ios-toast-message">
                {apiKeyMessage}
              </div>
            )}

            <div style={{ height: 120 }}></div>
          </div>

          {/* 底部悬浮生成按钮 */}
          <div className="ios-bottom-action-bar blur-effect">
            <button
              className={`ios-action-btn ${isGenerating ? 'loading' : ''}`}
              onClick={handleGenerate}
              disabled={!canGenerate()}
            >
              {isGenerating ? 'AI 生成中...' : '✨ 开始生成'}
            </button>
          </div>
        </div>

        {/* === 画廊视图 === */}
        <div className={`ios-view ${activeView === 'gallery' ? 'active' : ''}`}>
          <div className="ios-scroll-container">
            {resultImages.length === 0 && !isGenerating ? (
              <div className="ios-empty-state">
                <span className="empty-emoji">🎨</span>
                <h3>这里空空如也</h3>
                <p>去创作你的第一张 AI 图片吧</p>
                <button className="ios-secondary-btn" onClick={() => setActiveView('create')}>
                  去创作
                </button>
              </div>
            ) : (
              <div className="ios-gallery-grid">
                {isGenerating && (
                  <div className="ios-grid-item skeleton">
                    <div className="loading-spinner"></div>
                    <p>AI 正在绘制...</p>
                  </div>
                )}
                {resultImages.map((img, idx) => (
                  <div key={idx} className="ios-grid-item">
                    <img src={img.data} alt="Result" onClick={() => {/* TODO: Preview */ }} />
                    <div className="download-overlay" onClick={() => downloadImage(img, idx)}>
                      📥
                    </div>
                  </div>
                ))}
                {/* 如果有文本结果 */}
                {resultText && (
                  <div className="ios-result-text">
                    {resultText}
                  </div>
                )}
              </div>
            )}
            <div style={{ height: 100 }}></div>
          </div>
        </div>
      </div>

      {/* 底部 Tab 导航栏 */}
      <nav className="ios-tab-bar blur-effect">
        <button
          className={`tab-btn-ios ${activeView === 'create' ? 'active' : ''}`}
          onClick={() => setActiveView('create')}
        >
          <span className="tab-icon">✍️</span>
          <span className="tab-label">创作</span>
        </button>
        <button
          className={`tab-btn-ios ${activeView === 'gallery' ? 'active' : ''}`}
          onClick={() => setActiveView('gallery')}
        >
          <div className="icon-wrapper">
            <span className="tab-icon">🖼️</span>
            {isGenerating && <span className="status-dot pulse"></span>}
            {!isGenerating && resultImages.length > 0 && <span className="status-dot"></span>}
          </div>
          <span className="tab-label">画廊</span>
        </button>
      </nav>

      {/* 全局组件 */}
      <HistoryPanel
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectItem={(item) => window.open(item.imageUrl, '_blank')}
        apiKey={apiKey}
      />
    </div>
  );
}
