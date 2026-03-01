'use client';

import { useState, useRef } from 'react';

interface UploadedImage {
    data: string;
    mimeType: string;
}

interface ImageToImageUploaderProps {
    onImagesReady: (images: UploadedImage[]) => void;
    currentImages?: UploadedImage[];
    maxImages?: number;
}

export default function ImageToImageUploader({ onImagesReady, currentImages = [], maxImages = 3 }: ImageToImageUploaderProps) {
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const items = currentImages.slice(0, maxImages).map((img, i) => ({ ...img, id: String(i) }));
    const atLimit = currentImages.length >= maxImages;

    const processFiles = (files: FileList | File[]) => {
        const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (arr.length === 0) return;

        const remaining = maxImages - currentImages.length;
        if (remaining <= 0) {
            alert(`当前模型最多支持 ${maxImages} 张图片`);
            return;
        }

        const toProcess = arr.slice(0, remaining);
        if (arr.length > remaining) {
            alert(`已达到限制，只添加前 ${remaining} 张`);
        }

        const readers: Promise<UploadedImage>[] = toProcess.map(file => new Promise((resolve, reject) => {
            if (file.size > 10 * 1024 * 1024) {
                reject(new Error(`${file.name} 超过 10MB 限制`));
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve({
                    data: e.target?.result as string,
                    mimeType: file.type,
                });
            };
            reader.onerror = () => reject(new Error('读取失败'));
            reader.readAsDataURL(file);
        }));

        Promise.allSettled(readers).then(results => {
            const newImages: UploadedImage[] = [];
            results.forEach(r => {
                if (r.status === 'fulfilled') newImages.push(r.value);
                else alert(r.reason?.message || '上传失败');
            });
            if (newImages.length === 0) return;
            onImagesReady([...currentImages, ...newImages].slice(0, maxImages));
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            processFiles(e.target.files);
            e.target.value = '';
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const removeImage = (index: number) => {
        onImagesReady(currentImages.filter((_, i) => i !== index));
    };

    const clearAll = () => {
        onImagesReady([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="flex flex-col gap-3">

            {/* Upload zone */}
            <div
                onClick={() => { if (!atLimit) fileInputRef.current?.click(); }}
                onDrop={atLimit ? undefined : handleDrop}
                onDragOver={atLimit ? undefined : handleDragOver}
                onDragLeave={atLimit ? undefined : handleDragLeave}
                className={`py-5 px-4 rounded-xl text-center transition-all duration-200 border-2 border-dashed ${atLimit
                        ? 'opacity-50 cursor-not-allowed border-gray-200 bg-gray-50'
                        : isDragging
                            ? 'border-indigo-400 bg-indigo-50 cursor-pointer'
                            : 'border-gray-200 bg-[#FAFAFA] hover:border-indigo-300 hover:bg-gray-50 cursor-pointer'
                    }`}
            >
                <div className="w-10 h-10 mx-auto flex items-center justify-center bg-white rounded-full text-xl shadow-sm border border-gray-100 mb-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                </div>
                <p className="text-[13px] text-gray-700 font-medium mb-1">
                    {atLimit ? `已达上限 (${maxImages} 张)` : items.length > 0 ? '继续添加 / Add more' : '点击或拖拽上传 / Upload image'}
                </p>
                <p className="text-[11px] text-gray-400">
                    Max {maxImages} images, JPG/PNG/WEBP, up to 10MB each
                </p>
            </div>

            {/* Image grid */}
            {items.length > 0 && (
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-gray-500 font-medium">
                            {items.length} image{items.length > 1 ? 's' : ''} selected
                        </span>
                        <button
                            type="button"
                            onClick={clearAll}
                            className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
                        >
                            Clear all
                        </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {items.map((item, idx) => (
                            <div
                                key={item.id}
                                className="relative rounded-lg overflow-hidden border border-gray-200 aspect-square bg-gray-50"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={item.data}
                                    alt="Reference"
                                    className="w-full h-full object-cover block"
                                />
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeImage(idx);
                                    }}
                                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white text-[10px] leading-none transition-colors"
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
