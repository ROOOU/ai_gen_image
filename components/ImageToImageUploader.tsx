'use client';

import { useState, useRef, useCallback } from 'react';

interface ImageItem {
    data: string;
    mimeType: string;
    id: string;
}

interface ImageToImageUploaderProps {
    onImagesReady: (images: Array<{ data: string; mimeType: string }>) => void;
    currentImages?: Array<{ data: string; mimeType: string }>;
}

export default function ImageToImageUploader({ onImagesReady, currentImages = [] }: ImageToImageUploaderProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [items, setItems] = useState<ImageItem[]>(() =>
        currentImages.map((img, i) => ({ ...img, id: String(i) }))
    );
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processFiles = useCallback((files: FileList | File[]) => {
        const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (arr.length === 0) return;

        const readers: Promise<ImageItem>[] = arr.map(file => new Promise((resolve, reject) => {
            if (file.size > 10 * 1024 * 1024) {
                reject(new Error(`${file.name} 超过 10MB 限制`));
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve({
                    data: e.target?.result as string,
                    mimeType: file.type,
                    id: `${Date.now()}-${Math.random()}`,
                });
            };
            reader.onerror = () => reject(new Error('读取失败'));
            reader.readAsDataURL(file);
        }));

        Promise.allSettled(readers).then(results => {
            const newItems: ImageItem[] = [];
            results.forEach(r => {
                if (r.status === 'fulfilled') newItems.push(r.value);
                else alert(r.reason?.message || '上传失败');
            });
            if (newItems.length === 0) return;
            setItems(prev => {
                const updated = [...prev, ...newItems];
                onImagesReady(updated.map(i => ({ data: i.data, mimeType: i.mimeType })));
                return updated;
            });
        });
    }, [onImagesReady]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            processFiles(e.target.files);
            e.target.value = '';
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
    }, [processFiles]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const removeImage = (id: string) => {
        setItems(prev => {
            const updated = prev.filter(i => i.id !== id);
            onImagesReady(updated.map(i => ({ data: i.data, mimeType: i.mimeType })));
            return updated;
        });
    };

    const clearAll = () => {
        setItems([]);
        onImagesReady([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Upload zone */}
            <div
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                style={{
                    padding: '20px 16px',
                    border: `2px dashed ${isDragging ? 'var(--pro-accent)' : 'var(--pro-border)'}`,
                    borderRadius: 12,
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: isDragging ? 'rgba(51, 197, 255, 0.08)' : 'var(--pro-bg-secondary)',
                    transition: 'all 0.2s ease',
                }}
            >
                <div style={{
                    width: 40,
                    height: 40,
                    margin: '0 auto 8px',
                    borderRadius: '50%',
                    background: 'var(--pro-bg-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                }}>
                    📤
                </div>
                <p style={{ fontSize: 13, color: 'var(--pro-text-main)', marginBottom: 2, fontWeight: 500 }}>
                    {items.length > 0 ? '继续添加图片' : '点击或拖拽上传图片'}
                </p>
                <p style={{ fontSize: 11, color: 'var(--pro-text-dim)' }}>
                    支持多选，JPG / PNG / WEBP，每张最大 10MB
                </p>
            </div>

            {/* Image grid */}
            {items.length > 0 && (
                <div>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                    }}>
                        <span style={{ fontSize: 12, color: 'var(--pro-text-dim)' }}>
                            {items.length} 张图片已选
                        </span>
                        <button
                            onClick={clearAll}
                            style={{
                                fontSize: 11,
                                color: 'var(--pro-text-dim)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '2px 6px',
                            }}
                        >
                            全部清除
                        </button>
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 8,
                    }}>
                        {items.map(item => (
                            <div
                                key={item.id}
                                style={{
                                    position: 'relative',
                                    borderRadius: 8,
                                    overflow: 'hidden',
                                    border: '1px solid var(--pro-border)',
                                    aspectRatio: '1',
                                    background: 'var(--pro-bg-secondary)',
                                }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={item.data}
                                    alt="Reference"
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        display: 'block',
                                    }}
                                />
                                <button
                                    onClick={() => removeImage(item.id)}
                                    style={{
                                        position: 'absolute',
                                        top: 4,
                                        right: 4,
                                        width: 22,
                                        height: 22,
                                        borderRadius: '50%',
                                        background: 'rgba(0,0,0,0.7)',
                                        border: 'none',
                                        color: '#fff',
                                        fontSize: 12,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        lineHeight: 1,
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={handleFileChange}
            />
        </div>
    );
}
