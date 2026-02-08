'use client';

import { useState, useRef, useCallback } from 'react';

interface ImageToImageUploaderProps {
    onImageReady: (imageData: { data: string; mimeType: string }) => void;
    currentImage?: string | null;
}

export default function ImageToImageUploader({ onImageReady, currentImage }: ImageToImageUploaderProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(currentImage || null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processFile = useCallback((file: File) => {
        if (!file.type.startsWith('image/')) {
            alert('请上传图片文件');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            alert('图片大小不能超过 10MB');
            return;
        }

        setUploadProgress(30);

        const reader = new FileReader();
        
        reader.onprogress = (e) => {
            if (e.lengthComputable) {
                setUploadProgress(30 + (e.loaded / e.total) * 50);
            }
        };

        reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            setUploadProgress(90);
            
            setTimeout(() => {
                setPreviewUrl(dataUrl);
                setUploadProgress(100);
                onImageReady({
                    data: dataUrl,
                    mimeType: file.type,
                });
                setTimeout(() => setUploadProgress(0), 500);
            }, 100);
        };

        reader.onerror = () => {
            alert('读取图片失败');
            setUploadProgress(0);
        };

        reader.readAsDataURL(file);
    }, [onImageReady]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            processFile(file);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        
        const file = e.dataTransfer.files[0];
        if (file) {
            processFile(file);
        }
    }, [processFile]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const clearImage = () => {
        setPreviewUrl(null);
        onImageReady({ data: '', mimeType: '' });
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!previewUrl ? (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    style={{
                        padding: '32px 24px',
                        border: `2px dashed ${isDragging ? 'var(--pro-accent)' : 'var(--pro-border)'}`,
                        borderRadius: 12,
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: isDragging 
                            ? 'rgba(51, 197, 255, 0.1)' 
                            : 'var(--pro-bg-secondary)',
                        transition: 'all 0.2s ease',
                    }}
                >
                    <div style={{ 
                        width: 48, 
                        height: 48, 
                        margin: '0 auto 12px',
                        borderRadius: '50%',
                        background: 'var(--pro-bg-tertiary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 24,
                    }}>
                        📤
                    </div>
                    <p style={{ 
                        fontSize: 14, 
                        color: 'var(--pro-text-main)',
                        marginBottom: 4,
                        fontWeight: 500,
                    }}>
                        点击或拖拽上传图片
                    </p>
                    <p style={{ 
                        fontSize: 12, 
                        color: 'var(--pro-text-dim)',
                    }}>
                        支持 JPG, PNG, WEBP 格式，最大 10MB
                    </p>

                    {uploadProgress > 0 && (
                        <div style={{ marginTop: 16 }}>
                            <div style={{
                                width: '100%',
                                height: 4,
                                background: 'var(--pro-bg-tertiary)',
                                borderRadius: 2,
                                overflow: 'hidden',
                            }}>
                                <div style={{
                                    width: `${uploadProgress}%`,
                                    height: '100%',
                                    background: 'var(--pro-accent)',
                                    borderRadius: 2,
                                    transition: 'width 0.3s ease',
                                }} />
                            </div>
                            <p style={{
                                fontSize: 11,
                                color: 'var(--pro-text-dim)',
                                marginTop: 8,
                            }}>
                                处理中... {uploadProgress}%
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <div style={{
                    position: 'relative',
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: '1px solid var(--pro-border)',
                    background: 'var(--pro-bg-secondary)',
                }}>
                    <img 
                        src={previewUrl} 
                        alt="Reference" 
                        style={{
                            width: '100%',
                            height: 'auto',
                            maxHeight: 300,
                            objectFit: 'contain',
                            display: 'block',
                        }}
                    />
                    <div style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        display: 'flex',
                        gap: 8,
                    }}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                fileInputRef.current?.click();
                            }}
                            style={{
                                padding: '8px 12px',
                                background: 'rgba(0,0,0,0.7)',
                                border: 'none',
                                borderRadius: 6,
                                color: '#fff',
                                fontSize: 12,
                                cursor: 'pointer',
                                backdropFilter: 'blur(4px)',
                            }}
                        >
                            🔄 更换
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                clearImage();
                            }}
                            style={{
                                padding: '8px 12px',
                                background: 'rgba(220, 38, 38, 0.8)',
                                border: 'none',
                                borderRadius: 6,
                                color: '#fff',
                                fontSize: 12,
                                cursor: 'pointer',
                                backdropFilter: 'blur(4px)',
                            }}
                        >
                            ✕ 清除
                        </button>
                    </div>
                    <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        padding: '12px 16px',
                        background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                    }}>
                        <p style={{
                            fontSize: 12,
                            color: '#fff',
                            margin: 0,
                        }}>
                            参考图片已就绪
                        </p>
                    </div>
                </div>
            )}
            <input 
                ref={fileInputRef} 
                type="file" 
                accept="image/*" 
                hidden 
                onChange={handleFileChange} 
            />
        </div>
    );
}
