import React from 'react';

export const Icons = {
    AlignLeft: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h10M4 18h16" /></svg>,
    AlignCenter: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6h12M4 12h16M6 18h12" /></svg>,
    AlignRight: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M10 12h10M4 18h16" /></svg>,
    AlignTop: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: 'rotate(90deg)' }}><path d="M4 6h16M10 12h10M4 18h16" /></svg>,
    AlignMiddle: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: 'rotate(90deg)' }}><path d="M6 6h12M4 12h16M6 18h12" /></svg>,
    AlignBottom: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: 'rotate(90deg)' }}><path d="M4 6h16M4 12h10M4 18h16" /></svg>,
    Brush: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l9 9-9 9-9-9 9-9z" /><path d="M7 17v5h10v-5" /></svg>,
    Eye: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8z" /></svg>,
    Eraser: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 20H9l-7-7 9-9 9 9-7 7h7z" /></svg>,
    ChevronDown: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6" /></svg>,
    Image: () => <div style={{ fontSize: 40, marginBottom: 16 }}>🖼️</div>, // Kept as div for now as it was used as such
};
