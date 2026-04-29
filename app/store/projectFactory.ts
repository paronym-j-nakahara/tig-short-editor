import { ProjectState } from "@/app/types";

export const createBlankProject = (
    id: string,
    projectName: string = "Untitled Project"
): ProjectState => {
    const now = new Date().toISOString();
    return {
        id,
        projectName,
        createdAt: now,
        lastModified: now,
        mediaFiles: [],
        textElements: [],
        currentTime: 0,
        isPlaying: false,
        isMuted: false,
        duration: 0,
        activeSection: "media",
        activeElement: "text",
        activeElementIndex: 0,
        filesID: [],
        zoomLevel: 1,
        timelineZoom: 30,
        enableMarkerTracking: true,
        resolution: { width: 1920, height: 1080 },
        fps: 30,
        aspectRatio: "16:9",
        history: [],
        future: [],
        exportSettings: {
            resolution: "1080p",
            quality: "ultra",
            speed: "fastest",
            fps: 30,
            format: "mp4",
            includeSubtitles: false,
        },
    };
};
