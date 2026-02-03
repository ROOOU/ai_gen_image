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

    const loadHistory = async () => {
        if (!apiKey) { setError('Set API Key to view history'); return; }
        setLoading(true);
        try {
            const res = await fetch('/api/history', { headers: { 'x-api-key': apiKey } });
            const data = await res.json();
            if (data.success) setHistory(data.history);
            else setError(data.error);
        } catch { setError('Connection error'); }
        finally { setLoading(false); }
    };

    useEffect(() => { if (isOpen) loadHistory(); }, [isOpen, apiKey]);

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
                            <div key={item.id} className="history-thumb-card" onClick={() => { onSelectItem(item); onClose(); }}>
                                <img src={item.thumbnailUrl || item.imageUrl} alt={item.prompt} loading="lazy" />
                                <div className="history-thumb-overlay">
                                    <p className="history-thumb-prompt">{item.prompt}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
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
            `}</style>
        </div>
    );
}
