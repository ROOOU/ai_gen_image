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

const EXPAND_PRESETS = [
    { id: 'center', name: '居中', icon: '◻️', description: '居中扩展' },
    { id: 'top', name: '向上', icon: '⬆️', description: '向上扩展' },
    { id: 'bottom', name: '向下', icon: '⬇️', description: '向下扩展' },
    { id: 'left', name: '向左', icon: '⬅️', description: '向左扩展' },
    { id: 'right', name: '向右', icon: '➡️', description: '向右扩展' },
    { id: 'top-left', name: '左上', icon: '↖️', description: '左上扩展' },
    { id: 'top-right', name: '右上', icon: '↗️', description: '右上扩展' },
    { id: 'bottom-left', name: '左下', icon: '↙️', description: '左下扩展' },
    { id: 'bottom-right', name: '右下', icon: '↘️', description: '右下扩展' },
];

const SCALE_OPTIONS = [
    { id: '1.5x', scale: 1.5, name: '1.5x', description: '扩大 50%' },
    { id: '2x', scale: 2.0, name: '2x', description: '扩大 100%' },
    { id: '2.5x', scale: 2.5, name: '2.5x', description: '扩大 150%' },
    { id: '3x', scale: 3.0, name: '3x', description: '扩大 200%' },
];

export default function OutpaintEditor({ onCompositeReady }: OutpaintEditorProps) {
    const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
    const [originalDataUrl, setOriginalDataUrl] = useState<string>('');
    const [canvasWidth, setCanvasWidth] = useState(1024);
    const [canvasHeight, setCanvasHeight] = useState(1024);
    const [selectedScale, setSelectedScale] = useState('2x');
    const [imageX, setImageX] = useState(0.25);
    const [imageY, setImageY] = useState(0.25);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [dragImageStart, setDragImageStart] = useState({ x: 0, y: 0 });
    const [activePreset, setActivePreset] = useState('center');
    const [showGrid, setShowGrid] = useState(true);

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
                const scale = SCALE_OPTIONS.find(s => s.id === selectedScale)?.scale || 2;
                setCanvasWidth(Math.round(img.width * scale));
                setCanvasHeight(Math.round(img.height * scale));
                applyPreset('center', img, scale);
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    };

    const applyPreset = (presetId: string, img?: HTMLImageElement, scale?: number) => {
        const image = img || originalImage;
        const currentScale = scale || (SCALE_OPTIONS.find(s => s.id === selectedScale)?.scale || 2);
        
        if (!image) return;

        const newWidth = Math.round(image.width * currentScale);
        const newHeight = Math.round(image.height * currentScale);
        const imgRatioX = image.width / newWidth;
        const imgRatioY = image.height / newHeight;

        setActivePreset(presetId);

        switch (presetId) {
            case 'top':
                setImageX((1 - imgRatioX) / 2);
                setImageY(1 - imgRatioY);
                break;
            case 'bottom':
                setImageX((1 - imgRatioX) / 2);
                setImageY(0);
                break;
            case 'left':
                setImageX(1 - imgRatioX);
                setImageY((1 - imgRatioY) / 2);
                break;
            case 'right':
                setImageX(0);
                setImageY((1 - imgRatioY) / 2);
                break;
            case 'top-left':
                setImageX(1 - imgRatioX);
                setImageY(1 - imgRatioY);
                break;
            case 'top-right':
                setImageX(0);
                setImageY(1 - imgRatioY);
                break;
            case 'bottom-left':
                setImageX(1 - imgRatioX);
                setImageY(0);
                break;
            case 'bottom-right':
                setImageX(0);
                setImageY(0);
                break;
            case 'center':
            default:
                setImageX((1 - imgRatioX) / 2);
                setImageY((1 - imgRatioY) / 2);
                break;
        }
    };

    const handleScaleChange = (scaleId: string) => {
        setSelectedScale(scaleId);
        if (!originalImage) return;
        
        const scale = SCALE_OPTIONS.find(s => s.id === scaleId)?.scale || 2;
        const newWidth = Math.round(originalImage.width * scale);
        const newHeight = Math.round(originalImage.height * scale);
        
        const currentCenterX = imageX + (originalImage.width / canvasWidth) / 2;
        const currentCenterY = imageY + (originalImage.height / canvasHeight) / 2;
        
        setCanvasWidth(newWidth);
        setCanvasHeight(newHeight);
        
        const newImgRatioX = originalImage.width / newWidth;
        const newImgRatioY = originalImage.height / newHeight;
        
        setImageX(Math.max(0, Math.min(currentCenterX - newImgRatioX / 2, 1 - newImgRatioX)));
        setImageY(Math.max(0, Math.min(currentCenterY - newImgRatioY / 2, 1 - newImgRatioY)));
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
                scale: SCALE_OPTIONS.find(s => s.id === selectedScale)?.scale || 2,
            });
        }
    }, [originalImage, originalDataUrl, canvasWidth, canvasHeight, imageX, imageY, selectedScale, onCompositeReady]);

    useEffect(() => {
        if (originalImage) {
            generateComposite();
        }
    }, [originalImage, imageX, imageY, canvasWidth, canvasHeight, generateComposite]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!originalImage) return;
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        setDragImageStart({ x: imageX, y: imageY });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging || !containerRef.current || !originalImage) return;
        const rect = containerRef.current.getBoundingClientRect();
        const dx = (e.clientX - dragStart.x) / rect.width;
        const dy = (e.clientY - dragStart.y) / rect.height;
        const maxX = 1 - (originalImage.width / canvasWidth);
        const maxY = 1 - (originalImage.height / canvasHeight);
        setImageX(Math.max(0, Math.min(dragImageStart.x + dx, maxX)));
        setImageY(Math.max(0, Math.min(dragImageStart.y + dy, maxY)));
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

    const clearImage = () => {
        setOriginalImage(null);
        setOriginalDataUrl('');
        setActivePreset('center');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {!originalImage ? (
                <div
                    style={{
                        padding: '40px 24px',
                        border: '2px dashed var(--pro-border)',
                        borderRadius: 12,
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: 'var(--pro-bg-secondary)',
                        transition: 'all 0.2s ease',
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.style.borderColor = 'var(--pro-accent)';
                        e.currentTarget.style.background = 'rgba(51, 197, 255, 0.05)';
                    }}
                    onDragLeave={(e) => {
                        e.preventDefault();
                        e.currentTarget.style.borderColor = 'var(--pro-border)';
                        e.currentTarget.style.background = 'var(--pro-bg-secondary)';
                    }}
                    onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.style.borderColor = 'var(--pro-border)';
                        e.currentTarget.style.background = 'var(--pro-bg-secondary)';
                        const file = e.dataTransfer.files[0];
                        if (file) {
                            const input = fileInputRef.current;
                            if (input) {
                                const dt = new DataTransfer();
                                dt.items.add(file);
                                input.files = dt.files;
                                input.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }
                    }}
                >
                    <div style={{
                        width: 56,
                        height: 56,
                        margin: '0 auto 16px',
                        borderRadius: '50%',
                        background: 'var(--pro-bg-tertiary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 28,
                    }}>
                        🖼️
                    </div>
                    <p style={{
                        fontSize: 15,
                        color: 'var(--pro-text-main)',
                        marginBottom: 8,
                        fontWeight: 500,
                    }}>
                        上传图片进行扩图
                    </p>
                    <p style={{
                        fontSize: 12,
                        color: 'var(--pro-text-dim)',
                    }}>
                        支持拖拽上传，最大 10MB
                    </p>
                </div>
            ) : (
                <>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: 12,
                    }}>
                        <div>
                            <p style={{
                                fontSize: 12,
                                color: 'var(--pro-text-dim)',
                                marginBottom: 8,
                                fontWeight: 500,
                            }}>扩展比例</p>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, 1fr)',
                                gap: 8,
                            }}>
                                {SCALE_OPTIONS.map(s => (
                                    <button
                                        key={s.id}
                                        onClick={() => handleScaleChange(s.id)}
                                        style={{
                                            padding: '10px 8px',
                                            background: selectedScale === s.id 
                                                ? 'var(--pro-accent)' 
                                                : 'var(--pro-bg-tertiary)',
                                            border: 'none',
                                            borderRadius: 8,
                                            color: selectedScale === s.id ? '#000' : 'var(--pro-text-dim)',
                                            fontSize: 13,
                                            fontWeight: selectedScale === s.id ? 600 : 500,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                        }}
                                    >
                                        {s.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <p style={{
                                fontSize: 12,
                                color: 'var(--pro-text-dim)',
                                marginBottom: 8,
                                fontWeight: 500,
                            }}>扩展方向</p>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, 1fr)',
                                gap: 6,
                            }}>
                                {EXPAND_PRESETS.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => applyPreset(p.id)}
                                        title={p.description}
                                        style={{
                                            padding: '8px 4px',
                                            background: activePreset === p.id 
                                                ? 'var(--pro-accent-glow)' 
                                                : 'var(--pro-bg-tertiary)',
                                            border: `1px solid ${activePreset === p.id ? 'var(--pro-accent)' : 'transparent'}`,
                                            borderRadius: 6,
                                            color: activePreset === p.id ? 'var(--pro-accent)' : 'var(--pro-text-dim)',
                                            fontSize: 16,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        {p.icon}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: 'var(--pro-bg-secondary)',
                        borderRadius: 8,
                    }}>
                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: 13,
                            color: 'var(--pro-text-dim)',
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
                            color: 'var(--pro-text-muted)',
                        }}>
                            {canvasWidth} x {canvasHeight} px
                        </span>
                    </div>

                    <div
                        ref={containerRef}
                        onMouseDown={handleMouseDown}
                        style={{
                            aspectRatio: `${canvasWidth}/${canvasHeight}`,
                            maxHeight: 400,
                            background: '#1a1a1a',
                            borderRadius: 12,
                            position: 'relative',
                            overflow: 'hidden',
                            border: '2px solid var(--pro-border)',
                            cursor: isDragging ? 'grabbing' : 'grab',
                        }}
                    >
                        <div style={{
                            position: 'absolute',
                            left: `${imageX * 100}%`,
                            top: `${imageY * 100}%`,
                            width: `${(originalImage.width / canvasWidth) * 100}%`,
                            height: `${(originalImage.height / canvasHeight) * 100}%`,
                            boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 0 0 2px var(--pro-accent)',
                            zIndex: 2,
                            borderRadius: 4,
                            overflow: 'hidden',
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
                                    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                                    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
                                `,
                                backgroundSize: '20% 20%',
                                pointerEvents: 'none',
                            }} />
                        )}

                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            opacity: 0.05,
                            background: 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAAXNSR0IArs4c6QAAACpJREFUGFdjZEACDAwMgAIsDAwMMMYMBgYmBqBBjCAMY8xgAApADYIxEAYAbDQDAsMND8IAAAAASUVORK5CYII=")',
                        }} />
                    </div>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}>
                        <p style={{
                            fontSize: 12,
                            color: 'var(--pro-text-dim)',
                        }}>
                            💡 拖拽图片调整位置，或选择上方预设
                        </p>
                        <button
                            onClick={clearImage}
                            style={{
                                padding: '8px 16px',
                                background: 'transparent',
                                border: '1px solid var(--pro-border)',
                                borderRadius: 6,
                                color: 'var(--pro-text-dim)',
                                fontSize: 12,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = '#ef4444';
                                e.currentTarget.style.color = '#ef4444';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--pro-border)';
                                e.currentTarget.style.color = 'var(--pro-text-dim)';
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
