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

export default function OutpaintEditor({ onCompositeReady, aspectRatio, onAspectRatioChange }: OutpaintEditorProps) {
    const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
    const [originalDataUrl, setOriginalDataUrl] = useState<string>('');
    const [canvasWidth, setCanvasWidth] = useState(1024);
    const [canvasHeight, setCanvasHeight] = useState(1024);
    const [imageX, setImageX] = useState(0);
    const [imageY, setImageY] = useState(0);
    const [imageScale, setImageScale] = useState(1);

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

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = canvasWidth;
        maskCanvas.height = canvasHeight;
        const maskCtx = maskCanvas.getContext('2d');
        if (maskCtx) {
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

    useEffect(() => {
        if (originalImage) {
            generateComposite();
        }
    }, [imageX, imageY, imageScale, canvasWidth, canvasHeight, generateComposite, originalImage]);

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

    // UI Icons
    const Icons = {
        AlignLeft: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h10M4 18h16" /></svg>,
        AlignCenter: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6h12M4 12h16M6 18h12" /></svg>,
        AlignRight: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M10 12h10M4 18h16" /></svg>,
        AlignTop: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: 'rotate(90deg)' }}><path d="M4 6h16M10 12h10M4 18h16" /></svg>,
        AlignMiddle: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: 'rotate(90deg)' }}><path d="M6 6h12M4 12h16M6 18h12" /></svg>,
        AlignBottom: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: 'rotate(90deg)' }}><path d="M4 6h16M4 12h10M4 18h16" /></svg>,
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 16 }}>
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
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ transform: isMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.5 }}>
                            <path d="M6 9l6 6 6-6" />
                        </svg>
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
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            cursor: 'pointer',
                        }}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <div style={{ fontSize: 40, marginBottom: 16 }}>🖼️</div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>上传或拖拽图片到此处</p>
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
                            style={{
                                position: 'absolute',
                                left: `${imageX * 100}%`,
                                top: `${imageY * 100}%`,
                                width: `${(originalImage.width * imageScale / canvasWidth) * 100}%`,
                                height: `${(originalImage.height * imageScale / canvasHeight) * 100}%`,
                                cursor: isDragging ? 'grabbing' : 'grab',
                                pointerEvents: 'auto',
                                zIndex: 11
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
            {originalImage && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div className="alignment-toolbar">
                        <button className="toolbar-icon-btn" title="左对齐" onClick={() => alignImage('left', 'middle')}><Icons.AlignLeft /></button>
                        <button className="toolbar-icon-btn" title="水平居中" onClick={() => alignImage('center', 'middle')}><Icons.AlignCenter /></button>
                        <button className="toolbar-icon-btn" title="右对齐" onClick={() => alignImage('right', 'middle')}><Icons.AlignRight /></button>
                        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
                        <button className="toolbar-icon-btn" title="顶对齐" onClick={() => alignImage('center', 'top')}><Icons.AlignTop /></button>
                        <button className="toolbar-icon-btn" title="垂直居中" onClick={() => alignImage('center', 'middle')}><Icons.AlignMiddle /></button>
                        <button className="toolbar-icon-btn" title="底对齐" onClick={() => alignImage('center', 'bottom')}><Icons.AlignBottom /></button>
                    </div>

                    <button
                        onClick={() => {
                            setOriginalImage(null);
                            setOriginalDataUrl('');
                            if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        style={{
                            padding: '6px 12px',
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            color: 'var(--text-secondary)',
                            fontSize: 12,
                            cursor: 'pointer',
                        }}
                    >
                        清除图片
                    </button>
                </div>
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
