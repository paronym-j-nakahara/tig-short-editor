"use client";

import { getFile, useAppDispatch, useAppSelector } from "../../../../store";
import { setMediaFiles, setProjectNameAuto } from "../../../../store/slices/projectSlice";
import { setPlayerResolution } from "../../../../store/slices/embedSlice";
import { storeFile } from "../../../../store";
import { categorizeFile, probeMediaDimensions, probeVideoHasAudio } from "../../../../utils/utils";
import { useEmbedMode } from "@/app/lib/useEmbedMode";
import Image from 'next/image';
import toast from 'react-hot-toast';

const DEFAULT_PROJECT_NAME = "Untitled Project";
const NEW_CLIP_DURATION_SEC = 30;

export default function AddMedia({ fileId }: { fileId: string }) {
    const { mediaFiles, projectName, projectNameAutoSet } = useAppSelector((state) => state.projectState);
    const playerResolution = useAppSelector((state) => state.embed.playerResolution);
    const dispatch = useAppDispatch();
    const embedMode = useEmbedMode();

    const handleFileChange = async () => {
        if (!fileId) return;
        const updatedMedia = [...mediaFiles];

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

        // 動画/画像なら寸法を probe。後で canvas inscribe / 自動キャンバス調整に使う。
        let dims: { width: number; height: number } | null = null;
        if (mediaType === 'video' || mediaType === 'image') {
            try {
                const probed = await probeMediaDimensions(file, mediaType);
                if (probed && probed.width > 0 && probed.height > 0) {
                    dims = { width: probed.width, height: probed.height };
                }
            } catch (err) {
                console.warn('Failed to probe media dimensions, using canvas default:', err);
            }
        }

        // standalone (non-embed) モードかつ「最初に Add される動画」のとき、
        // Composition のキャンバス解像度を動画解像度に合わせる（TIG_PF-10686）。
        // embed mode は CMS が ui.resolution で 1080x1920 を指定しているため触らない。
        // 全トラック横断ではなく video トラックのみで判定（音声を先に Add しても動画自動調整は発火する）。
        const isFirstVideoClip = !mediaFiles.some(f => f.type === 'video');
        const shouldAutoResize = !embedMode && isFirstVideoClip && mediaType === 'video' && dims;
        if (shouldAutoResize) {
            dispatch(setPlayerResolution({ width: dims!.width, height: dims!.height }));
        }

        // 上記 dispatch は非同期反映のため、この関数内では canvasW/H にローカル値を使う。
        const canvasW = shouldAutoResize ? dims!.width : (playerResolution?.width ?? 1920);
        const canvasH = shouldAutoResize ? dims!.height : (playerResolution?.height ?? 1080);

        // Player キャンバスに対して inscribe (アスペクト比保持で中央配置) する。
        // probe 失敗時はキャンバス全面 fit にフォールバック。
        let elementW = canvasW;
        let elementH = canvasH;
        let cropW = canvasW;
        let cropH = canvasH;
        let posX = 0;
        let posY = 0;
        if (dims) {
            cropW = dims.width;
            cropH = dims.height;
            const scale = Math.min(canvasW / dims.width, canvasH / dims.height);
            elementW = Math.round(dims.width * scale);
            elementH = Math.round(dims.height * scale);
            posX = Math.round((canvasW - elementW) / 2);
            posY = Math.round((canvasH - elementH) / 2);
        }

        // 新規クリップは末尾に NEW_CLIP_DURATION_SEC 秒追加。
        // 180s 上限のクランプはタイムライン上では行わず、Export 時に FfmpegRender
        // 側でガードする（TIG_PF-10686）。
        const clipDuration = NEW_CLIP_DURATION_SEC;
        const clampedEnd = lastEnd + clipDuration;
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

        // standalone モードで「初回動画 Add」かつタイトルが未編集相当なら、
        // ファイル名（拡張子除く）を自動タイトルに設定する（TIG_PF-10686）。
        // 未編集判定: 初期 "Untitled Project" のまま OR 直前まで自動設定
        // (projectNameAutoSet=true) のとき。手動編集すると autoSet=false になり
        // 上書きされなくなる。embed mode は CMS から init.contentsTitle を受信
        // するため除外。
        const titleNotManuallyEdited =
            projectName === DEFAULT_PROJECT_NAME || projectNameAutoSet;
        if (!embedMode && isFirstVideoClip && mediaType === 'video' && titleNotManuallyEdited) {
            const baseName = file.name.replace(/\.[^.]+$/, "");
            if (baseName.length > 0) {
                dispatch(setProjectNameAuto(baseName));
            }
        }

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
