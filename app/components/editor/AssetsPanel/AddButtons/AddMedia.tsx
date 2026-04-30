"use client";

import { getFile, useAppDispatch, useAppSelector } from "../../../../store";
import { setMediaFiles } from "../../../../store/slices/projectSlice";
import { storeFile } from "../../../../store";
import { categorizeFile, probeMediaDimensions, probeVideoHasAudio } from "../../../../utils/utils";
import { MAX_PROJECT_DURATION } from "../../../../lib/limits";
import Image from 'next/image';
import toast from 'react-hot-toast';

export default function AddMedia({ fileId }: { fileId: string }) {
    const { mediaFiles, duration: projectDuration } = useAppSelector((state) => state.projectState);
    const playerResolution = useAppSelector((state) => state.embed.playerResolution);
    const dispatch = useAppDispatch();

    const handleFileChange = async () => {
        if (!fileId) return;
        const updatedMedia = [...mediaFiles];

        // タイムライン全長 180 秒上限の UX ガード（TIG_PF-10675）
        // 上限判定はトラック横断のプロジェクト全体 duration を根拠にする
        // （type 別 lastEnd だと video 0 秒 + audio 180 秒のときに video 追加をすり抜ける）。
        if (projectDuration >= MAX_PROJECT_DURATION) {
            toast.error(`タイムライン上限 ${MAX_PROJECT_DURATION} 秒に達しているため追加できません`);
            return;
        }

        const file = await getFile(fileId);
        const mediaId = crypto.randomUUID();

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

        // 新規クリップの positionEnd が MAX_PROJECT_DURATION を超えないようにクランプ（TIG_PF-10675）
        const desiredEnd = lastEnd + 30;
        const clampedEnd = Math.min(desiredEnd, MAX_PROJECT_DURATION);
        const clipDuration = clampedEnd - lastEnd;
        if (clampedEnd < desiredEnd) {
            toast(`タイムライン上限 ${MAX_PROJECT_DURATION} 秒に合わせて ${clipDuration.toFixed(1)} 秒にトリミングしました`);
        }
        updatedMedia.push({
            id: mediaId,
            fileName: file.name,
            fileId: fileId,
            startTime: 0,
            endTime: clipDuration,
            src: URL.createObjectURL(file),
            positionStart: lastEnd,
            positionEnd: clampedEnd,
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
