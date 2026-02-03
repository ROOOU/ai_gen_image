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

  // 模式和配置
  const [activeTab, setActiveTab] = useState<'text2img' | 'img2img' | 'outpaint'>('text2img');
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

  // 图片压缩函数：确保图片不超过 5MB（API限制 7MB，留余量）
  const compressImageIfNeeded = async (dataUrl: string, fileName: string): Promise<{ data: string; wasCompressed: boolean }> => {
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB

    // 计算 base64 数据大小
    const base64Data = dataUrl.split(',')[1];
    const binarySize = Math.ceil((base64Data.length * 3) / 4);

    if (binarySize <= MAX_SIZE) {
      return { data: dataUrl, wasCompressed: false };
    }

    console.log(`[压缩] ${fileName}: 原始大小 ${(binarySize / 1024 / 1024).toFixed(2)}MB，开始压缩...`);

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // 计算需要的缩放比例
        let scale = Math.sqrt(MAX_SIZE / binarySize) * 0.9; // 额外缩小 10% 确保不超限
        let quality = 0.85;

        const compress = () => {
          const canvas = document.createElement('canvas');
          const newWidth = Math.floor(img.width * scale);
          const newHeight = Math.floor(img.height * scale);
          canvas.width = newWidth;
          canvas.height = newHeight;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('无法创建画布'));
            return;
          }

          ctx.drawImage(img, 0, 0, newWidth, newHeight);
          const compressedData = canvas.toDataURL('image/jpeg', quality);

          // 检查压缩后大小
          const compressedBase64 = compressedData.split(',')[1];
          const compressedSize = Math.ceil((compressedBase64.length * 3) / 4);

          if (compressedSize > MAX_SIZE && (scale > 0.1 || quality > 0.5)) {
            // 仍然太大，继续缩小
            if (quality > 0.5) {
              quality -= 0.1;
            } else {
              scale *= 0.8;
            }
            compress();
          } else {
            console.log(`[压缩] ${fileName}: 压缩后 ${(compressedSize / 1024 / 1024).toFixed(2)}MB (${newWidth}x${newHeight})`);
            resolve({ data: compressedData, wasCompressed: true });
          }
        };

        compress();
      };
      img.onerror = () => reject(new Error('加载图片失败'));
      img.src = dataUrl;
    });
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
  const processFiles = async (files: File[]) => {
    const remainingSlots = MAX_IMAGES - uploadedImages.length;
    if (remainingSlots <= 0) {
      setError(`最多只能上传 ${MAX_IMAGES} 张图片`);
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);
    let compressedCount = 0;

    for (const file of filesToProcess) {
      if (!file.type.startsWith('image/')) {
        setError('只支持图片文件');
        continue;
      }

      if (file.size > 50 * 1024 * 1024) {
        setError('图片大小不能超过 50MB');
        continue;
      }

      try {
        // 读取文件
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // 检查并压缩
        const { data, wasCompressed } = await compressImageIfNeeded(dataUrl, file.name);
        if (wasCompressed) {
          compressedCount++;
        }

        setUploadedImages((prev) => [
          ...prev,
          {
            data,
            name: file.name + (wasCompressed ? ' (已压缩)' : ''),
            mimeType: wasCompressed ? 'image/jpeg' : file.type,
          },
        ]);
        setActiveTab('img2img');
        setError(null);
      } catch (err) {
        console.error('处理图片失败:', err);
        setError('处理图片失败');
      }
    }

    if (compressedCount > 0) {
      // 显示压缩提示（不阻塞）
      setError(`⚡ ${compressedCount} 张图片已自动压缩以满足 API 限制`);
      setTimeout(() => setError(null), 3000);
    }
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
  const handleOutpaintComposite = useCallback((data: OutpaintData) => {
    setOutpaintData(data);
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
        // 扩图模式：使用遮罩来保护原图区域
        // 提示词说明：遮罩图中黑色区域是原图（需保留），白色区域需要生成新内容
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
        let finalImages = data.images || [];

        // 扩图模式：后处理合成，确保原图区域完全保留
        if (activeTab === 'outpaint' && outpaintData && finalImages.length > 0) {
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
          const historyPrompt = activeTab === 'outpaint'
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
                mode: activeTab,
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
      setError(err.message || '网络错误');
    } finally {
      setIsGenerating(false);
    }
  };

  // 扩图后处理：将 AI 生成的结果与原图合成到目标分辨率
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
    if (activeTab === 'outpaint') {
      return !!outpaintData;
    }
    return !!prompt.trim();
  };

  // 移动端视图切换
  const [mobileTab, setMobileTab] = useState<'create' | 'preview'>('create');

  // 监听生成开始，自动切换到预览
  useEffect(() => {
    if (isGenerating && window.innerWidth <= 768) {
      setMobileTab('preview');
    }
  }, [isGenerating]);

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
        {/* 左侧控制面板 - 移动端根据 tab 显示 */}
        <aside className={`control-panel ${mobileTab === 'preview' ? 'mobile-hidden' : ''}`}>
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

        {/* 右侧预览区 - 移动端根据 tab 显示 */}
        <main className={`preview-panel ${mobileTab === 'create' ? 'mobile-hidden' : ''}`}>
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

      {/* 移动端底部导航栏 */}
      <div className="mobile-bottom-nav">
        <button
          className={`nav-item ${mobileTab === 'create' ? 'active' : ''}`}
          onClick={() => setMobileTab('create')}
        >
          <span className="nav-icon">🎨</span>
          <span className="nav-label">创作</span>
        </button>
        <button
          className={`nav-item ${mobileTab === 'preview' ? 'active' : ''}`}
          onClick={() => setMobileTab('preview')}
        >
          <div className="nav-icon-wrapper">
            <span className="nav-icon">👁️</span>
            {resultImages.length > 0 && !isGenerating && (
              <span className="nav-badge"></span>
            )}
            {isGenerating && (
              <span className="nav-loading-dot"></span>
            )}
          </div>
          <span className="nav-label">预览</span>
        </button>
      </div>

      {/* 历史记录面板 */}
      <HistoryPanel
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectItem={(item) => {
          // 点击历史记录时，在新窗口打开图片
          window.open(item.imageUrl, '_blank');
        }}
        apiKey={apiKey}
      />
    </>
  );
}
