'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

// 上传图片类型
interface UploadedImage {
  data: string;
  name: string;
  type: string;
}

// 图片对象类型
interface GeneratedImage {
  url: string;
  base64?: string;
  title?: string;
}

// 模型类型
interface Model {
  id: string;
  name: string;
  description?: string;
}

// 模型提供商类型
interface ModelProvider {
  id: string;
  name: string;
  models: Model[];
}

// 历史记录类型
interface HistoryItem {
  id: string;
  prompt: string;
  images: GeneratedImage[] | string[];
  text?: string;
  mode: string;
  model?: string;
  provider?: string;
  createdAt: string;
}

// 最大上传图片数
const MAX_IMAGES = 14;

// 游客免费试用次数
const GUEST_FREE_LIMIT = 5;

// 生成或获取游客 ID
function getGuestId(): string {
  if (typeof window === 'undefined') return '';
  let guestId = localStorage.getItem('guestId');
  if (!guestId) {
    guestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('guestId', guestId);
  }
  return guestId;
}

// 获取游客已使用次数
function getGuestUsedCount(): number {
  if (typeof window === 'undefined') return 0;
  const count = localStorage.getItem('guestUsedCount');
  return count ? parseInt(count, 10) : 0;
}

// 增加游客使用次数
function incrementGuestUsedCount(): number {
  if (typeof window === 'undefined') return 0;
  const count = getGuestUsedCount() + 1;
  localStorage.setItem('guestUsedCount', count.toString());
  return count;
}

export default function Home() {
  const { data: session, status } = useSession();

  // UI 状态
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [activeTab, setActiveTab] = useState<'text2img' | 'img2img'>('text2img');
  const [viewMode, setViewMode] = useState<'preview' | 'gallery'>('preview');

  // 表单状态
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  // 生成状态
  const [prompt, setPrompt] = useState('');
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState(0); // 生成进度 0-100
  const [generatingStatus, setGeneratingStatus] = useState<string>(''); // 生成状态文本
  const [resultImages, setResultImages] = useState<GeneratedImage[]>([]);
  const [resultText, setResultText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 用户数据
  const [credits, setCredits] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // 游客模式状态
  const [guestId, setGuestId] = useState<string>('');
  const [guestRemaining, setGuestRemaining] = useState<number>(GUEST_FREE_LIMIT);

  // 模型选择
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('modelscope');
  const [selectedModel, setSelectedModel] = useState<string>('');

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // 初始化游客 ID
  useEffect(() => {
    if (status !== 'authenticated') {
      const id = getGuestId();
      setGuestId(id);
      const used = getGuestUsedCount();
      setGuestRemaining(Math.max(0, GUEST_FREE_LIMIT - used));
    }
  }, [status]);

  // 获取用户积分
  const fetchCredits = useCallback(async () => {
    if (status !== 'authenticated') return;
    try {
      const res = await fetch('/api/user/credits');
      const data = await res.json();
      if (data.loggedIn) {
        setCredits(data.credits);
      }
    } catch (err) {
      console.error('获取积分失败:', err);
    }
  }, [status]);

  // 获取历史记录
  const fetchHistory = useCallback(async () => {
    if (status !== 'authenticated') return;
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      if (data.loggedIn) {
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error('获取历史失败:', err);
    }
  }, [status]);

  // 获取模型列表
  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      if (data.success && data.providers) {
        setProviders(data.providers);
        // 设置默认模型
        if (data.providers.length > 0 && data.providers[0].models.length > 0) {
          setSelectedProvider(data.providers[0].id);
          setSelectedModel(data.providers[0].models[0].id);
        }
      }
    } catch (err) {
      console.error('获取模型列表失败:', err);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    fetchModels();
    if (status === 'authenticated') {
      fetchCredits();
      fetchHistory();
    }
  }, [status, fetchCredits, fetchHistory, fetchModels]);

  // 处理登录
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setAuthError(result.error);
      } else {
        setShowLoginModal(false);
        resetForm();
      }
    } catch (err) {
      setAuthError('登录失败，请重试');
    } finally {
      setAuthLoading(false);
    }
  };

  // 处理注册
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password }),
      });

      const data = await res.json();

      if (data.success) {
        setAuthSuccess(data.message);
        setTimeout(() => {
          setIsRegister(false);
          setAuthSuccess(null);
        }, 2000);
      } else {
        setAuthError(data.error);
      }
    } catch (err) {
      setAuthError('注册失败，请重试');
    } finally {
      setAuthLoading(false);
    }
  };

  // 重置表单
  const resetForm = () => {
    setEmail('');
    setPassword('');
    setUsername('');
    setAuthError(null);
    setAuthSuccess(null);
  };

  // 处理登出
  const handleLogout = async () => {
    await signOut({ redirect: false });
    setCredits(0);
    setHistory([]);
    setResultImages([]);
    setResultText(null);
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

      if (file.size > 10 * 1024 * 1024) {
        setError('图片大小不能超过 10MB');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImages((prev) => [
          ...prev,
          {
            data: event.target?.result as string,
            name: file.name,
            type: file.type,
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

  // 移除图片
  const removeImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
  };

  // 生成图片
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('请输入提示词');
      return;
    }

    const isGuest = status !== 'authenticated';

    // 游客模式检查
    if (isGuest) {
      if (guestRemaining <= 0) {
        setError('游客免费试用次数已用完，请登录获取更多积分');
        setShowLoginModal(true);
        return;
      }
    } else {
      // 登录用户检查积分
      if (credits < 1) {
        setError('积分不足，请充值后继续使用');
        return;
      }
    }

    setIsGenerating(true);
    setGeneratingProgress(0);
    setGeneratingStatus('正在提交任务...');
    setError(null);
    setResultImages([]);
    setResultText(null);

    try {
      const body: Record<string, unknown> = {
        prompt: prompt.trim(),
        model: selectedModel || undefined,
      };

      // 游客模式添加 guestId
      if (isGuest) {
        body.guestId = guestId;
      }

      if (uploadedImages.length > 0) {
        body.images = uploadedImages.map((img) => ({
          data: img.data,
          name: img.name,
          mimeType: img.type,
        }));
      }

      // 1. 提交生成任务
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!data.success) {
        if (data.needLogin) {
          setShowLoginModal(true);
        } else {
          setError(data.error || '提交任务失败');
        }
        setIsGenerating(false);
        return;
      }

      const taskId = data.taskId;
      if (!taskId) {
        setError('未获取到任务 ID');
        setIsGenerating(false);
        return;
      }

      // 处理积分/游客次数（任务已提交成功）
      if (isGuest) {
        // 游客模式：更新剩余次数
        incrementGuestUsedCount();
        const newRemaining = data.guestRemaining !== undefined
          ? data.guestRemaining
          : Math.max(0, guestRemaining - 1);
        setGuestRemaining(newRemaining);
        setGeneratingStatus(`任务已提交，正在排队处理...（剩余 ${newRemaining} 次免费试用）`);
      } else {
        // 登录用户：扣除积分
        setCredits((prev) => prev - 1);
        setGeneratingStatus('任务已提交，正在排队处理...');
      }

      // 2. 轮询任务状态
      // 图生图模型需要更长时间，增加轮询次数
      const isImg2Img = uploadedImages.length > 0;
      const maxPolls = isImg2Img ? 90 : 60; // 图生图最多轮询 90 次，文生图 60 次
      const pollInterval = 2000; // 每 2 秒轮询一次
      const estimatedTime = isImg2Img ? '30-90秒' : '10-30秒';

      for (let i = 0; i < maxPolls; i++) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));

        // 更新进度
        const progress = Math.min(95, Math.round((i / maxPolls) * 100));
        setGeneratingProgress(progress);

        // 更新状态提示
        const elapsedSeconds = (i + 1) * 2;
        if (elapsedSeconds < 10) {
          setGeneratingStatus('AI 正在理解您的提示词...');
        } else if (elapsedSeconds < 30) {
          setGeneratingStatus('AI 正在生成图像...');
        } else if (elapsedSeconds < 60) {
          setGeneratingStatus(isImg2Img ? '正在处理图片编辑...' : '即将完成，请稍候...');
        } else {
          setGeneratingStatus('仍在处理中，图生图模型需要更长时间...');
        }

        const statusRes = await fetch(
          `/api/generate/status?taskId=${taskId}&prompt=${encodeURIComponent(prompt.trim())}&model=${encodeURIComponent(selectedModel || '')}`
        );
        const statusData = await statusRes.json();

        if (statusData.status === 'SUCCEED') {
          // 生成成功
          setGeneratingProgress(100);
          setGeneratingStatus('生成完成！');
          const images = (statusData.images || []).map((img: GeneratedImage | string) => {
            if (typeof img === 'string') {
              return { url: img };
            }
            return img;
          });
          setResultImages(images);
          setResultText(`生成耗时: ${Math.round(statusData.timeTaken / 1000)}秒`);
          setViewMode('preview');
          fetchHistory();
          setIsGenerating(false);
          return;
        } else if (statusData.status === 'FAILED') {
          // 区分不同的失败原因给出更友好的提示
          let errorMsg = statusData.error || '生成失败';
          if (isImg2Img && errorMsg.includes('超时')) {
            errorMsg = '图片编辑模型暂时繁忙，请稍后重试。提示：可以尝试使用更简单的提示词。';
          }
          setError(errorMsg);
          setIsGenerating(false);
          return;
        }
        // PENDING 或 PROCESSING，继续轮询
      }

      // 超过最大轮询次数
      if (isImg2Img) {
        setError('图片编辑模型处理超时。这可能是因为模型队列繁忙。您可以：\n1. 稍后重试\n2. 使用更简单的提示词\n3. 缩小参考图片尺寸');
      } else {
        setError('生成超时，请稍后重试或在历史记录中查看');
      }
      setIsGenerating(false);

    } catch (err) {
      setError('生成失败，请重试');
      setIsGenerating(false);
    }
  };

  // 下载图片
  const downloadImage = (image: GeneratedImage, index: number) => {
    const link = document.createElement('a');
    link.href = image.url;
    link.download = `generated-${Date.now()}-${index}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 获取图片 URL（兼容字符串和对象格式）
  const getImageUrl = (img: GeneratedImage | string): string => {
    if (typeof img === 'string') {
      return img;
    }
    return img.url;
  };

  // 从历史加载
  const loadFromHistory = (item: HistoryItem) => {
    setPrompt(item.prompt);
    // 确保 images 是正确的格式
    const images = (item.images || []).map((img: GeneratedImage | string) => {
      if (typeof img === 'string') {
        return { url: img };
      }
      return img;
    });
    setResultImages(images);
    setResultText(item.text || null);
    setViewMode('preview');
  };

  // 获取用户首字母
  const getUserInitial = () => {
    if (session?.user?.name) {
      return session.user.name.charAt(0).toUpperCase();
    }
    if (session?.user?.email) {
      return session.user.email.charAt(0).toUpperCase();
    }
    return 'U';
  };

  return (
    <>
      {/* 头部导航 */}
      <header className="header">
        <div className="logo">
          <div className="logo-icon">✨</div>
          <span>AI Photo</span>
        </div>

        <div className="header-right">
          {status === 'authenticated' ? (
            <>
              <div className="credits-badge">
                <span>💎</span>
                <span className="value">{credits}</span>
                <span>积分</span>
              </div>
              <div className="user-menu">
                <div className="user-avatar">{getUserInitial()}</div>
                <div className="user-dropdown">
                  <div className="dropdown-item">
                    <span>👤</span>
                    <span>{session.user?.name || session.user?.email}</span>
                  </div>
                  <div className="dropdown-item">
                    <span>💎</span>
                    <span>{credits} 积分</span>
                  </div>
                  <div className="dropdown-item danger" onClick={handleLogout}>
                    <span>🚪</span>
                    <span>退出登录</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="credits-badge guest-badge">
                <span>🎁</span>
                <span className="value">{guestRemaining}</span>
                <span>次免费试用</span>
              </div>
              <button className="auth-btn" onClick={() => setShowLoginModal(true)}>
                登录
              </button>
            </>

          )}
        </div>
      </header>

      {/* 主内容 */}
      <div className="main-container">
        {/* 左侧控制面板 */}
        <aside className="control-panel">
          {/* 模式切换 */}
          <div className="panel-section">
            <div className="mode-tabs">
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
            </div>
          </div>

          {/* 模型选择 */}
          <div className="panel-section">
            <div className="section-title">🤖 选择模型</div>
            <div className="model-selector">
              {/* 提供商选择 */}
              <select
                className="model-select"
                value={selectedProvider}
                onChange={(e) => {
                  const providerId = e.target.value;
                  setSelectedProvider(providerId);
                  // 自动选择该提供商的第一个模型
                  const provider = providers.find(p => p.id === providerId);
                  if (provider && provider.models.length > 0) {
                    setSelectedModel(provider.models[0].id);
                  }
                }}
              >
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>

              {/* 模型选择 */}
              <select
                className="model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {providers
                  .find(p => p.id === selectedProvider)
                  ?.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
              </select>

              {/* 模型描述 */}
              {providers.find(p => p.id === selectedProvider)?.models.find(m => m.id === selectedModel)?.description && (
                <div className="model-description">
                  {providers.find(p => p.id === selectedProvider)?.models.find(m => m.id === selectedModel)?.description}
                </div>
              )}
            </div>
          </div>

          {/* 提示词 */}
          <div className="panel-section">
            <div className="prompt-container">
              <div className="prompt-header">
                <span className="prompt-label">✨ 提示词</span>
              </div>
              <textarea
                ref={promptRef}
                className="prompt-textarea"
                placeholder="描述你想要生成的图片..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={2000}
              />
              <div className="char-count">{prompt.length}/2000</div>
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
            disabled={isGenerating || !prompt.trim() || (status !== 'authenticated' && guestRemaining <= 0)}
          >
            {isGenerating ? (
              <>
                <span className="loading-spinner" style={{ width: 20, height: 20, marginBottom: 0 }} />
                <span>生成中...</span>
              </>
            ) : status !== 'authenticated' ? (
              <>
                <span>✨ 生成图片</span>
                <span className="credit-cost">
                  {guestRemaining > 0 ? `免费试用 (剩余 ${guestRemaining} 次)` : '请登录'}
                </span>
              </>
            ) : (
              <>
                <span>✨ 生成图片</span>
                <span className="credit-cost">消耗 1 积分</span>
              </>
            )}
          </button>

          {/* 状态栏 */}
          <div className="status-bar">
            <div className="status-item">
              <span className="status-dot" />
              <span>ModelScope Z-Image</span>
            </div>
          </div>
        </aside>

        {/* 右侧预览区 */}
        <main className="preview-panel">
          <div className="preview-header">
            <h2 className="preview-title">
              {viewMode === 'preview' ? '预览' : '历史记录'}
            </h2>
            <div className="view-toggle">
              <button
                className={`view-btn ${viewMode === 'preview' ? 'active' : ''}`}
                onClick={() => setViewMode('preview')}
              >
                预览
              </button>
              <button
                className={`view-btn ${viewMode === 'gallery' ? 'active' : ''}`}
                onClick={() => setViewMode('gallery')}
              >
                历史 ({history.length})
              </button>
            </div>
          </div>

          <div className="preview-content">
            {viewMode === 'preview' ? (
              // 预览模式
              isGenerating ? (
                <div className="generating-state">
                  <div className="loading-spinner" />
                  <div className="generating-text">{generatingStatus || '正在生成图片...'}</div>
                  <div className="generating-progress">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${generatingProgress}%` }} />
                    </div>
                    <span className="progress-text">{generatingProgress}%</span>
                  </div>
                  <div className="generating-hint">
                    {activeTab === 'img2img'
                      ? '图生图模式需要 30-90 秒，请耐心等待'
                      : '文生图模式需要 10-30 秒'}
                  </div>
                </div>
              ) : resultImages.length > 0 ? (
                <div className="result-container">
                  {resultImages.map((img, index) => (
                    <div key={index} className="result-image-wrapper">
                      <img src={img.url} alt={`Generated ${index + 1}`} className="result-image" />
                      <div className="result-actions">
                        <button
                          className="action-btn"
                          onClick={() => downloadImage(img, index)}
                        >
                          ⬇️ 下载
                        </button>
                      </div>
                    </div>
                  ))}
                  {resultText && (
                    <div className="result-prompt">
                      <strong>提示词：</strong>
                      {resultText}
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">🎨</div>
                  <div className="empty-text">开始创作</div>
                  <div className="empty-hint">输入提示词，点击生成按钮开始创作</div>
                </div>
              )
            ) : (
              // 历史记录模式
              history.length > 0 ? (
                <div className="gallery-grid">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="gallery-item"
                      onClick={() => loadFromHistory(item)}
                    >
                      {item.images?.[0] && (
                        <img src={getImageUrl(item.images[0])} alt={item.prompt} />
                      )}
                      <div className="gallery-item-overlay">
                        <div className="gallery-item-prompt">{item.prompt}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">📷</div>
                  <div className="empty-text">暂无历史记录</div>
                  <div className="empty-hint">生成的图片会自动保存在这里</div>
                </div>
              )
            )}
          </div>
        </main>
      </div>

      {/* 登录弹窗 */}
      {showLoginModal && (
        <div className="modal-overlay" onClick={() => setShowLoginModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">{isRegister ? '创建账号' : '欢迎回来'}</h2>
            <p className="modal-subtitle">
              {isRegister ? '注册后获得 100 积分免费体验' : '登录以继续使用 AI Photo'}
            </p>

            {authError && (
              <div className="error-message">
                <span>⚠️</span>
                <span>{authError}</span>
              </div>
            )}

            {authSuccess && (
              <div className="success-message">
                <span>✅</span>
                <span>{authSuccess}</span>
              </div>
            )}

            <form onSubmit={isRegister ? handleRegister : handleLogin}>
              {isRegister && (
                <div className="form-group">
                  <label className="form-label">用户名</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="请输入用户名"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">邮箱</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="请输入邮箱"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">密码</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <button type="submit" className="submit-btn" disabled={authLoading}>
                {authLoading ? '处理中...' : isRegister ? '注册' : '登录'}
              </button>
            </form>

            {/* 分隔线 */}
            {!isRegister && (
              <div className="auth-divider">
                <span>或</span>
              </div>
            )}

            {/* Google 登录按钮 */}
            {!isRegister && (
              <button
                type="button"
                className="google-btn"
                onClick={() => signIn('google', { callbackUrl: '/' })}
                disabled={authLoading}
              >
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span>使用 Google 账号登录</span>
              </button>
            )}

            <div className="modal-footer">
              {isRegister ? (
                <>
                  已有账号？{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsRegister(false);
                      resetForm();
                    }}
                  >
                    立即登录
                  </a>
                </>
              ) : (
                <>
                  没有账号？{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsRegister(true);
                      resetForm();
                    }}
                  >
                    立即注册
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
