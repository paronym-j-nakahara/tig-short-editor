import Image from 'next/image';
import { useTranslation } from '@/app/lib/i18n/useTranslation';

export default function ExportButton({ onClick }: { onClick: () => void }) {
    const { t } = useTranslation();
    return (
        <button
            className="bg-white border border-solid rounded border-transparent transition-colors flex flex-col items-center justify-center text-gray-800 hover:bg-[#ccc] dark:hover:bg-[#ccc] font-medium text-sm sm:text-base h-auto py-2 px-2 sm:px-5 sm:w-auto"
            onClick={onClick}
        >
            <Image
                alt={t('sidebar.export')}
                className="h-auto w-auto max-w-[30px] max-h-[30px]"
                height={30}
                width={30}
                src="https://www.svgrepo.com/show/486665/export.svg"
            />
            <span className="text-xs">{t('sidebar.export')}</span>
        </button>
    );
}