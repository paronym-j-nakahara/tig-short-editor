import { MediaType } from "../types";
export const categorizeFile = (mimeType: string): MediaType => {

    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('image/')) return 'image';
    return 'unknown';
};

export const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Probe whether a video file has an audio track using HTMLVideoElement.
// Browsers expose non-standard properties (mozHasAudio, webkitAudioDecodedByteCount,
// audioTracks) that we can use to detect this. We resolve to true if any signal
// indicates audio, and false only when all signals confirm there is none.
// For unsupported browsers we conservatively return true to keep existing behavior.
export const probeVideoHasAudio = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
        const video = document.createElement("video");
        const url = URL.createObjectURL(file);
        let resolved = false;

        const cleanup = () => {
            try {
                video.removeAttribute("src");
                video.load();
            } catch {
                // ignore
            }
            URL.revokeObjectURL(url);
        };

        const settle = (value: boolean) => {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve(value);
        };

        const detect = () => {
            // Firefox
            const moz = (video as unknown as { mozHasAudio?: boolean }).mozHasAudio;
            if (typeof moz === "boolean") {
                return moz;
            }
            // Standardish AudioTrackList
            const tracks = (video as unknown as { audioTracks?: { length: number } }).audioTracks;
            if (tracks && typeof tracks.length === "number") {
                return tracks.length > 0;
            }
            // Chrome/Safari fallback: bytes decoded after a short play
            const bytes = (video as unknown as { webkitAudioDecodedByteCount?: number })
                .webkitAudioDecodedByteCount;
            if (typeof bytes === "number") {
                return bytes > 0;
            }
            // Unknown browser: assume audio exists to preserve previous behavior.
            return true;
        };

        video.preload = "auto";
        video.muted = true;
        video.crossOrigin = "anonymous";

        video.addEventListener("loadedmetadata", () => {
            // For Firefox / standard audioTracks the answer is available now.
            const moz = (video as unknown as { mozHasAudio?: boolean }).mozHasAudio;
            const tracks = (video as unknown as { audioTracks?: { length: number } })
                .audioTracks;
            if (typeof moz === "boolean") {
                settle(moz);
                return;
            }
            if (tracks && typeof tracks.length === "number") {
                settle(tracks.length > 0);
                return;
            }
            // For webkitAudioDecodedByteCount we need to actually play a bit.
            video.play().catch(() => {
                settle(detect());
            });
            // Fallback timer in case timeupdate doesn't fire.
            window.setTimeout(() => settle(detect()), 600);
        });

        video.addEventListener("timeupdate", () => {
            settle(detect());
        });

        video.addEventListener("error", () => {
            // Could not load — assume audio exists to keep prior behavior.
            settle(true);
        });

        // Hard timeout safety net.
        window.setTimeout(() => settle(true), 3000);

        video.src = url;
    });
};