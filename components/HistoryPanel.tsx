'use client';

import { useCallback, useState, useEffect } from 'react';

interface HistoryItem {
    id: string;
    timestamp: number;
    prompt: string;
    mode: 'text2img' | 'img2img' | 'outpaint';
    model: string;
    imageUrl: string;
    thumbnailUrl?: string;
    inputImageUrls?: string[];
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
    const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadHistory = useCallback(async () => {
        if (!apiKey) { setError('Set API Key to view history'); return; }
        setLoading(true);
        try {
            const res = await fetch('/api/history', { headers: { 'x-api-key': apiKey } });
            const data = await res.json();
            if (data.success) setHistory(data.history);
            else setError(data.error);
        } catch { setError('Connection error'); }
        finally { setLoading(false); }
    }, [apiKey]);

    useEffect(() => { if (isOpen) loadHistory(); }, [isOpen, loadHistory]);

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('确定要删除这条记录吗？')) return;

        setDeletingId(id);
        try {
            const res = await fetch(`/api/history?id=${id}`, {
                method: 'DELETE',
                headers: { 'x-api-key': apiKey },
            });
            const data = await res.json();
            if (data.success) {
                setHistory(prev => prev.filter(item => item.id !== id));
                if (selectedItem?.id === id) {
                    setSelectedItem(null);
                }
            } else {
                alert(data.error || '删除失败');
            }
        } catch {
            alert('删除失败');
        } finally {
            setDeletingId(null);
        }
    };

    const handleApply = (item: HistoryItem) => {
        onSelectItem(item);
        onClose();
    };

    const getModeLabel = (mode: string) => {
        switch (mode) {
            case 'text2img': return '文生图';
            case 'img2img': return '图生图';
            case 'outpaint': return '扩图';
            default: return mode;
        }
    };

    if (!isOpen) return null;

    return (
        <div className="history-drawer-overlay" onClick={onClose}>
            <div className="history-drawer" onClick={e => e.stopPropagation()}>
                <div className="panel-header">
                    <span className="logo-text">History Archive</span>
                    <button className="selection-btn" style={{ padding: '6px 12px', border: 'none' }} onClick={onClose}>✕</button>
                </div>

                <div className="panel-content" style={{ gap: 16 }}>
                    {loading && (
                        <div style={{ textAlign: 'center', padding: '40px 0' }}>
                            <div className="loading-spinner" style={{ width: 24, height: 24, margin: '0 auto 12px' }}></div>
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Scanning archive...</span>
                        </div>
                    )}

                    {error && <p style={{ color: 'var(--ios-danger)', fontSize: 13 }}>{error}</p>}

                    {!loading && history.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
                            <span style={{ fontSize: 32 }}>📭</span>
                            <p style={{ fontSize: 13, marginTop: 12 }}>No history records found</p>
                        </div>
                    )}

                    <div className="history-list-grid">
                        {history.map(item => (
                            <div key={item.id} className="history-thumb-card" onClick={() => setSelectedItem(item)}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={item.thumbnailUrl || item.imageUrl}
                                    alt={item.prompt}
                                    loading="lazy"
                                    onError={(e) => {
                                        const target = e.currentTarget;
                                        // If thumbnail failed, try full image; if that also fails, hide
                                        if (item.thumbnailUrl && target.src !== item.imageUrl) {
                                            target.src = item.imageUrl;
                                        }
                                    }}
                                />
                                <div className="history-thumb-overlay">
                                    <p className="history-thumb-prompt">{item.prompt}</p>
                                </div>
                                <button
                                    className="history-delete-btn"
                                    onClick={(e) => handleDelete(e, item.id)}
                                    disabled={deletingId === item.id}
                                    title="删除"
                                >
                                    {deletingId === item.id ? '...' : '🗑️'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Image Preview Modal */}
                {selectedItem && (
                    <div className="history-modal-overlay" onClick={() => setSelectedItem(null)}>
                        <div className="history-modal" onClick={e => e.stopPropagation()}>
                            <button className="modal-close" onClick={() => setSelectedItem(null)}>✕</button>

                            <div className="modal-image-container">
                                <div className="preview-image-tight-container">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img className="main-result-image" src={selectedItem.imageUrl} alt={selectedItem.prompt} />
                                    {selectedItem.inputImageUrls && selectedItem.inputImageUrls.length > 0 && (
                                        <div style={{ marginTop: 12 }}>
                                            <span style={{ fontSize: 12, color: 'var(--pro-text-dim)', marginBottom: 6, display: 'block' }}>参考图 ({selectedItem.inputImageUrls.length})</span>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                {selectedItem.inputImageUrls.map((url, i) => (
                                                    /* eslint-disable-next-line @next/next/no-img-element */
                                                    <img key={i} src={url} alt={`参考图 ${i + 1}`} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--pro-border)' }} />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="modal-info">
                                <div className="modal-meta">
                                    <span className="modal-mode">{getModeLabel(selectedItem.mode)}</span>
                                    <span className="modal-time">
                                        {new Date(selectedItem.timestamp).toLocaleString('zh-CN')}
                                    </span>
                                </div>

                                <div className="modal-prompt-section">
                                    <label>提示词</label>
                                    <p className="modal-prompt">{selectedItem.prompt}</p>
                                </div>

                                <div className="modal-actions">
                                    <button className="modal-btn primary" onClick={() => handleApply(selectedItem)}>
                                        应用此图片
                                    </button>
                                    <button className="modal-btn secondary" onClick={() => setSelectedItem(null)}>
                                        关闭
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <style jsx>{`
                .history-drawer-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0,0,0,0.6);
                    backdrop-filter: blur(4px);
                    z-index: 2000;
                    display: flex;
                    justify-content: flex-end;
                }
                .history-drawer {
                    width: 400px;
                    height: 100%;
                    background: var(--bg-secondary);
                    border-left: 1px solid var(--border-color);
                    display: flex;
                    flex-direction: column;
                    box-shadow: var(--shadow-lg);
                    animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                @keyframes slideIn {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                @media (max-width: 768px) {
                    .history-drawer { width: 100%; }
                }
                .history-list-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 12px;
                }
                .history-thumb-card {
                    position: relative;
                    aspect-ratio: 1;
                    border-radius: var(--radius-md);
                    overflow: hidden;
                    cursor: pointer;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    transition: var(--transition);
                }
                .history-thumb-card:hover {
                    border-color: var(--accent-primary);
                    transform: scale(1.02);
                }
                .history-thumb-card img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .history-thumb-overlay {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);
                    display: flex;
                    align-items: flex-end;
                    padding: 8px;
                    opacity: 0;
                    transition: opacity 0.2s;
                }
                .history-thumb-card:hover .history-thumb-overlay { opacity: 1; }
                .history-thumb-prompt {
                    font-size: 11px;
                    color: white;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
                .history-delete-btn {
                    position: absolute;
                    top: 6px;
                    right: 6px;
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    background: rgba(0,0,0,0.6);
                    border: none;
                    cursor: pointer;
                    opacity: 0;
                    transition: opacity 0.2s, background 0.2s;
                    font-size: 12px;
                    z-index: 5;
                }
                .history-thumb-card:hover .history-delete-btn {
                    opacity: 1;
                }
                .history-delete-btn:hover {
                    background: rgba(239, 68, 68, 0.9);
                }
                
                /* Modal Styles */
                .history-modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0,0,0,0.85);
                    backdrop-filter: blur(8px);
                    z-index: 2100;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                    animation: fadeIn 0.2s ease;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .history-modal {
                    background: var(--bg-secondary);
                    border-radius: 16px;
                    max-width: 800px;
                    max-height: 90vh;
                    width: 100%;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                    animation: modalSlideIn 0.3s ease;
                }
                @keyframes modalSlideIn {
                    from { 
                        opacity: 0;
                        transform: scale(0.95) translateY(20px);
                    }
                    to { 
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }
                .modal-close {
                    position: absolute;
                    top: 16px;
                    right: 16px;
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    background: rgba(0,0,0,0.6);
                    border: none;
                    color: white;
                    font-size: 16px;
                    cursor: pointer;
                    z-index: 10;
                    transition: background 0.2s;
                }
                .modal-close:hover {
                    background: rgba(0,0,0,0.8);
                }
                .modal-image-container {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #0a0a0a;
                    padding: 20px;
                    max-height: 60vh;
                }
                .preview-image-tight-container {
                    position: relative;
                    display: inline-block;
                    max-width: 100%;
                    max-height: 50vh;
                }
                .modal-image-container .main-result-image {
                    max-width: 100%;
                    max-height: 50vh;
                    object-fit: contain;
                    border-radius: 8px;
                    display: block;
                }
                .reference-image-overlay {
                    position: absolute;
                    top: 8px;
                    left: 8px;
                    width: calc(33.33% - 16px);
                    background: rgba(0, 0, 0, 0.6);
                    border-radius: 8px;
                    padding: 4px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                    border: 1px solid rgba(255,255,255,0.1);
                    backdrop-filter: blur(4px);
                    transition: transform 0.2s;
                    z-index: 10;
                }
                .reference-image-overlay:hover {
                    transform: scale(1.05);
                }
                .reference-label {
                    display: block;
                    font-size: 10px;
                    color: rgba(255,255,255,0.8);
                    margin-bottom: 4px;
                    text-align: center;
                    font-weight: 500;
                }
                .reference-image-overlay img {
                    width: 100%;
                    height: auto;
                    object-fit: contain;
                    border-radius: 4px;
                }
                .modal-info {
                    padding: 20px;
                    border-top: 1px solid var(--border-color);
                }
                .modal-meta {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 12px;
                }
                .modal-mode {
                    padding: 4px 10px;
                    background: var(--accent);
                    color: #000;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                }
                .modal-time {
                    font-size: 12px;
                    color: var(--text-muted);
                }
                .modal-prompt-section {
                    margin-bottom: 16px;
                }
                .modal-prompt-section label {
                    font-size: 12px;
                    color: var(--text-secondary);
                    margin-bottom: 6px;
                    display: block;
                }
                .modal-prompt {
                    font-size: 14px;
                    color: var(--text-primary);
                    line-height: 1.5;
                    padding: 12px;
                    background: var(--bg-tertiary);
                    border-radius: 8px;
                    max-height: 120px;
                    overflow-y: auto;
                }
                .modal-actions {
                    display: flex;
                    gap: 12px;
                }
                .modal-btn {
                    flex: 1;
                    padding: 12px 20px;
                    border-radius: 10px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    border: none;
                }
                .modal-btn.primary {
                    background: var(--accent);
                    color: #000;
                }
                .modal-btn.primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(255,200,0,0.3);
                }
                .modal-btn.secondary {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                    border: 1px solid var(--border-color);
                }
                .modal-btn.secondary:hover {
                    background: var(--bg-hover);
                }
                
                @media (max-width: 600px) {
                    .history-modal {
                        max-height: 100vh;
                        border-radius: 0;
                    }
                    .modal-actions {
                        flex-direction: column;
                    }
                }
            `}</style>
        </div>
    );
}
