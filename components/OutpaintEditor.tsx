import { useState, useRef, useEffect, useCallback } from 'react';
import { Icons } from './Icons';

interface OutpaintEditorProps {
    onCompositeReady: (data: {
        compositeImage: string;
        maskImage: string;
        originalImage: string;
        originalX: number;
        originalY: number;
        originalWidth: number;
        originalHeight: number;
        width: number;
        height: number;
        targetWidth: number;
        targetHeight: number;
        scale: number;
    }) => void;
    aspectRatio: string;
    onAspectRatioChange?: (id: string) => void;
}

const ASPECT_RATIOS = [
    { id: '1:1', ratio: 1, name: '方形', dims: '1024 x 1024' },
    { id: '16:9', ratio: 16 / 9, name: '16:9', dims: '1024 x 576' },
    { id: '9:16', ratio: 9 / 16, name: '9:16', dims: '576 x 1024' },
    { id: '4:3', ratio: 4 / 3, name: '4:3', dims: '1024 x 768' },
    { id: '3:4', ratio: 3 / 4, name: '3:4', dims: '768 x 1024' },
];

type OutpaintMode = 'standard' | 'masked';

// Debounce helper
function debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
    let timeout: NodeJS.Timeout;
    return ((...args: any[]) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    }) as T;
}

export default function OutpaintEditor({ onCompositeReady, aspectRatio, onAspectRatioChange }: OutpaintEditorProps) {
    const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
    const [originalDataUrl, setOriginalDataUrl] = useState<string>('');
    const [canvasWidth, setCanvasWidth] = useState(1024);
    const [canvasHeight, setCanvasHeight] = useState(1024);
    const [imageX, setImageX] = useState(0);
    const [imageY, setImageY] = useState(0);
    const [imageScale, setImageScale] = useState(1);

    const [outpaintMode, setOutpaintMode] = useState<OutpaintMode>('standard');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [dragImageStart, setDragImageStart] = useState({ x: 0, y: 0 });

    // Masked Outpainting states
    const [isDrawing, setIsDrawing] = useState(false);
    const [brushSize, setBrushSize] = useState(30);
    const [showMask, setShowMask] = useState(false);
    const [customMaskData, setCustomMaskData] = useState<ImageData | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const displayMaskCanvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const activeRatio = ASPECT_RATIOS.find(r => r.id === aspectRatio) || ASPECT_RATIOS[0];

    // Initialize canvas based on aspect ratio
    useEffect(() => {
        const targetWidth = 1024;
        const targetHeight = targetWidth / activeRatio.ratio;
        setCanvasWidth(Math.round(targetWidth));
        setCanvasHeight(Math.round(targetHeight));
    }, [activeRatio]);

    // Initialize mask canvas when image is loaded or mode changes
    useEffect(() => {
        if (originalImage && outpaintMode === 'masked' && maskCanvasRef.current) {
            const maskCanvas = maskCanvasRef.current;
            maskCanvas.width = canvasWidth;
            maskCanvas.height = canvasHeight;
            const maskCtx = maskCanvas.getContext('2d');
            if (maskCtx) {
                // Fill with black (keep original)
                maskCtx.fillStyle = '#000000';
                maskCtx.fillRect(0, 0, canvasWidth, canvasHeight);

                // Draw original image area as black
                const drawW = originalImage.width * imageScale;
                const drawH = originalImage.height * imageScale;
                const drawX = imageX * canvasWidth;
                const drawY = imageY * canvasHeight;
                maskCtx.fillRect(drawX, drawY, drawW, drawH);
            }

            // Also initialize display mask canvas
            if (displayMaskCanvasRef.current) {
                displayMaskCanvasRef.current.width = canvasWidth;
                displayMaskCanvasRef.current.height = canvasHeight;
                const displayCtx = displayMaskCanvasRef.current.getContext('2d');
                if (displayCtx) {
                    displayCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                    displayCtx.fillRect(0, 0, canvasWidth, canvasHeight);
                }
            }
        }
    }, [originalImage, outpaintMode, canvasWidth, canvasHeight, imageX, imageY, imageScale]);

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
                // Initial placement: center
                const initialScale = Math.min(canvasWidth / img.width, canvasHeight / img.height, 1.0);
                setImageScale(initialScale);
                setImageX((canvasWidth - img.width * initialScale) / 2 / canvasWidth);
                setImageY((canvasHeight - img.height * initialScale) / 2 / canvasHeight);
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    };

    const alignImage = (h: 'left' | 'center' | 'right', v: 'top' | 'middle' | 'bottom') => {
        if (!originalImage) return;
        const imgW = originalImage.width * imageScale;
        const imgH = originalImage.height * imageScale;

        let newX = imageX;
        let newY = imageY;

        if (h === 'left') newX = 0;
        else if (h === 'center') newX = (canvasWidth - imgW) / 2 / canvasWidth;
        else if (h === 'right') newX = (canvasWidth - imgW) / canvasWidth;

        if (v === 'top') newY = 0;
        else if (v === 'middle') newY = (canvasHeight - imgH) / 2 / canvasHeight;
        else if (v === 'bottom') newY = (canvasHeight - imgH) / canvasHeight;

        setImageX(newX);
        setImageY(newY);
    };

    const generateComposite = useCallback(() => {
        if (!originalImage || !canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Gray background for AI
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        const drawW = originalImage.width * imageScale;
        const drawH = originalImage.height * imageScale;
        const drawX = imageX * canvasWidth;
        const drawY = imageY * canvasHeight;

        ctx.drawImage(originalImage, drawX, drawY, drawW, drawH);

        const compositeData = canvas.toDataURL('image/jpeg', 0.95);

        // Generate mask
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = canvasWidth;
        maskCanvas.height = canvasHeight;
        const maskCtx = maskCanvas.getContext('2d');
        if (maskCtx) {
            if (outpaintMode === 'masked' && customMaskData) {
                // Use custom drawn mask
                maskCtx.putImageData(customMaskData, 0, 0);
            } else {
                // Standard mode: white background, black original
                maskCtx.fillStyle = '#FFFFFF';
                maskCtx.fillRect(0, 0, canvasWidth, canvasHeight);
                maskCtx.fillStyle = '#000000';
                maskCtx.fillRect(drawX, drawY, drawW, drawH);
            }

            onCompositeReady({
                compositeImage: compositeData,
                maskImage: maskCanvas.toDataURL('image/png'),
                originalImage: originalDataUrl,
                originalX: imageX,
                originalY: imageY,
                originalWidth: originalImage.width,
                originalHeight: originalImage.height,
                width: canvasWidth,
                height: canvasHeight,
                targetWidth: canvasWidth,
                targetHeight: canvasHeight,
                scale: imageScale,
            });
        }
    }, [originalImage, originalDataUrl, canvasWidth, canvasHeight, imageX, imageY, imageScale, outpaintMode, customMaskData, onCompositeReady]);

    // Use debounced version for updates during drag
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const debouncedGenerateComposite = useCallback(
        debounce(() => generateComposite(), 100),
        [generateComposite]
    );

    useEffect(() => {
        if (originalImage) {
            if (isDragging) {
                debouncedGenerateComposite();
            } else {
                generateComposite();
            }
        }
    }, [imageX, imageY, imageScale, canvasWidth, canvasHeight, generateComposite, originalImage, isDragging, debouncedGenerateComposite]);

    // Mask drawing handlers
    const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!displayMaskCanvasRef.current) return { x: 0, y: 0 };
        const canvas = displayMaskCanvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    };

    const handleMaskMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (outpaintMode !== 'masked') return;
        setIsDrawing(true);
        const pos = getMousePos(e);
        drawOnMask(pos.x, pos.y);
    };

    const handleMaskMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || outpaintMode !== 'masked') return;
        const pos = getMousePos(e);
        drawOnMask(pos.x, pos.y);
    };

    const handleMaskMouseUp = () => {
        setIsDrawing(false);
        // Save mask data
        if (maskCanvasRef.current) {
            const maskCtx = maskCanvasRef.current.getContext('2d');
            if (maskCtx) {
                const imageData = maskCtx.getImageData(0, 0, canvasWidth, canvasHeight);
                setCustomMaskData(imageData);
            }
        }
    };

    const drawOnMask = (x: number, y: number) => {
        // Draw on actual mask canvas (black = keep, white = generate)
        if (maskCanvasRef.current) {
            const maskCtx = maskCanvasRef.current.getContext('2d');
            if (maskCtx) {
                maskCtx.beginPath();
                maskCtx.arc(x, y, brushSize, 0, Math.PI * 2);
                maskCtx.fillStyle = '#FFFFFF'; // White = generate
                maskCtx.fill();
            }
        }

        // Draw on display mask canvas (semi-transparent red overlay)
        if (displayMaskCanvasRef.current) {
            const displayCtx = displayMaskCanvasRef.current.getContext('2d');
            if (displayCtx) {
                displayCtx.beginPath();
                displayCtx.arc(x, y, brushSize, 0, Math.PI * 2);
                displayCtx.fillStyle = 'rgba(255, 100, 100, 0.7)';
                displayCtx.fill();
            }
        }
    };

    const clearMask = () => {
        if (maskCanvasRef.current) {
            const maskCtx = maskCanvasRef.current.getContext('2d');
            if (maskCtx) {
                maskCtx.fillStyle = '#000000';
                maskCtx.fillRect(0, 0, canvasWidth, canvasHeight);
            }
        }
        if (displayMaskCanvasRef.current) {
            const displayCtx = displayMaskCanvasRef.current.getContext('2d');
            if (displayCtx) {
                displayCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                displayCtx.fillRect(0, 0, canvasWidth, canvasHeight);
            }
        }
        setCustomMaskData(null);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!originalImage || outpaintMode === 'masked') return;
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        setDragImageStart({ x: imageX, y: imageY });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (isDragging && containerRef.current && originalImage) {
            const containerRect = containerRef.current.getBoundingClientRect();
            // Calculate movement in canvas space
            const dx = (e.clientX - dragStart.x) * (canvasWidth / containerRect.width);
            const dy = (e.clientY - dragStart.y) * (canvasHeight / containerRect.height);

            setImageX(dragImageStart.x + dx / canvasWidth);
            setImageY(dragImageStart.y + dy / canvasHeight);
        }
    }, [isDragging, dragStart, dragImageStart, canvasWidth, canvasHeight, originalImage]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

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

    return (
        <div className="flex flex-col items-center w-full gap-4">
            {/* Mode Selection */}
            {originalImage && (
                <div className="flex gap-2 p-1 bg-[var(--bg-tertiary)] rounded-lg w-full max-w-[400px]">
                    <button
                        onClick={() => setOutpaintMode('standard')}
                        className={`flex-1 py-2.5 px-4 rounded-md border-none text-sm font-medium cursor-pointer transition-all duration-200 ${outpaintMode === 'standard'
                            ? 'bg-[var(--accent)] text-black'
                            : 'bg-transparent text-[var(--text-secondary)]'
                            }`}
                    >
                        标准扩图
                    </button>
                    <button
                        onClick={() => setOutpaintMode('masked')}
                        className={`flex-1 py-2.5 px-4 rounded-md border-none text-sm font-medium cursor-pointer transition-all duration-200 ${outpaintMode === 'masked'
                            ? 'bg-[var(--accent)] text-black'
                            : 'bg-transparent text-[var(--text-secondary)]'
                            }`}
                    >
                        遮罩扩图
                    </button>
                </div>
            )}

            {/* Masked Mode Controls */}
            {originalImage && outpaintMode === 'masked' && (
                <div className="flex flex-col gap-3 p-4 bg-[var(--bg-tertiary)] rounded-xl w-full max-w-[400px]">
                    <div className="text-[13px] text-[var(--text-secondary)] mb-1">
                        🖌️ 使用画笔绘制想要扩展的区域（红色区域将被 AI 生成）
                    </div>

                    {/* Brush Size */}
                    <div className="flex items-center gap-3">
                        <span className="text-[13px] text-[var(--text-secondary)] min-w-[60px]">画笔大小</span>
                        <input
                            type="range"
                            min="10"
                            max="100"
                            value={brushSize}
                            onChange={(e) => setBrushSize(Number(e.target.value))}
                            className="flex-1"
                        />
                        <span className="text-[13px] text-[var(--text-primary)] min-w-[30px]">{brushSize}px</span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowMask(!showMask)}
                            className="flex-1 py-2 px-3 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-[13px] cursor-pointer flex items-center justify-center gap-1.5"
                        >
                            <Icons.Eye />
                            {showMask ? '隐藏遮罩' : '显示遮罩'}
                        </button>
                        <button
                            onClick={clearMask}
                            className="flex-1 py-2 px-3 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-[13px] cursor-pointer flex items-center justify-center gap-1.5"
                        >
                            <Icons.Eraser />
                            清除遮罩
                        </button>
                    </div>
                </div>
            )}

            <div className="editor-canvas-container transparency-grid" ref={containerRef}>
                {/* Ratio Dropdown */}
                <div className="ratio-dropdown">
                    <button className="ratio-btn" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                        <div className="ratio-icon-box">
                            <div className="ratio-shape" style={{
                                width: Math.min(18, 18 * (activeRatio.ratio > 1 ? 1 : activeRatio.ratio)),
                                height: Math.min(18, 18 * (activeRatio.ratio < 1 ? 1 : 1 / activeRatio.ratio))
                            }} />
                        </div>
                        <span style={{ minWidth: 40 }}>{activeRatio.id}</span>
                        <div className={`transform transition-transform duration-200 opacity-50 ${isMenuOpen ? 'rotate-180' : ''}`}>
                            <Icons.ChevronDown />
                        </div>
                    </button>
                    {isMenuOpen && (
                        <div className="ratio-menu">
                            {ASPECT_RATIOS.map((r) => (
                                <div
                                    key={r.id}
                                    className={`ratio-item ${r.id === aspectRatio ? 'active' : ''}`}
                                    onClick={() => {
                                        onAspectRatioChange?.(r.id);
                                        setIsMenuOpen(false);
                                    }}
                                >
                                    <div className="ratio-icon-box">
                                        <div className="ratio-shape" style={{
                                            width: Math.min(18, 18 * (r.ratio > 1 ? 1 : r.ratio)),
                                            height: Math.min(18, 18 * (r.ratio < 1 ? 1 : 1 / r.ratio))
                                        }} />
                                    </div>
                                    <div className="ratio-info">
                                        <span className="ratio-label">{r.name}</span>
                                        <span className="ratio-dims">{r.dims}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {!originalImage ? (
                    <div
                        className="flex flex-col items-center cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Icons.Image />
                        <p className="text-[var(--text-secondary)] text-sm">上传或拖拽图片到此处</p>
                    </div>
                ) : (
                    <div
                        className="selection-box"
                        style={{
                            aspectRatio: activeRatio.ratio,
                            width: activeRatio.ratio > 1 ? '90%' : 'auto',
                            height: activeRatio.ratio > 1 ? 'auto' : '90%',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                    >
                        {/* Hidden actual canvas for composing */}
                        <canvas ref={canvasRef} style={{ display: 'none' }} />

                        {/* Hidden mask canvas */}
                        <canvas ref={maskCanvasRef} style={{ display: 'none' }} />

                        {/* Draggable Image Layer */}
                        <div
                            onMouseDown={handleMouseDown}
                            className={`absolute z-10 ${outpaintMode === 'standard' ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default pointer-events-none'}`}
                            style={{
                                left: `${imageX * 100}%`,
                                top: `${imageY * 100}%`,
                                width: `${(originalImage.width * imageScale / canvasWidth) * 100}%`,
                                height: `${(originalImage.height * imageScale / canvasHeight) * 100}%`,
                                pointerEvents: outpaintMode === 'standard' ? 'auto' : 'none',
                            }}
                        >
                            <img
                                src={originalDataUrl}
                                style={{ width: '100%', height: '100%', display: 'block', objectFit: 'fill' }}
                                alt="Original"
                                draggable={false}
                            />
                        </div>

                        {/* Mask Drawing Canvas */}
                        {outpaintMode === 'masked' && (
                            <canvas
                                ref={displayMaskCanvasRef}
                                onMouseDown={handleMaskMouseDown}
                                onMouseMove={handleMaskMouseMove}
                                onMouseUp={handleMaskMouseUp}
                                onMouseLeave={handleMaskMouseUp}
                                className={`absolute top-0 left-0 w-full h-full z-20 cursor-crosshair pointer-events-auto transition-opacity duration-200 ${showMask ? 'opacity-100' : 'opacity-30'}`}
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Alignment Toolbar */}
            {originalImage && outpaintMode === 'standard' && (
                <div className="flex flex-col items-center gap-3">
                    <div className="alignment-toolbar">
                        <button className="toolbar-icon-btn" title="左对齐" onClick={() => alignImage('left', 'middle')}><Icons.AlignLeft /></button>
                        <button className="toolbar-icon-btn" title="水平居中" onClick={() => alignImage('center', 'middle')}><Icons.AlignCenter /></button>
                        <button className="toolbar-icon-btn" title="右对齐" onClick={() => alignImage('right', 'middle')}><Icons.AlignRight /></button>
                        <div className="w-[1px] h-5 bg-[var(--border)] mx-1" />
                        <button className="toolbar-icon-btn" title="顶对齐" onClick={() => alignImage('center', 'top')}><Icons.AlignTop /></button>
                        <button className="toolbar-icon-btn" title="垂直居中" onClick={() => alignImage('center', 'middle')}><Icons.AlignMiddle /></button>
                        <button className="toolbar-icon-btn" title="底对齐" onClick={() => alignImage('center', 'bottom')}><Icons.AlignBottom /></button>
                    </div>
                </div>
            )}

            {/* Clear Image Button */}
            {originalImage && (
                <button
                    onClick={() => {
                        setOriginalImage(null);
                        setOriginalDataUrl('');
                        setCustomMaskData(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="py-1.5 px-3 bg-transparent border border-[var(--border)] rounded-md text-[var(--text-secondary)] text-xs cursor-pointer"
                >
                    清除图片
                </button>
            )}

            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={handleFileUpload}
            />
        </div>
    );
}
