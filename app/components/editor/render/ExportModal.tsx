'use client';

import { useEffect } from 'react';
import Ffmpeg from './Ffmpeg/Ffmpeg';
import { useTranslation } from '@/app/lib/i18n/useTranslation';

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// 一度開いたら以降は unmount せず、isOpen で可視性だけ切替する。
// 理由: <Ffmpeg /> は mount 時に ffmpeg-core.wasm (数 MB) を fetch するため、
// 開閉のたびに unmount すると毎回ロードが走る。さらに書き出し中に閉じた場合の
// 進捗 state も保持される。
export default function ExportModal({ isOpen, onClose }: ExportModalProps) {
    const { t } = useTranslation();

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    return (
        <div
            className={`fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-70 ${isOpen ? '' : 'hidden'}`}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="relative bg-darkSurfacePrimary rounded-lg shadow-xl border border-white border-opacity-10 max-w-[90vw] max-h-[90vh] overflow-auto p-6">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('buttons.close')}
                    className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full text-white text-xl hover:bg-white hover:bg-opacity-10"
                >
                    ×
                </button>
                <Ffmpeg />
            </div>
        </div>
    );
}
