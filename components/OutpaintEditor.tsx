'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

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
}

const ASPECT_RATIOS = [
    { id: '1:1', ratio: 1, name: '1:1' },
    { id: '9:16', ratio: 9/16, name: '9:16' },
    { id: '16:9', ratio: 16/9, name: '16:9' },
    { id: '3:2', ratio: 3/2, name: '3:2' },
    { id: '2:3', ratio: 2/3, name: '2:3' },
    { id: '4:3', ratio: 4/3, name: '4:3' },
    { id: '3:4', ratio: 3/4, name: '3:4' },
];

export default function OutpaintEditor({ onCompositeReady }: OutpaintEditorProps) {
    const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
    const [originalDataUrl, setOriginalDataUrl] = useState<string>('');
    const [canvasWidth, setCanvasWidth] = useState(1024);
    const [canvasHeight, setCanvasHeight] = useState(1024);
    const [selectedRatio, setSelectedRatio] = useState('1:1');
    const [imageX, setImageX] = useState(0.25);
    const [imageY, setImageY] = useState(0.25);
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [resizeEdge, setResizeEdge] = useState<string | null>(null);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [dragImageStart, setDragImageStart] = useState({ x: 0, y: 0 });
    const [resizeStart, setResizeStart] = useState({ width: 0, height: 0, x: 0, y: 0 });
    const [showGrid, setShowGrid] = useState(true);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [expansionPixels, setExpansionPixels] = useState(128);

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const updateSize = () => {
            if (wrapperRef.current) {
                const rect = wrapperRef.current.getBoundingClientRect();
                setContainerSize({ width: rect.width, height: rect.height });
            }
        };
        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('请上传图片文件');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            alert('图片大小不能超过 10MB');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            setOriginalDataUrl(dataUrl);
            const img = new Image();
            img.onload = () => {
                setOriginalImage(img);
                const ratioObj = ASPECT_RATIOS.find(r => r.id === selectedRatio);
                const targetRatio = ratioObj ? ratioObj.ratio : 1;
                
                let newWidth, newHeight;
                const imgRatio = img.width / img.height;
                
                if (imgRatio > targetRatio) {
                    newWidth = Math.max(img.width * 1.5, 1024);
                    newHeight = newWidth / targetRatio;
                } else {
                    newHeight = Math.max(img.height * 1.5, 1024);
                    newWidth = newHeight * targetRatio;
                }
                
                setCanvasWidth(Math.round(newWidth));
                setCanvasHeight(Math.round(newHeight));
                setImageX((1 - img.width / newWidth) / 2);
                setImageY((1 - img.height / newHeight) / 2);
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    };

    const handleRatioChange = (ratioId: string) => {
        setSelectedRatio(ratioId);
        if (!originalImage) return;
        
        const ratioObj = ASPECT_RATIOS.find(r => r.id === ratioId);
        if (!ratioObj) return;
        
        const targetRatio = ratioObj.ratio;
        const currentCenterX = imageX + (originalImage.width / canvasWidth) / 2;
        const currentCenterY = imageY + (originalImage.height / canvasHeight) / 2;
        
        let newWidth = canvasWidth;
        let newHeight = newWidth / targetRatio;
        
        if (newHeight < originalImage.height * 1.2) {
            newHeight = originalImage.height * 1.2;
            newWidth = newHeight * targetRatio;
        }
        
        setCanvasWidth(Math.round(newWidth));
        setCanvasHeight(Math.round(newHeight));
        
        const newImgRatioX = originalImage.width / newWidth;
        const newImgRatioY = originalImage.height / newHeight;
        
        setImageX(Math.max(0, Math.min(currentCenterX - newImgRatioX / 2, 1 - newImgRatioX)));
        setImageY(Math.max(0, Math.min(currentCenterY - newImgRatioY / 2, 1 - newImgRatioY)));
    };

    const handleExpansionChange = (pixels: number) => {
        setExpansionPixels(pixels);
        if (!originalImage) return;
        
        const ratioObj = ASPECT_RATIOS.find(r => r.id === selectedRatio);
        const targetRatio = ratioObj ? ratioObj.ratio : (canvasWidth / canvasHeight);
        
        const newWidth = originalImage.width + pixels * 2;
        const newHeight = originalImage.height + pixels * 2;
        
        let finalWidth = newWidth;
        let finalHeight = finalWidth / targetRatio;
        
        if (finalHeight < newHeight) {
            finalHeight = newHeight;
            finalWidth = finalHeight * targetRatio;
        }
        
        setCanvasWidth(Math.round(finalWidth));
        setCanvasHeight(Math.round(finalHeight));
        setImageX(pixels / finalWidth);
        setImageY(pixels / finalHeight);
    };

    const extendCanvas = (direction: 'top' | 'bottom' | 'left' | 'right') => {
        if (!originalImage) return;
        
        const ratioObj = ASPECT_RATIOS.find(r => r.id === selectedRatio);
        const targetRatio = ratioObj ? ratioObj.ratio : (canvasWidth / canvasHeight);
        
        let newWidth = canvasWidth;
        let newHeight = canvasHeight;
        
        if (direction === 'top' || direction === 'bottom') {
            newHeight = canvasHeight + expansionPixels;
            newWidth = newHeight * targetRatio;
        } else {
            newWidth = canvasWidth + expansionPixels;
            newHeight = newWidth / targetRatio;
        }
        
        if (direction === 'top') {
            setImageY(imageY + (expansionPixels / 2) / newHeight);
        } else if (direction === 'left') {
            setImageX(imageX + (expansionPixels / 2) / newWidth);
        }
        
        setCanvasWidth(Math.round(newWidth));
        setCanvasHeight(Math.round(newHeight));
    };

    const generateComposite = useCallback(() => {
        if (!originalImage || !canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        const drawX = imageX * canvasWidth;
        const drawY = imageY * canvasHeight;
        ctx.drawImage(originalImage, drawX, drawY, originalImage.width, originalImage.height);

        const compositeData = canvas.toDataURL('image/jpeg', 0.95);

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = canvasWidth;
        maskCanvas.height = canvasHeight;
        const maskCtx = maskCanvas.getContext('2d');
        if (maskCtx) {
            maskCtx.fillStyle = '#FFFFFF';
            maskCtx.fillRect(0, 0, canvasWidth, canvasHeight);
            maskCtx.fillStyle = '#000000';
            maskCtx.fillRect(drawX, drawY, originalImage.width, originalImage.height);
            
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
                scale: canvasWidth / originalImage.width,
            });
        }
    }, [originalImage, originalDataUrl, canvasWidth, canvasHeight, imageX, imageY, onCompositeReady]);

    useEffect(() => {
        if (originalImage) {
            generateComposite();
        }
    }, [originalImage, imageX, imageY, canvasWidth, canvasHeight, generateComposite]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!originalImage || isResizing) return;
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        setDragImageStart({ x: imageX, y: imageY });
    };

    const handleResizeStart = (e: React.MouseEvent, edge: string) => {
        e.stopPropagation();
        if (!originalImage) return;
        setIsResizing(true);
        setResizeEdge(edge);
        setResizeStart({ 
            width: canvasWidth, 
            height: canvasHeight,
            x: e.clientX,
            y: e.clientY 
        });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (isDragging && containerRef.current && originalImage) {
            const rect = containerRef.current.getBoundingClientRect();
            const dx = (e.clientX - dragStart.x) / rect.width;
            const dy = (e.clientY - dragStart.y) / rect.height;
            const maxX = 1 - (originalImage.width / canvasWidth);
            const maxY = 1 - (originalImage.height / canvasHeight);
            setImageX(Math.max(0, Math.min(dragImageStart.x + dx, maxX)));
            setImageY(Math.max(0, Math.min(dragImageStart.y + dy, maxY)));
        }
        
        if (isResizing && resizeEdge && originalImage) {
            const ratioObj = ASPECT_RATIOS.find(r => r.id === selectedRatio);
            const targetRatio = ratioObj ? ratioObj.ratio : (canvasWidth / canvasHeight);
            
            const dx = e.clientX - resizeStart.x;
            const dy = e.clientY - resizeStart.y;
            
            let newWidth = resizeStart.width;
            let newHeight = resizeStart.height;
            
            const scaleFactor = 2;
            
            if (resizeEdge.includes('right')) {
                newWidth = Math.max(originalImage.width * 1.1, resizeStart.width + dx * scaleFactor);
                newHeight = newWidth / targetRatio;
            } else if (resizeEdge.includes('left')) {
                newWidth = Math.max(originalImage.width * 1.1, resizeStart.width - dx * scaleFactor);
                newHeight = newWidth / targetRatio;
            } else if (resizeEdge.includes('bottom')) {
                newHeight = Math.max(originalImage.height * 1.1, resizeStart.height + dy * scaleFactor);
                newWidth = newHeight * targetRatio;
            } else if (resizeEdge.includes('top')) {
                newHeight = Math.max(originalImage.height * 1.1, resizeStart.height - dy * scaleFactor);
                newWidth = newHeight * targetRatio;
            }
            
            if (newWidth >= originalImage.width * 1.1 && newHeight >= originalImage.height * 1.1) {
                setCanvasWidth(Math.round(newWidth));
                setCanvasHeight(Math.round(newHeight));
            }
        }
    }, [isDragging, isResizing, resizeEdge, dragStart, dragImageStart, canvasWidth, canvasHeight, originalImage, resizeStart, selectedRatio]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        setIsResizing(false);
        setResizeEdge(null);
    }, []);

    useEffect(() => {
        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

    const clearImage = () => {
        setOriginalImage(null);
        setOriginalDataUrl('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const getDisplayDimensions = () => {
        if (!containerSize.width || !originalImage) return { width: 0, height: 0 };
        const maxWidth = containerSize.width;
        const aspectRatio = canvasWidth / canvasHeight;
        let displayWidth = maxWidth;
        let displayHeight = maxWidth / aspectRatio;
        
        if (displayHeight > 400) {
            displayHeight = 400;
            displayWidth = displayHeight * aspectRatio;
        }
        
        return { width: displayWidth, height: displayHeight };
    };

    const displayDims = getDisplayDimensions();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} ref={wrapperRef}>
            {!originalImage ? (
                <div
                    style={{
                        padding: '40px 24px',
                        border: '2px dashed var(--border)',
                        borderRadius: 12,
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: 'var(--bg-tertiary)',
                        transition: 'all 0.2s ease',
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.style.borderColor = 'var(--accent)';
                    }}
                    onDragLeave={(e) => {
                        e.preventDefault();
                        e.currentTarget.style.borderColor = 'var(--border)';
                    }}
                    onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.style.borderColor = 'var(--border)';
                        const file = e.dataTransfer.files[0];
                        if (file && fileInputRef.current) {
                            const dt = new DataTransfer();
                            dt.items.add(file);
                            fileInputRef.current.files = dt.files;
                            fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }}
                >
                    <div style={{
                        width: 56,
                        height: 56,
                        margin: '0 auto 16px',
                        borderRadius: '50%',
                        background: 'var(--bg-hover)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 28,
                    }}>
                        🖼️
                    </div>
                    <p style={{
                        fontSize: 15,
                        color: 'var(--text-primary)',
                        marginBottom: 8,
                        fontWeight: 500,
                    }}>
                        上传图片进行扩图
                    </p>
                    <p style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                    }}>
                        支持拖拽上传，最大 10MB
                    </p>
                </div>
            ) : (
                <>
                    <div>
                        <p style={{
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                            marginBottom: 8,
                            fontWeight: 500,
                        }}>画布比例</p>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: 8,
                        }}>
                            {ASPECT_RATIOS.map(r => (
                                <button
                                    key={r.id}
                                    onClick={() => handleRatioChange(r.id)}
                                    style={{
                                        padding: '10px 8px',
                                        background: selectedRatio === r.id 
                                            ? 'var(--accent)' 
                                            : 'var(--bg-tertiary)',
                                        border: 'none',
                                        borderRadius: 8,
                                        color: selectedRatio === r.id ? '#000' : 'var(--text-secondary)',
                                        fontSize: 13,
                                        fontWeight: selectedRatio === r.id ? 600 : 500,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    {r.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div
                        ref={containerRef}
                        style={{
                            width: displayDims.width || '100%',
                            height: displayDims.height || 300,
                            maxHeight: 400,
                            background: '#1a1a1a',
                            borderRadius: 12,
                            position: 'relative',
                            overflow: 'visible',
                            border: '2px solid var(--border)',
                            margin: '0 auto',
                        }}
                    >
                        {/* Top expansion arrow */}
                        <div style={{
                            position: 'absolute',
                            top: -36,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 4,
                            zIndex: 20,
                        }}>
                            <button
                                onClick={() => extendCanvas('top')}
                                style={{
                                    width: 32,
                                    height: 32,
                                    background: 'var(--accent)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    fontSize: 14,
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                    transition: 'transform 0.2s ease',
                                }}
                                title="向上扩展"
                            >
                                ↑
                            </button>
                        </div>

                        {/* Bottom expansion arrow */}
                        <div style={{
                            position: 'absolute',
                            bottom: -36,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 4,
                            zIndex: 20,
                        }}>
                            <button
                                onClick={() => extendCanvas('bottom')}
                                style={{
                                    width: 32,
                                    height: 32,
                                    background: 'var(--accent)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    fontSize: 14,
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                    transition: 'transform 0.2s ease',
                                }}
                                title="向下扩展"
                            >
                                ↓
                            </button>
                        </div>

                        {/* Left expansion arrow */}
                        <div style={{
                            position: 'absolute',
                            left: -36,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            zIndex: 20,
                        }}>
                            <button
                                onClick={() => extendCanvas('left')}
                                style={{
                                    width: 32,
                                    height: 32,
                                    background: 'var(--accent)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    fontSize: 14,
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                    transition: 'transform 0.2s ease',
                                }}
                                title="向左扩展"
                            >
                                ←
                            </button>
                        </div>

                        {/* Right expansion arrow */}
                        <div style={{
                            position: 'absolute',
                            right: -36,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            zIndex: 20,
                        }}>
                            <button
                                onClick={() => extendCanvas('right')}
                                style={{
                                    width: 32,
                                    height: 32,
                                    background: 'var(--accent)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    fontSize: 14,
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                    transition: 'transform 0.2s ease',
                                }}
                                title="向右扩展"
                            >
                                →
                            </button>
                        </div>

                        <div
                            onMouseDown={handleMouseDown}
                            style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                width: '100%',
                                height: '100%',
                                cursor: isDragging ? 'grabbing' : 'grab',
                            }}
                        >
                            <div style={{
                                position: 'absolute',
                                left: `${imageX * 100}%`,
                                top: `${imageY * 100}%`,
                                width: `${(originalImage.width / canvasWidth) * 100}%`,
                                height: `${(originalImage.height / canvasHeight) * 100}%`,
                                boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 0 0 2px var(--accent)',
                                zIndex: 2,
                                borderRadius: 4,
                                overflow: 'hidden',
                                pointerEvents: 'none',
                            }}>
                                <img
                                    src={originalDataUrl}
                                    style={{ width: '100%', height: '100%', display: 'block', objectFit: 'fill' }}
                                    alt="Original"
                                    draggable={false}
                                />
                            </div>

                            {showGrid && (
                                <div style={{
                                    position: 'absolute',
                                    inset: 0,
                                    backgroundImage: `
                                        linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
                                        linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
                                    `,
                                    backgroundSize: '25% 25%',
                                    pointerEvents: 'none',
                                }} />
                            )}
                        </div>

                        {/* Resize handles */}
                        <div 
                            onMouseDown={(e) => handleResizeStart(e, 'top')}
                            style={{
                                position: 'absolute',
                                top: -6,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                width: 40,
                                height: 12,
                                background: 'var(--accent)',
                                borderRadius: 6,
                                cursor: 'ns-resize',
                                zIndex: 10,
                                opacity: isResizing && resizeEdge === 'top' ? 1 : 0.7,
                            }}
                            title="向上扩展"
                        />
                        <div 
                            onMouseDown={(e) => handleResizeStart(e, 'bottom')}
                            style={{
                                position: 'absolute',
                                bottom: -6,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                width: 40,
                                height: 12,
                                background: 'var(--accent)',
                                borderRadius: 6,
                                cursor: 'ns-resize',
                                zIndex: 10,
                                opacity: isResizing && resizeEdge === 'bottom' ? 1 : 0.7,
                            }}
                            title="向下扩展"
                        />
                        <div 
                            onMouseDown={(e) => handleResizeStart(e, 'left')}
                            style={{
                                position: 'absolute',
                                left: -6,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                width: 12,
                                height: 40,
                                background: 'var(--accent)',
                                borderRadius: 6,
                                cursor: 'ew-resize',
                                zIndex: 10,
                                opacity: isResizing && resizeEdge === 'left' ? 1 : 0.7,
                            }}
                            title="向左扩展"
                        />
                        <div 
                            onMouseDown={(e) => handleResizeStart(e, 'right')}
                            style={{
                                position: 'absolute',
                                right: -6,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                width: 12,
                                height: 40,
                                background: 'var(--accent)',
                                borderRadius: 6,
                                cursor: 'ew-resize',
                                zIndex: 10,
                                opacity: isResizing && resizeEdge === 'right' ? 1 : 0.7,
                            }}
                            title="向右扩展"
                        />

                        {/* Corner handles */}
                        <div 
                            onMouseDown={(e) => handleResizeStart(e, 'top-left')}
                            style={{
                                position: 'absolute',
                                top: -8,
                                left: -8,
                                width: 16,
                                height: 16,
                                background: 'var(--accent)',
                                borderRadius: '50%',
                                cursor: 'nw-resize',
                                zIndex: 11,
                                opacity: isResizing && resizeEdge === 'top-left' ? 1 : 0.7,
                            }}
                        />
                        <div 
                            onMouseDown={(e) => handleResizeStart(e, 'top-right')}
                            style={{
                                position: 'absolute',
                                top: -8,
                                right: -8,
                                width: 16,
                                height: 16,
                                background: 'var(--accent)',
                                borderRadius: '50%',
                                cursor: 'ne-resize',
                                zIndex: 11,
                                opacity: isResizing && resizeEdge === 'top-right' ? 1 : 0.7,
                            }}
                        />
                        <div 
                            onMouseDown={(e) => handleResizeStart(e, 'bottom-left')}
                            style={{
                                position: 'absolute',
                                bottom: -8,
                                left: -8,
                                width: 16,
                                height: 16,
                                background: 'var(--accent)',
                                borderRadius: '50%',
                                cursor: 'sw-resize',
                                zIndex: 11,
                                opacity: isResizing && resizeEdge === 'bottom-left' ? 1 : 0.7,
                            }}
                        />
                        <div 
                            onMouseDown={(e) => handleResizeStart(e, 'bottom-right')}
                            style={{
                                position: 'absolute',
                                bottom: -8,
                                right: -8,
                                width: 16,
                                height: 16,
                                background: 'var(--accent)',
                                borderRadius: '50%',
                                cursor: 'se-resize',
                                zIndex: 11,
                                opacity: isResizing && resizeEdge === 'bottom-right' ? 1 : 0.7,
                            }}
                        />
                    </div>

                    {/* Expansion slider control */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 8,
                    }}>
                        <label style={{
                            fontSize: 13,
                            color: 'var(--text-secondary)',
                            whiteSpace: 'nowrap',
                        }}>
                            扩图像素
                        </label>
                        <input
                            type="range"
                            min="64"
                            max="512"
                            step="32"
                            value={expansionPixels}
                            onChange={(e) => handleExpansionChange(Number(e.target.value))}
                            style={{
                                flex: 1,
                                height: 6,
                                borderRadius: 3,
                                appearance: 'none',
                                background: 'var(--bg-hover)',
                                cursor: 'pointer',
                            }}
                        />
                        <span style={{
                            fontSize: 13,
                            color: 'var(--text-primary)',
                            fontWeight: 500,
                            minWidth: 48,
                            textAlign: 'right',
                        }}>
                            {expansionPixels}px
                        </span>
                    </div>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: 13,
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                            }}>
                                <input
                                    type="checkbox"
                                    checked={showGrid}
                                    onChange={(e) => setShowGrid(e.target.checked)}
                                    style={{ cursor: 'pointer' }}
                                />
                                显示网格
                            </label>
                            <span style={{
                                fontSize: 11,
                                color: 'var(--text-muted)',
                            }}>
                                {canvasWidth} x {canvasHeight} px
                            </span>
                        </div>
                        <button
                            onClick={clearImage}
                            style={{
                                padding: '8px 16px',
                                background: 'transparent',
                                border: '1px solid var(--border)',
                                borderRadius: 6,
                                color: 'var(--text-secondary)',
                                fontSize: 12,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = '#ef4444';
                                e.currentTarget.style.color = '#ef4444';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border)';
                                e.currentTarget.style.color = 'var(--text-secondary)';
                            }}
                        >
                            ✕ 清除图片
                        </button>
                    </div>
                </>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileUpload} />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
    );
}
