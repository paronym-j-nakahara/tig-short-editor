"use client";

import { getFile, useAppDispatch, useAppSelector } from "../../../../store";
import { setMediaFiles } from "../../../../store/slices/projectSlice";
import { storeFile } from "../../../../store";
import { categorizeFile, probeMediaDimensions, probeVideoHasAudio } from "../../../../utils/utils";
import Image from 'next/image';
import toast from 'react-hot-toast';

export default function AddMedia({ fileId }: { fileId: string }) {
    const { mediaFiles } = useAppSelector((state) => state.projectState);
    const playerResolution = useAppSelector((state) => state.embed.playerResolution);
    const dispatch = useAppDispatch();

    const handleFileChange = async () => {
        const updatedMedia = [...mediaFiles];

        const file = await getFile(fileId);
        const mediaId = crypto.randomUUID();

        if (fileId) {
            const mediaType = categorizeFile(file.type);
            const relevantClips = mediaFiles.filter(clip => clip.type === mediaType);
            const lastEnd = relevantClips.length > 0
                ? Math.max(...relevantClips.map(f => f.positionEnd))
                : 0;

            // Probe audio track for video media so we can correctly build the
            // FFmpeg filter_complex on export. Audio files always have audio,
            // images never do.
            let hasAudio: boolean | undefined;
            if (mediaType === 'video') {
                try {
                    hasAudio = await probeVideoHasAudio(file);
                } catch (err) {
                    console.warn('Failed to probe audio track, assuming present:', err);
                    hasAudio = true;
                }
            } else if (mediaType === 'audio') {
                hasAudio = true;
            } else {
                hasAudio = false;
            }

            // Player キャンバスに対して inscribe (アスペクト比保持で中央配置) する。
            // probe 失敗時はキャンバス全面 fit にフォールバック。
            const canvasW = playerResolution?.width ?? 1920;
            const canvasH = playerResolution?.height ?? 1080;
            let elementW = canvasW;
            let elementH = canvasH;
            let cropW = canvasW;
            let cropH = canvasH;
            let posX = 0;
            let posY = 0;
            if (mediaType === 'video' || mediaType === 'image') {
                const dims = await probeMediaDimensions(file, mediaType);
                if (dims && dims.width > 0 && dims.height > 0) {
                    cropW = dims.width;
                    cropH = dims.height;
                    const scale = Math.min(canvasW / dims.width, canvasH / dims.height);
                    elementW = Math.round(dims.width * scale);
                    elementH = Math.round(dims.height * scale);
                    posX = Math.round((canvasW - elementW) / 2);
                    posY = Math.round((canvasH - elementH) / 2);
                }
            }

            updatedMedia.push({
                id: mediaId,
                fileName: file.name,
                fileId: fileId,
                startTime: 0,
                endTime: 30,
                src: URL.createObjectURL(file),
                positionStart: lastEnd,
                positionEnd: lastEnd + 30,
                includeInMerge: true,
                x: posX,
                y: posY,
                width: elementW,
                height: elementH,
                rotation: 0,
                opacity: 100,
                crop: { x: 0, y: 0, width: cropW, height: cropH },
                playbackSpeed: 1,
                volume: 100,
                type: mediaType,
                zIndex: 0,
                hasAudio,
            });
        }
        dispatch(setMediaFiles(updatedMedia));
        toast.success('Media added successfully.');
    };

    return (
        <div
        >
            <label
                className="cursor-pointer rounded-full bg-white border border-solid border-transparent transition-colors flex flex-col items-center justify-center text-gray-800 hover:bg-[#ccc] dark:hover:bg-[#ccc] font-medium sm:text-base py-2 px-2"
            >
                <Image
                    alt="Add Project"
                    className="Black"
                    height={12}
                    width={12}
                    src="https://www.svgrepo.com/show/513803/add.svg"
                />
                {/* <span className="text-xs">Add Media</span> */}
                <button
                    onClick={handleFileChange}
                >
                </button>
            </label>
        </div>
    );
}
