import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Icons } from './Icons';

export interface OutpaintEditorHandle {
    openFileDialog: () => void;
    clear: () => void;
}

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
    imageSize: string;
}

const ASPECT_RATIOS = [
    { id: '1:1', ratio: 1, name: '1:1' },
    { id: '4:3', ratio: 4 / 3, name: '4:3' },
    { id: '16:9', ratio: 16 / 9, name: '16:9' },
    { id: '3:4', ratio: 3 / 4, name: '3:4' },
    { id: '9:16', ratio: 9 / 16, name: '9:16' },
    { id: '3:2', ratio: 3 / 2, name: '3:2' },
    { id: '2:3', ratio: 2 / 3, name: '2:3' },
    { id: '5:4', ratio: 5 / 4, name: '5:4' },
    { id: '4:5', ratio: 4 / 5, name: '4:5' },
    { id: '21:9', ratio: 21 / 9, name: '21:9' },
    { id: '4:1', ratio: 4, name: '4:1' },
    { id: '1:4', ratio: 1 / 4, name: '1:4' },
    { id: '8:1', ratio: 8, name: '8:1' },
    { id: '1:8', ratio: 1 / 8, name: '1:8' },
];

// Debounce helper
function debounce<T extends (...args: unknown[]) => void>(func: T, wait: number): T {
    let timeout: ReturnType<typeof setTimeout>;
    return ((...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    }) as T;
}

function getTargetWidth(imageSize: string): number {
    if (imageSize === '4K') return 4096;
    if (imageSize === '2K') return 2048;
    if (imageSize === '512px') return 512;
    return 1024;
}

const OutpaintEditor = forwardRef<OutpaintEditorHandle, OutpaintEditorProps>(function OutpaintEditor(
    { onCompositeReady, aspectRatio, imageSize },
    ref
) {
    const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
    const [originalDataUrl, setOriginalDataUrl] = useState<string>('');
    const [canvasWidth, setCanvasWidth] = useState(1024);
    const [canvasHeight, setCanvasHeight] = useState(1024);
    const [imageX, setImageX] = useState(0);
    const [imageY, setImageY] = useState(0);
    const [imageScale, setImageScale] = useState(1);
    const [displaySize, setDisplaySize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [dragImageStart, setDragImageStart] = useState({ x: 0, y: 0 });

    const viewportRef = useRef<HTMLDivElement>(null);
    const selectionBoxRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
        openFileDialog: () => {
            fileInputRef.current?.click();
        },
        clear: () => {
            setOriginalImage(null);
            setOriginalDataUrl('');
            setImageX(0);
            setImageY(0);
            setImageScale(1);
            if (fileInputRef.current) fileInputRef.current.value = '';
        },
    }), []);

    // 'auto' 在扩图模式中不适用，默认使用 1:1
    const activeRatio = ASPECT_RATIOS.find(r => r.id === aspectRatio) || ASPECT_RATIOS[0];

    useEffect(() => {
        const el = viewportRef.current;
        if (!el) return;

        const ro = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            const { width, height } = entry.contentRect;
            const padding = 24;
            const availableWidth = Math.max(1, width - padding);
            const availableHeight = Math.max(1, height - padding);

            const ratio = activeRatio.ratio;
            let w = availableWidth;
            let h = availableWidth / ratio;
            if (h > availableHeight) {
                h = availableHeight;
                w = availableHeight * ratio;
            }
            setDisplaySize({ width: Math.floor(w), height: Math.floor(h) });
        });

        ro.observe(el);
        return () => ro.disconnect();
    }, [activeRatio.ratio]);

    // Initialize canvas based on aspect ratio
    useEffect(() => {
        const targetWidth = getTargetWidth(imageSize);
        const targetHeight = targetWidth / activeRatio.ratio;
        setCanvasWidth(Math.round(targetWidth));
        setCanvasHeight(Math.round(targetHeight));
    }, [activeRatio, imageSize]);



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

        // Calculate the width/height of the image as a percentage [0-1] of the canvas
        const imgWPercent = (originalImage.width * imageScale) / canvasWidth;
        const imgHPercent = (originalImage.height * imageScale) / canvasHeight;

        let newX = imageX;
        let newY = imageY;

        if (h === 'left') newX = 0;
        else if (h === 'center') newX = (1 - imgWPercent) / 2;
        else if (h === 'right') newX = 1 - imgWPercent;

        if (v === 'top') newY = 0;
        else if (v === 'middle') newY = (1 - imgHPercent) / 2;
        else if (v === 'bottom') newY = 1 - imgHPercent;

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

        // 采样图片边缘像素色彩，作为画布背景色
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = originalImage.width;
        sampleCanvas.height = originalImage.height;
        const sampleCtx = sampleCanvas.getContext('2d');
        let bgColor = '#808080';
        if (sampleCtx) {
            sampleCtx.drawImage(originalImage, 0, 0);
            const edgePixels: number[][] = [];
            const w = originalImage.width;
            const h = originalImage.height;
            // 采样四边的像素
            for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 20))) {
                const topP = sampleCtx.getImageData(x, 0, 1, 1).data;
                edgePixels.push([topP[0], topP[1], topP[2]]);
                const botP = sampleCtx.getImageData(x, h - 1, 1, 1).data;
                edgePixels.push([botP[0], botP[1], botP[2]]);
            }
            for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 20))) {
                const leftP = sampleCtx.getImageData(0, y, 1, 1).data;
                edgePixels.push([leftP[0], leftP[1], leftP[2]]);
                const rightP = sampleCtx.getImageData(w - 1, y, 1, 1).data;
                edgePixels.push([rightP[0], rightP[1], rightP[2]]);
            }
            if (edgePixels.length > 0) {
                const avg = edgePixels.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
                const r = Math.round(avg[0] / edgePixels.length);
                const g = Math.round(avg[1] / edgePixels.length);
                const b = Math.round(avg[2] / edgePixels.length);
                bgColor = `rgb(${r},${g},${b})`;
            }
        }
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        const drawW = originalImage.width * imageScale;
        const drawH = originalImage.height * imageScale;
        const drawX = imageX * canvasWidth;
        const drawY = imageY * canvasHeight;

        ctx.drawImage(originalImage, drawX, drawY, drawW, drawH);

        const compositeData = canvas.toDataURL('image/jpeg', canvasWidth >= 2048 ? 0.92 : 0.95);

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

    const handleTouchStart = (e: React.TouchEvent) => {
        if (!originalImage) return;
        const touch = e.touches[0];
        if (!touch) return;
        setIsDragging(true);
        setDragStart({ x: touch.clientX, y: touch.clientY });
        setDragImageStart({ x: imageX, y: imageY });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (isDragging && selectionBoxRef.current && originalImage) {
            const boxRect = selectionBoxRef.current.getBoundingClientRect();
            // Calculate movement directly relative to the actual selection box drawing the canvas area
            const dx = (e.clientX - dragStart.x) * (canvasWidth / boxRect.width);
            const dy = (e.clientY - dragStart.y) * (canvasHeight / boxRect.height);

            setImageX(dragImageStart.x + dx / canvasWidth);
            setImageY(dragImageStart.y + dy / canvasHeight);
        }
    }, [isDragging, dragStart, dragImageStart, canvasWidth, canvasHeight, originalImage]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (isDragging && selectionBoxRef.current && originalImage) {
            const touch = e.touches[0];
            if (!touch) return;

            e.preventDefault();
            const boxRect = selectionBoxRef.current.getBoundingClientRect();
            const dx = (touch.clientX - dragStart.x) * (canvasWidth / boxRect.width);
            const dy = (touch.clientY - dragStart.y) * (canvasHeight / boxRect.height);

            setImageX(dragImageStart.x + dx / canvasWidth);
            setImageY(dragImageStart.y + dy / canvasHeight);
        }
    }, [isDragging, dragStart, dragImageStart, canvasWidth, canvasHeight, originalImage]);

    const handleTouchEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('touchmove', handleTouchMove, { passive: false });
            window.addEventListener('touchend', handleTouchEnd);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
                window.removeEventListener('touchmove', handleTouchMove);
                window.removeEventListener('touchend', handleTouchEnd);
            };
        }
    }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

    return (
        <div className="w-full flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">画布</span>
                    <span className="text-xs text-gray-400">{canvasWidth} x {canvasHeight}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-2 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                        选择图片
                    </button>
                    {originalImage && (
                        <button
                            type="button"
                            onClick={() => {
                                setOriginalImage(null);
                                setOriginalDataUrl('');
                                setImageX(0);
                                setImageY(0);
                                setImageScale(1);
                                if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="px-3 py-2 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                            清除
                        </button>
                    )}
                </div>
            </div>

            <div
                ref={viewportRef}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center select-none"
                style={{ height: 'min(60vh, 560px)' }}
                onWheel={handleWheel}
            >
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                <div
                    ref={selectionBoxRef}
                    className="relative overflow-hidden bg-white rounded-xl border-2 border-dashed border-gray-300 shadow-sm"
                    style={{
                        width: displaySize.width ? `${displaySize.width}px` : '100%',
                        height: displaySize.height ? `${displaySize.height}px` : '100%',
                    }}
                >
                    <div className="absolute top-2 left-2 z-20 px-2 py-1 rounded-md bg-white/80 backdrop-blur border border-gray-200 text-[11px] text-gray-600">
                        {activeRatio.name}
                    </div>
                    {!originalImage ? (
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-500"
                        >
                            <Icons.Image />
                            <span className="text-sm font-medium">点击上传图片开始扩图</span>
                            <span className="text-xs text-gray-400">拖拽图片位置，滚轮/双指缩放</span>
                        </button>
                    ) : (
                        <div className="absolute inset-0">
                            <div
                                onMouseDown={handleMouseDown}
                                onTouchStart={handleTouchStart}
                                className={`${isDragging ? 'cursor-grabbing' : 'cursor-grab'} absolute`}
                                style={{
                                    left: `${imageX * 100}%`,
                                    top: `${imageY * 100}%`,
                                    width: `${(originalImage.width * imageScale / canvasWidth) * 100}%`,
                                    height: `${(originalImage.height * imageScale / canvasHeight) * 100}%`,
                                    touchAction: 'none',
                                }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={originalDataUrl}
                                    alt="原图"
                                    draggable={false}
                                    className="w-full h-full block object-fill"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {originalImage && (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-center gap-2">
                        <button type="button" className="w-9 h-9 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center" onClick={() => alignImage('left', 'middle')} aria-label="左对齐"><Icons.AlignLeft /></button>
                        <button type="button" className="w-9 h-9 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center" onClick={() => alignImage('center', 'middle')} aria-label="水平居中"><Icons.AlignCenter /></button>
                        <button type="button" className="w-9 h-9 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center" onClick={() => alignImage('right', 'middle')} aria-label="右对齐"><Icons.AlignRight /></button>
                        <div className="w-px h-6 bg-gray-200 mx-1" />
                        <button type="button" className="w-9 h-9 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center" onClick={() => alignImage('center', 'top')} aria-label="顶对齐"><Icons.AlignTop /></button>
                        <button type="button" className="w-9 h-9 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center" onClick={() => alignImage('center', 'middle')} aria-label="垂直居中"><Icons.AlignMiddle /></button>
                        <button type="button" className="w-9 h-9 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center" onClick={() => alignImage('center', 'bottom')} aria-label="底对齐"><Icons.AlignBottom /></button>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-gray-500 w-12">缩放</span>
                        <input
                            type="range"
                            min="10"
                            max="300"
                            value={imageScale * 100}
                            onChange={(e) => setImageScale(Number(e.target.value) / 100)}
                            className="flex-1 accent-indigo-600"
                        />
                        <span className="text-xs text-gray-500 w-12 text-right">{Math.round(imageScale * 100)}%</span>
                    </div>
                </div>
            )}

            <input
                type="file"
                ref={fileInputRef}
                hidden
                accept="image/*"
                onChange={handleFileUpload}
            />
        </div>
    );
});

export default OutpaintEditor;
