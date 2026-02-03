'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface OutpaintEditorProps {
    onCompositeReady: (data: any) => void;
}

const EXPAND_PRESETS = [
    { id: 'top', name: 'Up', icon: '⬆️' },
    { id: 'bottom', name: 'Down', icon: '⬇️' },
    { id: 'left', name: 'Left', icon: '⬅️' },
    { id: 'right', name: 'Right', icon: '➡️' },
    { id: 'all', name: 'Center', icon: '⊞' },
];

const SCALE_OPTIONS = [
    { id: '1.5x', scale: 1.5, name: '1.5x' },
    { id: '2x', scale: 2, name: '2x' },
    { id: 'custom', scale: 0, name: 'Custom' },
];

export default function OutpaintEditor({ onCompositeReady }: OutpaintEditorProps) {
    const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
    const [originalDataUrl, setOriginalDataUrl] = useState<string>('');
    const [canvasWidth, setCanvasWidth] = useState(1024);
    const [canvasHeight, setCanvasHeight] = useState(1024);
    const [selectedScale, setSelectedScale] = useState('1.5x');
    const [imageX, setImageX] = useState(0.25);
    const [imageY, setImageY] = useState(0.25);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [dragImageStart, setDragImageStart] = useState({ x: 0, y: 0 });

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
                setCanvasWidth(Math.round(img.width * 1.5));
                setCanvasHeight(Math.round(img.height * 1.5));
                setImageX(0.25); setImageY(0.25);
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    };

    const generateComposite = useCallback(() => {
        if (!originalImage || !canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#7F7F7F';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.drawImage(originalImage, imageX * canvasWidth, imageY * canvasHeight, originalImage.width, originalImage.height);

        const compositeData = canvas.toDataURL('image/jpeg', 0.9);

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = canvasWidth; maskCanvas.height = canvasHeight;
        const maskCtx = maskCanvas.getContext('2d');
        if (maskCtx) {
            maskCtx.fillStyle = '#FFFFFF';
            maskCtx.fillRect(0, 0, canvasWidth, canvasHeight);
            maskCtx.fillStyle = '#000000';
            maskCtx.fillRect(imageX * canvasWidth, imageY * canvasHeight, originalImage.width, originalImage.height);
            onCompositeReady({
                compositeImage: compositeData,
                maskImage: maskCanvas.toDataURL('image/png'),
                originalImage: originalDataUrl,
                originalX: imageX, originalY: imageY,
                originalWidth: originalImage.width, originalHeight: originalImage.height,
                width: canvasWidth, height: canvasHeight,
                targetWidth: canvasWidth, targetHeight: canvasHeight, scale: 1
            });
        }
    }, [originalImage, originalDataUrl, canvasWidth, canvasHeight, imageX, imageY, onCompositeReady]);

    useEffect(() => { if (originalImage) generateComposite(); }, [originalImage, imageX, imageY, canvasWidth, canvasHeight, generateComposite]);

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
        setImageX(Math.max(0, Math.min(dragImageStart.x + dx, 1 - (originalImage.width / canvasWidth))));
        setImageY(Math.max(0, Math.min(dragImageStart.y + dy, 1 - (originalImage.height / canvasHeight))));
    }, [isDragging, dragStart, dragImageStart, canvasWidth, canvasHeight, originalImage]);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', () => setIsDragging(false));
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', () => setIsDragging(false));
            };
        }
    }, [isDragging, handleMouseMove]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!originalImage ? (
                <div
                    style={{ padding: '32px', border: '1px dashed var(--border-color)', borderRadius: 12, textAlign: 'center', cursor: 'pointer', background: 'var(--bg-tertiary)' }}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <p style={{ fontSize: 24, marginBottom: 8 }}>🖼️</p>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Upload photo to expand</p>
                </div>
            ) : (
                <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Direction</p>
                            <div className="selection-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                                {EXPAND_PRESETS.map(p => (
                                    <button key={p.id} className="selection-btn" onClick={() => {
                                        if (p.id === 'top') setImageY(1 - originalImage.height / canvasHeight);
                                        if (p.id === 'bottom') setImageY(0);
                                        if (p.id === 'left') setImageX(1 - originalImage.width / canvasWidth);
                                        if (p.id === 'right') setImageX(0);
                                        if (p.id === 'all') { setImageX((1 - originalImage.width / canvasWidth) / 2); setImageY((1 - originalImage.height / canvasHeight) / 2); }
                                    }}>{p.icon}</button>
                                ))}
                            </div>
                        </div>

                        <div
                            ref={containerRef}
                            onMouseDown={handleMouseDown}
                            style={{
                                aspectRatio: `${canvasWidth}/${canvasHeight}`,
                                background: '#111',
                                borderRadius: 8,
                                position: 'relative',
                                overflow: 'hidden',
                                border: '1px solid var(--border-color)',
                                cursor: isDragging ? 'grabbing' : 'grab'
                            }}
                        >
                            <div style={{
                                position: 'absolute',
                                left: `${imageX * 100}%`,
                                top: `${imageY * 100}%`,
                                width: `${(originalImage.width / canvasWidth) * 100}%`,
                                height: `${(originalImage.height / canvasHeight) * 100}%`,
                                boxShadow: '0 0 20px rgba(0,0,0,0.5)',
                                zIndex: 2
                            }}>
                                <img src={originalDataUrl} style={{ width: '100%', height: '100%', display: 'block' }} alt="Orig" draggable={false} />
                            </div>
                            <div style={{ position: 'absolute', inset: 0, opacity: 0.1, background: 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAAXNSR0IArs4c6QAAACpJREFUGFdjZEACDAwMgAIsDAwMMMYMBgYmBqBBjCAMY8xgAApADYIxEAYAbDQDAsMND8IAAAAASUVORK5CYII=")' }}></div>
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>Drag image to position</p>
                    </div>
                </>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileUpload} />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
    );
}
