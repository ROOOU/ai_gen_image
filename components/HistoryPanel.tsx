'use client';

import { useState, useEffect } from 'react';

interface HistoryItem {
    id: string;
    timestamp: number;
    prompt: string;
    mode: 'text2img' | 'img2img' | 'outpaint';
    model: string;
    imageUrl: string;
    aspectRatio?: string;
}

interface HistoryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectItem: (item: HistoryItem) => void;
}

export default function HistoryPanel({ isOpen, onClose, onSelectItem }: HistoryPanelProps) {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // 加载历史记录
    const loadHistory = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/history');
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
        if (deletingId) return;

        setDeletingId(id);
        try {
            const response = await fetch(`/api/history?id=${id}`, {
                method: 'DELETE',
            });
            const data = await response.json();
            if (data.success) {
                setHistory(prev => prev.filter(item => item.id !== id));
            } else {
                alert(data.error || '删除失败');
            }
        } catch (err: any) {
            alert(err.message || '删除失败');
        } finally {
            setDeletingId(null);
        }
    };

    // 格式化时间
    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - timestamp;

        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;

        return date.toLocaleDateString('zh-CN', {
            month: 'short',
            day: 'numeric',
        });
    };

    // 模式标签
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
    }, [isOpen]);

    if (!isOpen) return null;

    return (
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
                                    onClick={() => onSelectItem(item)}
                                >
                                    <div className="history-item-image">
                                        <img src={item.imageUrl} alt={item.prompt} loading="lazy" />
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
    );
}
