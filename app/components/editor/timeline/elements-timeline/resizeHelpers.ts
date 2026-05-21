import { MediaFile } from "@/app/types";

/**
 * 右端 resize 時の duration を sourceDuration でクランプする (TIG_PF-10705)。
 * clip.sourceDuration が定義されていれば「素材総尺 - startTime」を上限とし、
 * 未定義の旧データは無制限 (Infinity) で互換維持。
 * video/audio の handleRightResize で共有。image は呼ばない (尺概念なし)。
 */
export const clampRightResizeDuration = (
    clip: MediaFile,
    requestedDuration: number,
): { constrainedDuration: number; didClamp: boolean } => {
    const maxDuration = clip.sourceDuration !== undefined
        ? Math.max(0, clip.sourceDuration - clip.startTime)
        : Infinity;
    const constrainedDuration = Math.min(requestedDuration, maxDuration);
    return {
        constrainedDuration,
        didClamp: constrainedDuration < requestedDuration,
    };
};
