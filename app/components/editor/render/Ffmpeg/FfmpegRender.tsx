'use client'
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { useEffect, useRef, useState } from "react";
import { getFile, useAppSelector } from "@/app/store";
import { Heart } from "lucide-react";
import Image from "next/image";
import { extractConfigs } from "@/app/utils/extractConfigs";
import { mimeToExt } from "@/app/types";
import { toast } from "react-hot-toast";
import FfmpegProgressBar from "./ProgressBar";
import { useEmbedMode } from "@/app/lib/useEmbedMode";
import { sendToParent } from "@/app/lib/postMessage/bridge";
import { uploadBlobToSignedUrl } from "@/app/lib/postMessage/uploadToS3";
import { generateThumbnailFromVideo } from "@/app/lib/postMessage/generateThumbnail";

interface FileUploaderProps {
    loadFunction: () => Promise<void>;
    loadFfmpeg: boolean;
    ffmpeg: FFmpeg;
    logMessages: string;
}
export default function FfmpegRender({ loadFunction, loadFfmpeg, ffmpeg, logMessages }: FileUploaderProps) {
    const { mediaFiles, projectName, exportSettings, duration, textElements } = useAppSelector(state => state.projectState);
    const embedSession = useAppSelector(state => state.embed);
    const embedMode = useEmbedMode();
    const totalDuration = duration;
    const videoRef = useRef<HTMLVideoElement>(null);
    const [loaded, setLoaded] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isRendering, setIsRendering] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "completed" | "failed">("idle");
    const [uploadProgress, setUploadProgress] = useState(0);

    useEffect(() => {
        if (loaded && videoRef.current && previewUrl) {
            videoRef.current.src = previewUrl;
        }
    }, [loaded, previewUrl]);

    const handleCloseModal = async () => {
        setShowModal(false);
        setIsRendering(false);
        try {
            ffmpeg.terminate();
            await loadFunction();
        } catch (e) {
            console.error("Failed to reset FFmpeg:", e);
        }
    };

    const render = async () => {
        if (mediaFiles.length === 0 && textElements.length === 0) {
            console.log('No media files to render');
            return;
        }
        setShowModal(true);
        setIsRendering(true);

        const renderFunction = async () => {
            const params = extractConfigs(exportSettings);

            try {
                const filters = [];
                const overlays = [];
                const inputs = [];
                const audioDelays = [];

                // Create base black background
                filters.push(`color=c=black:size=1920x1080:d=${totalDuration.toFixed(3)}[base]`);
                // Sort videos by zIndex ascending (lowest drawn first)
                const sortedMediaFiles = [...mediaFiles].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

                for (let i = 0; i < sortedMediaFiles.length; i++) {

                    // timing
                    const { startTime, positionStart, positionEnd } = sortedMediaFiles[i];
                    const duration = positionEnd - positionStart;

                    // get the file data and write to ffmpeg
                    const fileData = await getFile(sortedMediaFiles[i].fileId);
                    const buffer = await fileData.arrayBuffer();
                    const ext = mimeToExt[fileData.type as keyof typeof mimeToExt] || fileData.type.split('/')[1];
                    await ffmpeg.writeFile(`input${i}.${ext}`, new Uint8Array(buffer));

                    // TODO: currently we have to write same file if it's used more than once in different clips the below approach is a good start to change this 
                    // let wroteFiles = new Map<string, string>();
                    // const { fileId, type } = sortedMediaFiles[i];
                    // let inputFilename: string;

                    // if (wroteFiles.has(fileId)) {
                    //     inputFilename = wroteFiles.get(fileId)!;
                    // } else {
                    //     const fileData = await getFile(fileId);
                    //     const buffer = await fileData.arrayBuffer();
                    //     const ext = mimeToExt[fileData.type as keyof typeof mimeToExt] || fileData.type.split('/')[1];
                    //     inputFilename = `input_${fileId}.${ext}`;
                    //     await ffmpeg.writeFile(inputFilename, new Uint8Array(buffer));
                    //     wroteFiles.set(fileId, inputFilename);
                    // }

                    if (sortedMediaFiles[i].type === 'image') {
                        inputs.push('-loop', '1', '-t', duration.toFixed(3), '-i', `input${i}.${ext}`);
                    }
                    else {
                        inputs.push('-i', `input${i}.${ext}`);
                    }

                    const visualLabel = `visual${i}`;
                    const audioLabel = `audio${i}`;

                    // Shift clip to correct place on timeline (video)
                    if (sortedMediaFiles[i].type === 'video') {
                        filters.push(
                            `[${i}:v]trim=start=${startTime.toFixed(3)}:duration=${duration.toFixed(3)},scale=${sortedMediaFiles[i].width}:${sortedMediaFiles[i].height},setpts=PTS-STARTPTS+${positionStart.toFixed(3)}/TB[${visualLabel}]`
                        );
                    }
                    if (sortedMediaFiles[i].type === 'image') {
                        filters.push(
                            `[${i}:v]scale=${sortedMediaFiles[i].width}:${sortedMediaFiles[i].height},setpts=PTS+${positionStart.toFixed(3)}/TB[${visualLabel}]`
                        );
                    }

                    // Apply opacity
                    if (sortedMediaFiles[i].type === 'video' || sortedMediaFiles[i].type === 'image') {
                        const alpha = Math.min(Math.max((sortedMediaFiles[i].opacity || 100) / 100, 0), 1);
                        filters.push(
                            `[${visualLabel}]format=yuva420p,colorchannelmixer=aa=${alpha}[${visualLabel}]`
                        );
                    }

                    // Store overlay range that matches shifted time
                    if (sortedMediaFiles[i].type === 'video' || sortedMediaFiles[i].type === 'image') {
                        overlays.push({
                            label: visualLabel,
                            x: sortedMediaFiles[i].x,
                            y: sortedMediaFiles[i].y,
                            start: positionStart.toFixed(3),
                            end: positionEnd.toFixed(3),
                        });
                    }

                    // Audio: trim, then delay (in ms)
                    if (sortedMediaFiles[i].type === 'audio' || sortedMediaFiles[i].type === 'video') {
                        const delayMs = Math.round(positionStart * 1000);
                        const volume = sortedMediaFiles[i].volume !== undefined ? sortedMediaFiles[i].volume / 100 : 1;
                        filters.push(
                            `[${i}:a]atrim=start=${startTime.toFixed(3)}:duration=${duration.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},volume=${volume}[${audioLabel}]`
                        );
                        audioDelays.push(`[${audioLabel}]`);
                    }
                }

                // Apply overlays in z-index order
                let lastLabel = 'base';
                if (overlays.length > 0) {
                    for (let i = 0; i < overlays.length; i++) {
                        const { label, start, end, x, y } = overlays[i];
                        const nextLabel = i === overlays.length - 1 ? 'outv' : `tmp${i}`;
                        filters.push(
                            `[${lastLabel}][${label}]overlay=${x}:${y}:enable='between(t\\,${start}\\,${end})'[${nextLabel}]`
                        );
                        lastLabel = nextLabel;
                    }
                }

                // Apply text 
                if (textElements.length > 0) {
                    // load fonts
                    let fonts = ['Arial', 'Inter', 'Lato'];
                    for (let i = 0; i < fonts.length; i++) {
                        const font = fonts[i];
                        const res = await fetch(`/fonts/${font}.ttf`);
                        const fontBuf = await res.arrayBuffer();
                        await ffmpeg.writeFile(`font${font}.ttf`, new Uint8Array(fontBuf));
                    }
                    // Apply text
                    for (let i = 0; i < textElements.length; i++) {
                        const text = textElements[i];
                        const label = i === textElements.length - 1 ? 'outv' : `text${i}`;
                        const escapedText = text.text.replace(/:/g, '\\:').replace(/'/g, "\\\\'");
                        const alpha = Math.min(Math.max((text.opacity ?? 100) / 100, 0), 1);
                        const color = text.color?.includes('@') ? text.color : `${text.color || 'white'}@${alpha}`;
                        filters.push(
                            `[${lastLabel}]drawtext=fontfile=font${text.font}.ttf:text='${escapedText}':x=${text.x}:y=${text.y}:fontsize=${text.fontSize || 24}:fontcolor=${color}:enable='between(t\\,${text.positionStart}\\,${text.positionEnd})'[${label}]`
                        );
                        lastLabel = label;
                    }
                }

                // Mix all audio tracks
                if (audioDelays.length > 0) {
                    const audioMix = audioDelays.join('');
                    filters.push(`${audioMix}amix=inputs=${audioDelays.length}:normalize=0[outa]`);
                }

                // Final filter_complex
                const complexFilter = filters.join('; ');
                const ffmpegArgs = [
                    ...inputs,
                    '-filter_complex', complexFilter,
                    '-map', '[outv]',
                ];

                if (audioDelays.length > 0) {
                    ffmpegArgs.push('-map', '[outa]');
                }

                ffmpegArgs.push(
                    '-c:v', 'libx264',
                    '-c:a', 'aac',
                    '-preset', params.preset,
                    '-crf', params.crf.toString(),
                    '-t', totalDuration.toFixed(3),
                    'output.mp4'
                );

                await ffmpeg.exec(ffmpegArgs);

            } catch (err) {
                console.error('FFmpeg processing error:', err);
            }

            // return the output url
            const outputData = await ffmpeg.readFile('output.mp4');
            const outputBlob = new Blob([outputData as Uint8Array], { type: 'video/mp4' });
            const outputUrl = URL.createObjectURL(outputBlob);
            return outputUrl;
        };

        // embed mode 起動時に exportStart を CMS に通知
        if (embedMode && embedSession.sessionId) {
            sendToParent("exportStart", { sessionId: embedSession.sessionId });
        }

        // Run the function and handle the result/error
        try {
            const outputUrl = await renderFunction();
            setPreviewUrl(outputUrl);
            setLoaded(true);

            const willUpload =
                embedMode && !!embedSession.sessionId && !!embedSession.upload;
            // embed mode 時は uploading UI を先に表示してから isRendering を解除し、
            // 「Save Video ボタンが一瞬出る」チラつきを避ける
            if (willUpload) {
                setUploadStatus("uploading");
            }
            setIsRendering(false);
            toast.success('Video rendered successfully');

            if (willUpload) {
                await uploadRenderedToS3(outputUrl);
            }
        } catch (err) {
            toast.error('Failed to render video');
            console.error("Failed to render video:", err);
            if (embedMode && embedSession.sessionId) {
                sendToParent("exportError", {
                    sessionId: embedSession.sessionId,
                    code: "RENDER_FAILED",
                    message: err instanceof Error ? err.message : "render failed",
                });
            }
        }
    };

    /**
     * embed mode 専用: レンダリング後の output.mp4 とサムネ画像を S3 PUT し、
     * 進捗 → 完了 → エラーを postMessage で CMS に通知する。
     *
     * - mp4 PUT は必須（失敗で exportError）
     * - サムネ PUT は best effort（失敗は警告のみで exportComplete を送る）
     * - exportProgress は 1% 単位で throttle
     */
    const lastSentProgressRef = useRef(0);
    const uploadRenderedToS3 = async (outputUrl: string) => {
        if (!embedSession.sessionId || !embedSession.upload) return;
        const { sessionId } = embedSession;
        const { putUrl, contentType, s3Key, thumbnailPutUrl, thumbnailS3Key, thumbnailContentType } = embedSession.upload;

        setUploadStatus("uploading");
        setUploadProgress(0);
        lastSentProgressRef.current = 0;

        try {
            // mp4 Blob 取得
            const videoRes = await fetch(outputUrl);
            const videoBlob = await videoRes.blob();

            // サムネ生成（webp 第一選択、Safari 等で webp 非対応なら jpeg にフォールバック）
            let thumbnail: Awaited<ReturnType<typeof generateThumbnailFromVideo>> | null = null;
            try {
                thumbnail = await generateThumbnailFromVideo(videoBlob);
            } catch (e) {
                console.warn("[postMessage] thumbnail generation failed (best effort)", e);
            }

            // mp4 + (任意) サムネ を並列 PUT。サムネ失敗は警告扱い。
            const [videoSettled, thumbSettled] = await Promise.allSettled([
                uploadBlobToSignedUrl({
                    putUrl,
                    contentType,
                    s3Key,
                    blob: videoBlob,
                    onProgress: (p) => {
                        setUploadProgress(p);
                        // 1% 以上の変化のみ postMessage 送信して throttle
                        if (p - lastSentProgressRef.current >= 0.01 || p === 1) {
                            lastSentProgressRef.current = p;
                            sendToParent("exportProgress", {
                                sessionId,
                                progress: p,
                                phase: "uploading",
                            });
                        }
                    },
                }),
                thumbnail
                    ? uploadBlobToSignedUrl({
                        putUrl: thumbnailPutUrl,
                        contentType: thumbnail.mimeType === thumbnailContentType ? thumbnailContentType : thumbnail.mimeType,
                        s3Key: thumbnailS3Key,
                        blob: thumbnail.blob,
                    })
                    : Promise.reject(new Error("THUMBNAIL_SKIPPED")),
            ]);

            // mp4 PUT が失敗したら全体失敗
            if (videoSettled.status === "rejected") {
                throw videoSettled.reason instanceof Error
                    ? videoSettled.reason
                    : new Error("UPLOAD_FAILED");
            }
            if (thumbSettled.status === "rejected") {
                console.warn("[postMessage] thumbnail upload failed (best effort)", thumbSettled.reason);
            }

            sendToParent("exportComplete", {
                sessionId,
                s3Key: videoSettled.value.s3Key,
                thumbnailS3Key,
                fileName: `${projectName}.mp4`,
                fileSize: videoSettled.value.fileSize,
                duration: totalDuration,
                width: thumbnail?.width ?? 0,
                height: thumbnail?.height ?? 0,
                mimeType: contentType,
            });
            setUploadStatus("completed");
        } catch (err) {
            const message = err instanceof Error ? err.message : "upload failed";
            const code = message.startsWith("HTTP_403")
                ? "UPLOAD_URL_EXPIRED"
                : "UPLOAD_FAILED";
            sendToParent("exportError", { sessionId, code, message });
            setUploadStatus("failed");
            toast.error(`Upload to CMS failed: ${message}`);
        } finally {
            // 自分が fetch でラップした blob URL は revoke。preview 表示用 outputUrl は
            // 既存挙動に合わせて UI 側で保持するため、ここでは revoke しない。
        }
    };

    return (
        <>
            {/* Render Button */}
            <button
                onClick={() => render()}
                className={`inline-flex items-center p-3 bg-white hover:bg-[#ccc] rounded-lg disabled:opacity-50 text-gray-900 font-bold transition-all transform`}
                disabled={(!loadFfmpeg || isRendering || (mediaFiles.length === 0 && textElements.length === 0))}
            >
                {(!loadFfmpeg || isRendering) && <span className="animate-spin mr-2">
                    <svg
                        viewBox="0 0 1024 1024"
                        focusable="false"
                        data-icon="loading"
                        width="1em"
                        height="1em"
                    >
                        <path d="M988 548c-19.9 0-36-16.1-36-36 0-59.4-11.6-117-34.6-171.3a440.45 440.45 0 00-94.3-139.9 437.71 437.71 0 00-139.9-94.3C629 83.6 571.4 72 512 72c-19.9 0-36-16.1-36-36s16.1-36 36-36c69.1 0 136.2 13.5 199.3 40.3C772.3 66 827 103 874 150c47 47 83.9 101.8 109.7 162.7 26.7 63.1 40.2 130.2 40.2 199.3.1 19.9-16 36-35.9 36z"></path>
                    </svg>
                </span>}
                <p>{loadFfmpeg ? (isRendering ? 'Rendering...' : 'Render') : 'Loading FFmpeg...'}</p>
            </button>

            {/* Render Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
                    <div className="bg-black rounded-xl shadow-lg p-6 max-w-xl w-full">
                        {/* Title and close button */}
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold">
                                {isRendering ? 'Rendering...' : `${projectName}`}
                            </h2>
                            <button
                                onClick={handleCloseModal}
                                className="text-white text-4xl font-bold hover:text-red-400"
                                aria-label="Close"
                            >
                                &times;
                            </button>
                        </div>

                        {isRendering ? (
                            <div>
                                <div className="bg-black p-2 h-40 text-sm font-mono rounded">
                                    <div>{logMessages}</div>
                                    <p className="text-xs text-gray-400 italic">The progress bar is experimental in FFmpeg WASM, so it might appear slow or unresponsive even though the actual processing is not.</p>
                                    <FfmpegProgressBar ffmpeg={ffmpeg} />
                                </div>
                            </div>
                        ) : (
                            <div>
                                {previewUrl && (
                                    <video src={previewUrl} controls className="w-full mb-4" />
                                )}
                                {embedMode ? (
                                    <div className="text-sm">
                                        {uploadStatus === "uploading" && (
                                            <p className="text-gray-200">
                                                Uploading to CMS… {Math.round(uploadProgress * 100)}%
                                            </p>
                                        )}
                                        {uploadStatus === "completed" && (
                                            <p className="text-green-400">
                                                Upload complete. The CMS will close this window.
                                            </p>
                                        )}
                                        {uploadStatus === "failed" && (
                                            <p className="text-red-400">
                                                Upload failed. Please retry from the CMS side.
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex justify-between">
                                        <a
                                            href={previewUrl || '#'}
                                            download={`${projectName}.mp4`}
                                            className={`inline-flex items-center p-3 bg-white hover:bg-[#ccc] rounded-lg text-gray-900 font-bold transition-all transform `}
                                        >
                                            <Image
                                                alt='Download'
                                                className="Black"
                                                height={18}
                                                src={'https://www.svgrepo.com/show/501347/save.svg'}
                                                width={18}
                                            />
                                            <span className="ml-2">Save Video</span>
                                        </a>
                                        <a
                                            href="https://github.com/sponsors/mohyware"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`inline-flex items-center p-3 bg-pink-600 hover:bg-pink-500 rounded-lg text-gray-900 font-bold transition-all transform`}
                                        >
                                            <Heart size={20} className="mr-2" />
                                            Sponsor on Github
                                        </a>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

        </>
    )
}