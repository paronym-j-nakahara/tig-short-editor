/**
 * 動画 Blob の最初のフレームからサムネイルを生成する。
 *
 * 仕様: docs/plan/TIG_PF-10627_short_editor/postmessage_protocol.md §5.1 (UploadConfig.thumbnail*)
 *
 * - `<video>` 要素 + `<canvas>` でブラウザネイティブにエンコード
 * - 第一選択は webp。Safari 16 未満など webp 非対応環境では jpeg にフォールバック
 *   (返却 mimeType を呼び出し元が確認してアップロード Content-Type と整合させる)
 * - quality は 0.8
 * - timeout 10 秒（壊れた動画でハングしないよう保険）
 */

const THUMBNAIL_TIMEOUT_MS = 10_000;
const THUMBNAIL_QUALITY = 0.8;

export interface ThumbnailResult {
    blob: Blob;
    width: number;
    height: number;
    mimeType: "image/webp" | "image/jpeg";
}

export async function generateThumbnailFromVideo(
    videoBlob: Blob
): Promise<ThumbnailResult> {
    const url = URL.createObjectURL(videoBlob);
    try {
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.src = url;

        await waitForVideoReady(video);

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("CANVAS_2D_UNAVAILABLE");
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // 第一選択 webp、ダメなら jpeg にフォールバック
        let blob = await encodeCanvas(canvas, "image/webp");
        let mimeType: ThumbnailResult["mimeType"] = "image/webp";
        if (!blob) {
            blob = await encodeCanvas(canvas, "image/jpeg");
            mimeType = "image/jpeg";
        }
        if (!blob) {
            throw new Error("THUMBNAIL_ENCODE_FAILED");
        }
        return { blob, width: canvas.width, height: canvas.height, mimeType };
    } finally {
        URL.revokeObjectURL(url);
    }
}

function encodeCanvas(
    canvas: HTMLCanvasElement,
    type: "image/webp" | "image/jpeg"
): Promise<Blob | null> {
    return new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), type, THUMBNAIL_QUALITY);
    });
}

function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            video.removeEventListener("loadeddata", onReady);
            video.removeEventListener("error", onError);
            window.clearTimeout(timer);
        };
        const onReady = () => {
            cleanup();
            // seek to 0 to ensure first frame is decoded
            if (video.currentTime !== 0) {
                video.currentTime = 0;
                video.addEventListener(
                    "seeked",
                    () => resolve(),
                    { once: true }
                );
            } else {
                resolve();
            }
        };
        const onError = () => {
            cleanup();
            reject(new Error("VIDEO_LOAD_FAILED"));
        };
        const timer = window.setTimeout(() => {
            cleanup();
            reject(new Error("THUMBNAIL_TIMEOUT"));
        }, THUMBNAIL_TIMEOUT_MS);

        video.addEventListener("loadeddata", onReady);
        video.addEventListener("error", onError);
    });
}
