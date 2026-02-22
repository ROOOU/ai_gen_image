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

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const activeRatio = ASPECT_RATIOS.find(r => r.id === aspectRatio) || ASPECT_RATIOS[0];

    // Initialize canvas based on aspect ratio
    useEffect(() => {
        const targetWidth = 1024;
        const targetHeight = targetWidth / activeRatio.ratio;
        setCanvasWidth(Math.round(targetWidth));
        setCanvasHeight(Math.round(targetHeight));
    }, [activeRatio]);



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
            // Auto-generate mask: white = area to generate, black = keep original
            maskCtx.fillStyle = '#FFFFFF';
            maskCtx.fillRect(0, 0, canvasWidth, canvasHeight);
            maskCtx.fillStyle = '#000000';
            maskCtx.fillRect(drawX, drawY, drawW, drawH);

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
    }, [originalImage, originalDataUrl, canvasWidth, canvasHeight, imageX, imageY, imageScale, onCompositeReady]);

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



    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (!originalImage) return;
        const delta = e.deltaY < 0 ? 0.05 : -0.05;
        setImageScale(prev => Math.min(Math.max(0.1, prev + delta), 3.0));
    }, [originalImage]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!originalImage) return;
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
            <div className="editor-canvas-container transparency-grid" ref={containerRef} onWheel={handleWheel}>
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

                        {/* Draggable Image Layer */}
                        <div
                            onMouseDown={handleMouseDown}
                            className={`absolute z-10 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                            style={{
                                left: `${imageX * 100}%`,
                                top: `${imageY * 100}%`,
                                width: `${(originalImage.width * imageScale / canvasWidth) * 100}%`,
                                height: `${(originalImage.height * imageScale / canvasHeight) * 100}%`,
                            }}
                        >
                            <img
                                src={originalDataUrl}
                                style={{ width: '100%', height: '100%', display: 'block', objectFit: 'fill' }}
                                alt="Original"
                                draggable={false}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Alignment Toolbar */}
            {
                originalImage && (
                    <div className="flex flex-col items-center gap-3 w-full">
                        <div className="alignment-toolbar">
                            <button className="toolbar-icon-btn" title="左对齐" onClick={() => alignImage('left', 'middle')}><Icons.AlignLeft /></button>
                            <button className="toolbar-icon-btn" title="水平居中" onClick={() => alignImage('center', 'middle')}><Icons.AlignCenter /></button>
                            <button className="toolbar-icon-btn" title="右对齐" onClick={() => alignImage('right', 'middle')}><Icons.AlignRight /></button>
                            <div className="w-[1px] h-5 bg-[var(--border)] mx-1" />
                            <button className="toolbar-icon-btn" title="顶对齐" onClick={() => alignImage('center', 'top')}><Icons.AlignTop /></button>
                            <button className="toolbar-icon-btn" title="垂直居中" onClick={() => alignImage('center', 'middle')}><Icons.AlignMiddle /></button>
                            <button className="toolbar-icon-btn" title="底对齐" onClick={() => alignImage('center', 'bottom')}><Icons.AlignBottom /></button>
                        </div>

                        <div className="flex items-center gap-3 w-full max-w-[400px] mt-2">
                            <span className="text-xs text-[var(--text-secondary)]">缩放</span>
                            <input
                                type="range"
                                min="10"
                                max="300"
                                value={imageScale * 100}
                                onChange={(e) => setImageScale(Number(e.target.value) / 100)}
                                className="flex-1 accent-[var(--accent)]"
                            />
                            <span className="text-xs text-[var(--text-secondary)] w-12 text-right">{Math.round(imageScale * 100)}%</span>
                        </div>
                    </div>
                )
            }

            {/* Clear Image Button */}
            {
                originalImage && (
                    <button
                        onClick={() => {
                            setOriginalImage(null);
                            setOriginalDataUrl('');
                            if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="py-1.5 px-3 bg-transparent border border-[var(--border)] rounded-md text-[var(--text-secondary)] text-xs cursor-pointer"
                    >
                        清除图片
                    </button>
                )
            }

            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={handleFileUpload}
            />
        </div >
    );
}
