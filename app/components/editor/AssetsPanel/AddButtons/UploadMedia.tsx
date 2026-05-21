"use client";

import { listFiles, useAppDispatch, useAppSelector } from "../../../../store";
import { setMediaFiles, setFilesID } from "../../../../store/slices/projectSlice";
import { storeFile } from "../../../../store";
import { isImageUploadBlocked } from "../../../../utils/utils";
import { FEATURE_FLAGS } from "@/app/lib/featureFlags";
import { useTranslation } from "@/app/lib/i18n/useTranslation";
import Image from 'next/image';
import toast from 'react-hot-toast';

const ACCEPT_BASE = "video/*,audio/*";
const ACCEPT_WITH_IMAGE = `${ACCEPT_BASE},image/*`;

export default function AddMedia() {
    const { mediaFiles, filesID } = useAppSelector((state) => state.projectState);
    const dispatch = useAppDispatch();
    const { t } = useTranslation();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const newFiles = Array.from(e.target.files || []);
        const updatedFiles = [...filesID || []];
        let rejectedImageCount = 0;
        for (const file of newFiles) {
            // accept はあくまでヒントなので、ユーザーが「すべてのファイル」表示で
            // image を選択した場合は通ってしまう。明示的に弾いて toast 通知する。
            if (isImageUploadBlocked(file.type)) {
                rejectedImageCount += 1;
                continue;
            }
            const fileId = crypto.randomUUID();
            await storeFile(file, fileId);
            updatedFiles.push(fileId)
        }
        if (rejectedImageCount > 0) {
            toast.error(t('toasts.imageNotSupported'));
        }
        dispatch(setFilesID(updatedFiles));
        e.target.value = "";
    };

    return (
        <div
        >
            <label
                htmlFor="file-upload"
                className="cursor-pointer rounded-full bg-white border border-solid border-transparent transition-colors flex flex-row gap-2 items-center justify-center text-gray-800 hover:bg-[#ccc] dark:hover:bg-[#ccc] font-medium text-sm sm:text-base h-auto py-2 px-2 sm:px-5 sm:w-auto"
            >
                <Image
                    alt="Add Project"
                    className="Black"
                    height={12}
                    width={12}
                    src="https://www.svgrepo.com/show/514275/upload-cloud.svg"
                />
                <span className="text-xs">{t('buttons.addMedia')}</span>
            </label>
            <input
                type="file"
                accept={FEATURE_FLAGS.enableImageUpload ? ACCEPT_WITH_IMAGE : ACCEPT_BASE}
                multiple
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
            />
        </div>
    );
}
