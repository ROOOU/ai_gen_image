'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface OutpaintEditorProps {
    onCompositeReady: (compositeData: string, width: number, height: number) => void;
}

// 预设扩展选项
const EXPAND_PRESETS = [
    { id: 'top', name: '向上扩展', icon: '⬆️', dx: 0, dy: -0.5 },
    { id: 'bottom', name: '向下扩展', icon: '⬇️', dx: 0, dy: 0.5 },
    { id: 'left', name: '向左扩展', icon: '⬅️', dx: -0.5, dy: 0 },
    { id: 'right', name: '向右扩展', icon: '➡️', dx: 0.5, dy: 0 },
    { id: 'all', name: '四周扩展', icon: '⊞', dx: 0.25, dy: 0.25 },
];

// 画布尺寸比例选项
const SCALE_OPTIONS = [
    { id: '1.5x', scale: 1.5, name: '1.5倍' },
    { id: '2x', scale: 2, name: '2倍' },
    { id: 'custom', scale: 0, name: '自定义' },
];

export default function OutpaintEditor({ onCompositeReady }: OutpaintEditorProps) {
    // 原图数据
    const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
    const [originalDataUrl, setOriginalDataUrl] = useState<string>('');

    // 画布尺寸
    const [canvasWidth, setCanvasWidth] = useState(1024);
    const [canvasHeight, setCanvasHeight] = useState(1024);
    const [selectedScale, setSelectedScale] = useState('1.5x');
    const [imageAspectRatio, setImageAspectRatio] = useState(1);

    // 自定义尺寸输入
    const [customWidth, setCustomWidth] = useState('');
    const [customHeight, setCustomHeight] = useState('');

    // 原图在画布中的位置（百分比 0-1）
    const [imageX, setImageX] = useState(0.25);
    const [imageY, setImageY] = useState(0.25);

    // 拖拽状态
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [dragImageStart, setDragImageStart] = useState({ x: 0, y: 0 });

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 处理图片上传
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            setOriginalDataUrl(dataUrl);

            const img = new Image();
            img.onload = () => {
                setOriginalImage(img);
                setImageAspectRatio(img.width / img.height);
                // 初始化自定义尺寸
                setCustomWidth(String(Math.round(img.width * 1.5)));
                setCustomHeight(String(Math.round(img.height * 1.5)));
                // 使用选择的比例设置画布尺寸
                updateCanvasSize(img.width, img.height, selectedScale);
                resetImagePosition();
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    };

    // 更新画布尺寸
    const updateCanvasSize = (imgWidth: number, imgHeight: number, scaleId: string) => {
        if (scaleId === 'custom') {
            // 自定义模式使用输入的尺寸
            const w = parseInt(customWidth) || Math.round(imgWidth * 1.5);
            const h = parseInt(customHeight) || Math.round(imgHeight * 1.5);
            setCanvasWidth(Math.max(imgWidth, Math.min(w, 4096)));
            setCanvasHeight(Math.max(imgHeight, Math.min(h, 4096)));
        } else {
            const option = SCALE_OPTIONS.find(s => s.id === scaleId);
            if (option && option.scale > 0) {
                setCanvasWidth(Math.round(imgWidth * option.scale));
                setCanvasHeight(Math.round(imgHeight * option.scale));
            }
        }
    };

    // 重置图片位置到中心
    const resetImagePosition = () => {
        if (!originalImage) return;
        const imgRatioX = originalImage.width / canvasWidth;
        const imgRatioY = originalImage.height / canvasHeight;
        setImageX((1 - imgRatioX) / 2);
        setImageY((1 - imgRatioY) / 2);
    };

    // 应用预设扩展方向
    const applyPreset = (presetId: string) => {
        if (!originalImage) return;

        const imgRatioX = originalImage.width / canvasWidth;
        const imgRatioY = originalImage.height / canvasHeight;

        let newX = (1 - imgRatioX) / 2;
        let newY = (1 - imgRatioY) / 2;

        if (presetId === 'top') {
            newY = 1 - imgRatioY;
        } else if (presetId === 'bottom') {
            newY = 0;
        } else if (presetId === 'left') {
            newX = 1 - imgRatioX;
        } else if (presetId === 'right') {
            newX = 0;
        }
        // 'all' 保持居中

        setImageX(Math.max(0, Math.min(newX, 1 - imgRatioX)));
        setImageY(Math.max(0, Math.min(newY, 1 - imgRatioY)));
    };

    // 拖拽开始
    const handleMouseDown = (e: React.MouseEvent) => {
        if (!originalImage) return;
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        setDragImageStart({ x: imageX, y: imageY });
    };

    // 拖拽移动
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging || !containerRef.current || !originalImage) return;

        const container = containerRef.current;
        const rect = container.getBoundingClientRect();

        const dx = (e.clientX - dragStart.x) / rect.width;
        const dy = (e.clientY - dragStart.y) / rect.height;

        const imgRatioX = originalImage.width / canvasWidth;
        const imgRatioY = originalImage.height / canvasHeight;

        const newX = Math.max(0, Math.min(dragImageStart.x + dx, 1 - imgRatioX));
        const newY = Math.max(0, Math.min(dragImageStart.y + dy, 1 - imgRatioY));

        setImageX(newX);
        setImageY(newY);
    }, [isDragging, dragStart, dragImageStart, canvasWidth, canvasHeight, originalImage]);

    // 拖拽结束
    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    // 添加全局鼠标事件
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, handleMouseMove, handleMouseUp]);

    // Gemini API 最大尺寸限制
    const MAX_API_SIZE = 3072;

    // 生成合成图
    const generateComposite = useCallback(() => {
        if (!originalImage || !canvasRef.current) return;

        const canvas = canvasRef.current;

        // 检查是否需要缩放以适应 API 限制
        let finalWidth = canvasWidth;
        let finalHeight = canvasHeight;
        let scale = 1;

        if (canvasWidth > MAX_API_SIZE || canvasHeight > MAX_API_SIZE) {
            // 需要缩放
            scale = Math.min(MAX_API_SIZE / canvasWidth, MAX_API_SIZE / canvasHeight);
            finalWidth = Math.round(canvasWidth * scale);
            finalHeight = Math.round(canvasHeight * scale);
        }

        canvas.width = finalWidth;
        canvas.height = finalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 填充中性灰背景作为需要扩展的区域标识
        // 使用 #7F7F7F (127,127,127) 中性灰
        ctx.fillStyle = '#7F7F7F';
        ctx.fillRect(0, 0, finalWidth, finalHeight);

        // 计算原图绘制位置和尺寸（按比例缩放）
        const drawX = imageX * finalWidth;
        const drawY = imageY * finalHeight;
        const drawWidth = originalImage.width * scale;
        const drawHeight = originalImage.height * scale;

        // 绘制原图（缩放后）
        ctx.drawImage(originalImage, drawX, drawY, drawWidth, drawHeight);

        // 导出合成图 - 使用 JPEG 格式减少文件大小（避免超过 API 的 7MB 限制）
        const compositeData = canvas.toDataURL('image/jpeg', 0.92);
        onCompositeReady(compositeData, finalWidth, finalHeight);
    }, [originalImage, canvasWidth, canvasHeight, imageX, imageY, onCompositeReady]);

    // 当相关参数改变时更新合成图
    useEffect(() => {
        if (originalImage) {
            generateComposite();
        }
    }, [originalImage, imageX, imageY, canvasWidth, canvasHeight, generateComposite]);

    // 处理缩放比例改变
    const handleScaleChange = (scaleId: string) => {
        setSelectedScale(scaleId);
        if (originalImage) {
            updateCanvasSize(originalImage.width, originalImage.height, scaleId);
            // 重置位置到中心
            setTimeout(() => resetImagePosition(), 0);
        }
    };

    // 处理自定义尺寸输入
    const handleCustomSizeChange = (type: 'width' | 'height', value: string) => {
        const numValue = value.replace(/\D/g, '');
        if (type === 'width') {
            setCustomWidth(numValue);
        } else {
            setCustomHeight(numValue);
        }
    };

    // 应用自定义尺寸
    const applyCustomSize = () => {
        if (!originalImage) return;
        const w = parseInt(customWidth) || originalImage.width;
        const h = parseInt(customHeight) || originalImage.height;
        // 确保尺寸不小于原图，不超过 4096
        setCanvasWidth(Math.max(originalImage.width, Math.min(w, 4096)));
        setCanvasHeight(Math.max(originalImage.height, Math.min(h, 4096)));
        setTimeout(() => resetImagePosition(), 0);
    };

    // 计算预览中原图的显示比例
    const imageWidthPercent = originalImage ? (originalImage.width / canvasWidth * 100) : 50;
    const imageHeightPercent = originalImage ? (originalImage.height / canvasHeight * 100) : 50;

    return (
        <div className="outpaint-editor">
            {/* 上传区域（未选择图片时显示） */}
            {!originalImage && (
                <div
                    className="upload-zone outpaint-upload"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div className="upload-icon">🖼️</div>
                    <div className="upload-text">上传要扩展的图片</div>
                    <div className="upload-hint">支持 JPG、PNG</div>
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
            />

            {/* 已上传图片时显示编辑器 */}
            {originalImage && (
                <>
                    {/* 缩放比例选择 */}
                    <div className="outpaint-controls">
                        <div className="control-group">
                            <label className="control-label">扩展比例</label>
                            <div className="scale-btns">
                                {SCALE_OPTIONS.map((option) => (
                                    <button
                                        key={option.id}
                                        className={`scale-btn ${selectedScale === option.id ? 'active' : ''}`}
                                        onClick={() => handleScaleChange(option.id)}
                                    >
                                        {option.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 自定义尺寸输入 */}
                        {selectedScale === 'custom' && (
                            <div className="control-group">
                                <label className="control-label">目标尺寸 (像素)</label>
                                <div className="custom-size-inputs">
                                    <input
                                        type="text"
                                        className="size-input"
                                        placeholder="宽度"
                                        value={customWidth}
                                        onChange={(e) => handleCustomSizeChange('width', e.target.value)}
                                        onBlur={applyCustomSize}
                                    />
                                    <span className="size-divider">×</span>
                                    <input
                                        type="text"
                                        className="size-input"
                                        placeholder="高度"
                                        value={customHeight}
                                        onChange={(e) => handleCustomSizeChange('height', e.target.value)}
                                        onBlur={applyCustomSize}
                                    />
                                </div>
                            </div>
                        )}

                        {/* 扩展方向预设 */}
                        <div className="control-group">
                            <label className="control-label">扩展方向</label>
                            <div className="preset-btns">
                                {EXPAND_PRESETS.map((preset) => (
                                    <button
                                        key={preset.id}
                                        className="preset-btn"
                                        onClick={() => applyPreset(preset.id)}
                                        title={preset.name}
                                    >
                                        {preset.icon}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 画布预览区 */}
                    <div
                        ref={containerRef}
                        className={`outpaint-canvas-container ${isDragging ? 'dragging' : ''}`}
                        style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
                        onMouseDown={handleMouseDown}
                    >
                        {/* 灰色背景表示扩展区域 */}
                        <div className="canvas-background">
                            {/* 原图位置指示器 */}
                            <div
                                className="image-preview"
                                style={{
                                    left: `${imageX * 100}%`,
                                    top: `${imageY * 100}%`,
                                    width: `${imageWidthPercent}%`,
                                    height: `${imageHeightPercent}%`,
                                }}
                            >
                                <img src={originalDataUrl} alt="Original" draggable={false} />
                            </div>
                        </div>

                        {/* 提示文字 */}
                        <div className="canvas-hint">拖动图片调整位置</div>
                    </div>

                    {/* 尺寸信息 */}
                    <div className="size-info">
                        <span>原图: {originalImage.width} × {originalImage.height}</span>
                        <span>→</span>
                        <span>目标: {canvasWidth} × {canvasHeight}</span>
                        {(canvasWidth > MAX_API_SIZE || canvasHeight > MAX_API_SIZE) && (
                            <span className="size-warning">
                                (API限制，实际: {Math.round(canvasWidth * Math.min(MAX_API_SIZE / canvasWidth, MAX_API_SIZE / canvasHeight))} × {Math.round(canvasHeight * Math.min(MAX_API_SIZE / canvasWidth, MAX_API_SIZE / canvasHeight))})
                            </span>
                        )}
                    </div>

                    {/* 更换图片按钮 */}
                    <button
                        className="change-image-btn"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        更换图片
                    </button>

                    {/* 隐藏的画布用于生成合成图 */}
                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                </>
            )}
        </div>
    );
}
