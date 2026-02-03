'use client';

import { useState, useEffect } from 'react';

interface HistoryItem {
    id: string;
    timestamp: number;
    prompt: string;
    mode: 'text2img' | 'img2img' | 'outpaint';
    model: string;
    imageUrl: string;
    thumbnailUrl?: string;
    aspectRatio?: string;
}

interface HistoryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectItem: (item: HistoryItem) => void;
    apiKey: string;
}

export default function HistoryPanel({ isOpen, onClose, onSelectItem, apiKey }: HistoryPanelProps) {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [previewItem, setPreviewItem] = useState<HistoryItem | null>(null);
    const [imageLoadErrors, setImageLoadErrors] = useState<Set<string>>(new Set());

    // 加载历史记录
    const loadHistory = async () => {
        if (!apiKey) {
            setError('请先设置 API Key 以查看历史记录');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/history', {
                headers: {
                    'x-api-key': apiKey,
                },
            });
            const data = await response.json();
            if (data.success) {
                setHistory(data.history);
            } else {
                setError(data.error || '加载失败');
            }
        } catch (err: any) {
            setError(err.message || '加载失败');
        } finally {
            setLoading(false);
        }
    };

    // 删除记录
    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (deletingId || !apiKey) return;

        setDeletingId(id);
        try {
            const response = await fetch(`/api/history?id=${id}`, {
                method: 'DELETE',
                headers: {
                    'x-api-key': apiKey,
                },
            });
            const data = await response.json();
            if (data.success) {
                setHistory(prev => prev.filter(item => item.id !== id));
                if (previewItem?.id === id) {
                    setPreviewItem(null);
                }
            } else {
                alert(data.error || '删除失败');
            }
        } catch (err: any) {
            alert(err.message || '删除失败');
        } finally {
            setDeletingId(null);
        }
    };

    // 处理图片加载错误（回退到原图）
    const handleImageError = (itemId: string) => {
        setImageLoadErrors(prev => new Set(prev).add(itemId));
    };

    // 获取显示用的图片 URL
    const getDisplayImageUrl = (item: HistoryItem) => {
        // 如果缩略图加载失败或没有缩略图，使用原图
        if (imageLoadErrors.has(item.id) || !item.thumbnailUrl) {
            return item.imageUrl;
        }
        return item.thumbnailUrl;
    };

    // 下载图片
    const handleDownload = async () => {
        if (!previewItem) return;

        try {
            const response = await fetch(previewItem.imageUrl);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${previewItem.prompt.slice(0, 30) || 'image'}_${previewItem.id}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('下载失败:', err);
            // 回退到直接打开
            window.open(previewItem.imageUrl, '_blank');
        }
    };

    // 使用该图片
    const handleUseImage = () => {
        if (previewItem) {
            onSelectItem(previewItem);
            setPreviewItem(null);
            onClose();
        }
    };

    // 格式化时间
    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return '刚刚';
        if (diffMins < 60) return `${diffMins} 分钟前`;
        if (diffHours < 24) return `${diffHours} 小时前`;
        if (diffDays < 7) return `${diffDays} 天前`;
        return date.toLocaleDateString();
    };

    // 获取模式标签
    const getModeLabel = (mode: string) => {
        switch (mode) {
            case 'text2img': return '文生图';
            case 'img2img': return '图生图';
            case 'outpaint': return '扩图';
            default: return mode;
        }
    };

    // 当面板打开时加载数据
    useEffect(() => {
        if (isOpen) {
            loadHistory();
        }
    }, [isOpen, apiKey]);

    if (!isOpen) return null;

    return (
        <>
            <div className="history-panel-overlay" onClick={onClose}>
                <div className="history-panel" onClick={e => e.stopPropagation()}>
                    <div className="history-panel-header">
                        <h2>📜 历史记录</h2>
                        <button className="history-close-btn" onClick={onClose}>✕</button>
                    </div>

                    <div className="history-panel-content">
                        {loading && (
                            <div className="history-loading">
                                <div className="loading-spinner"></div>
                                <span>加载中...</span>
                            </div>
                        )}

                        {error && (
                            <div className="history-error">
                                <span>❌ {error}</span>
                                <button onClick={loadHistory}>重试</button>
                            </div>
                        )}

                        {!loading && !error && history.length === 0 && (
                            <div className="history-empty">
                                <span>📭</span>
                                <p>暂无历史记录</p>
                            </div>
                        )}

                        {!loading && !error && history.length > 0 && (
                            <div className="history-grid">
                                {history.map(item => (
                                    <div
                                        key={item.id}
                                        className="history-item"
                                        onClick={() => setPreviewItem(item)}
                                    >
                                        <div className="history-item-image">
                                            <img
                                                src={getDisplayImageUrl(item)}
                                                alt={item.prompt}
                                                loading="lazy"
                                                onError={() => handleImageError(item.id)}
                                            />
                                            <div className="history-item-overlay">
                                                <span className="history-mode-badge">{getModeLabel(item.mode)}</span>
                                            </div>
                                            <button
                                                className="history-delete-btn"
                                                onClick={(e) => handleDelete(item.id, e)}
                                                disabled={deletingId === item.id}
                                            >
                                                {deletingId === item.id ? '...' : '🗑️'}
                                            </button>
                                        </div>
                                        <div className="history-item-info">
                                            <p className="history-item-prompt">{item.prompt}</p>
                                            <span className="history-item-time">{formatTime(item.timestamp)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 图片预览弹窗 */}
            {previewItem && (
                <div className="image-preview-overlay" onClick={() => setPreviewItem(null)}>
                    <div className="image-preview-modal" onClick={e => e.stopPropagation()}>
                        <div className="image-preview-header">
                            <span className="image-preview-title">{previewItem.prompt}</span>
                            <button className="image-preview-close" onClick={() => setPreviewItem(null)}>✕</button>
                        </div>
                        <div className="image-preview-content">
                            <img src={previewItem.imageUrl} alt={previewItem.prompt} />
                        </div>
                        <div className="image-preview-footer">
                            <button className="preview-btn preview-btn-use" onClick={handleUseImage}>
                                📥 使用此图
                            </button>
                            <button className="preview-btn preview-btn-download" onClick={handleDownload}>
                                💾 保存图片
                            </button>
                            <button className="preview-btn preview-btn-close" onClick={() => setPreviewItem(null)}>
                                ✕ 关闭
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
