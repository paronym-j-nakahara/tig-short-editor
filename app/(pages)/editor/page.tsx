"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { getFile, storeProject, useAppDispatch, useAppSelector } from "../../store";
import { getProject } from "../../store";
import { createBlankProject } from "../../store/projectFactory";
import { addProject, setCurrentProject, updateProject } from "../../store/slices/projectsSlice";
import { appendFilesID, rehydrate, setMediaFiles, setProjectName } from '../../store/slices/projectSlice';
import { setActiveSection } from "../../store/slices/projectSlice";
import { clearEmbedSession, setEmbedSession } from "../../store/slices/embedSlice";
import { useEmbedMode } from "@/app/lib/useEmbedMode";
import { usePostMessageBridge } from "@/app/lib/postMessage/usePostMessageBridge";
import { sendToParent } from "@/app/lib/postMessage/bridge";
import { loadAssetsFromUrls } from "@/app/lib/postMessage/loadAssets";
import { EDITOR_VERSION, PROTOCOL_VERSION } from "@/app/lib/postMessage/types";
import AddText from '../../components/editor/AssetsPanel/tools-section/AddText';
import AddMedia from '../../components/editor/AssetsPanel/AddButtons/UploadMedia';
import MediaList from '../../components/editor/AssetsPanel/tools-section/MediaList';
import { useSearchParams } from 'next/navigation';
import TextButton from "@/app/components/editor/AssetsPanel/SidebarButtons/TextButton";
import LibraryButton from "@/app/components/editor/AssetsPanel/SidebarButtons/LibraryButton";
import ExportButton from "@/app/components/editor/AssetsPanel/SidebarButtons/ExportButton";
import HomeButton from "@/app/components/editor/AssetsPanel/SidebarButtons/HomeButton";
import MediaProperties from "../../components/editor/PropertiesSection/MediaProperties";
import TextProperties from "../../components/editor/PropertiesSection/TextProperties";
import { Timeline } from "../../components/editor/timeline/Timline";
import { PreviewPlayer } from "../../components/editor/player/remotion/Player";
import { MediaFile } from "@/app/types";
import ExportList from "../../components/editor/AssetsPanel/tools-section/ExportList";
import Image from "next/image";
import ProjectName from "../../components/editor/player/ProjectName";
import { categorizeFile, probeMediaDimensions, probeMediaDuration, probeVideoHasAudio } from "@/app/utils/utils";

function EditorInner() {
    const searchParams = useSearchParams();
    const id = searchParams.get("id");
    const dispatch = useAppDispatch();
    const projectState = useAppSelector((state) => state.projectState);
    const { currentProjectId } = useAppSelector((state) => state.projects);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const embedMode = useEmbedMode();
    const [bridgeReady, setBridgeReady] = useState(false);
    /**
     * `init.contentsTitle` を受信したタイミングと rehydrate 完了タイミングは前後しうるため、
     * 受信値を ref に保持し rehydrate 後にも反映する（CMS から来た title を優先）。
     */
    const pendingContentsTitleRef = useRef<string | null>(null);
    /**
     * `init.assets` でロードした fileId を保持。rehydrate が IndexedDB の旧 filesID で
     * 上書きしてしまうため、state にして useEffect で再 appendFilesID する。
     * ref ではなく state にすることで、loadAssetsFromUrls の async 完了が rehydrate 後でも
     * 確実に反映できる（state 更新 → useEffect 発火）。
     */
    const [pendingAssetFileIds, setPendingAssetFileIds] = useState<string[]>([]);
    /**
     * edit モードで CMS から受け取った既存動画を初期状態でタイムラインに add するための MediaFile。
     * rehydrate との競合を避けるため state ベースで保持し、rehydrate 完了後にマージ反映する。
     */
    const [pendingAssetMediaFiles, setPendingAssetMediaFiles] = useState<MediaFile[]>([]);

    const { activeSection, activeElement } = projectState;

    usePostMessageBridge(embedMode, {
        onInit: async (payload, _msg, senders) => {
            if (process.env.NODE_ENV !== "production") {
                console.log("[postMessage] init received", payload);
            }
            // S3 GET URL から assets を fetch → IndexedDB に取り込み → filesID に追加。
            // 失敗した asset は failedAssets として initAck で CMS に返却する。
            // TODO(Phase 1 後半): onClose / closeRequest 時に embed mode で取り込んだ
            //   IndexedDB の fileId と blob を deleteFile() で削除すること（残骸防止）
            try {
                // embed session を Redux に保存（FfmpegRender が upload PUT URL を参照する）
                // ui.resolution があれば Player のキャンバスサイズも反映する（縦動画 9:16 など）
                dispatch(setEmbedSession({
                    sessionId: payload.sessionId,
                    upload: payload.upload,
                    playerResolution: payload.ui?.resolution ?? null,
                }));

                // CMS から受け取ったタイトルを Redux に反映。rehydrate との競合に備えて
                // ref にも保存し、rehydrate 完了後に再反映する（下の useEffect 参照）。
                if (typeof payload.contentsTitle === "string" && payload.contentsTitle.length > 0) {
                    pendingContentsTitleRef.current = payload.contentsTitle;
                    dispatch(setProjectName(payload.contentsTitle));
                }

                const incomingAssets = payload.assets ?? [];
                const { loaded, failed } = await loadAssetsFromUrls(incomingAssets);
                if (loaded.length > 0) {
                    const fileIds = loaded.map((l) => l.fileId);
                    dispatch(appendFilesID(fileIds));
                    // state 更新で下の useEffect が発火し、rehydrate との競合があっても再復元される
                    setPendingAssetFileIds((prev) => [...prev, ...fileIds]);

                    // edit モードのみ: コンテンツ動画を初期状態でタイムラインに add する
                    if (payload.mode === "edit") {
                        const builtMediaFiles: MediaFile[] = [];
                        const lastEnd: Record<string, number> = { video: 0, audio: 0, image: 0 };
                        // Player キャンバスサイズは CMS の ui.resolution（Short=9:16 のターゲット解像度）を採用する。
                        // 元動画が 16:9 letterbox 済みでも Editor 側で勝手に上書きせず、
                        // クリエイターが意図したアスペクト比 (TigShort の納品フォーマット) を保つ。
                        // 各 MediaFile は元動画の natural dimensions を probe して canvas に inscribe する
                        // ため、横動画を 9:16 キャンバスに置けば上下黒帯（letterbox）になる。
                        const canvasW = payload.ui?.resolution?.width ?? 1080;
                        const canvasH = payload.ui?.resolution?.height ?? 1920;
                        for (const { fileId } of loaded) {
                            const file = await getFile(fileId);
                            if (!file) continue;
                            const mediaType = categorizeFile(file.type);
                            if (mediaType === "unknown") continue;
                            const duration = mediaType === "image"
                                ? 30
                                : (await probeMediaDuration(file, mediaType)) || 30;
                            const hasAudio = mediaType === "video"
                                ? await probeVideoHasAudio(file).catch(() => true)
                                : mediaType === "audio";
                            // C: 元動画/画像のアスペクト比を probe して、Player キャンバスに inscribe する。
                            // letterbox を避けるため、キャンバスと同じアスペクトなら fit。
                            // 違う場合はキャンバスの中央に最大インスクライブで配置 (黒帯は出るが歪まない)。
                            let elementW = canvasW;
                            let elementH = canvasH;
                            let cropW = canvasW;
                            let cropH = canvasH;
                            let posX = 0;
                            let posY = 0;
                            if (mediaType === "video" || mediaType === "image") {
                                const dims = await probeMediaDimensions(file, mediaType);
                                if (dims && dims.width > 0 && dims.height > 0) {
                                    cropW = dims.width;
                                    cropH = dims.height;
                                    const scaleW = canvasW / dims.width;
                                    const scaleH = canvasH / dims.height;
                                    const scale = Math.min(scaleW, scaleH);
                                    elementW = Math.round(dims.width * scale);
                                    elementH = Math.round(dims.height * scale);
                                    posX = Math.round((canvasW - elementW) / 2);
                                    posY = Math.round((canvasH - elementH) / 2);
                                }
                            }
                            const positionStart = lastEnd[mediaType] ?? 0;
                            const positionEnd = positionStart + duration;
                            builtMediaFiles.push({
                                id: crypto.randomUUID(),
                                fileName: file.name,
                                fileId,
                                startTime: 0,
                                endTime: duration,
                                src: URL.createObjectURL(file),
                                positionStart,
                                positionEnd,
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
                            lastEnd[mediaType] = positionEnd;
                        }
                        if (builtMediaFiles.length > 0) {
                            setPendingAssetMediaFiles((prev) => [...prev, ...builtMediaFiles]);
                        }
                    }
                }
                senders.sendInitAck({
                    sessionId: payload.sessionId,
                    ok: true,
                    ...(failed.length > 0 ? { failedAssets: failed } : {}),
                });
            } catch (e) {
                const message = e instanceof Error ? e.message : "unknown error";
                senders.sendInitError({
                    sessionId: payload.sessionId,
                    ok: false,
                    code: "INVALID_PAYLOAD",
                    message,
                });
            }
        },
        onClose: (payload) => {
            // CMS から強制クローズ要求。embed session をクリアして CMS が iframe を削除する想定。
            // TODO(Phase 1 後半): embed mode で取り込んだ IndexedDB の blob を削除する
            if (process.env.NODE_ENV !== "production") {
                console.log("[postMessage] close received", payload);
            }
            dispatch(clearEmbedSession());
        },
        onCancelExport: (payload) => {
            // Phase 1-4 で FFmpeg レンダリングのキャンセル処理に配線。
            if (process.env.NODE_ENV !== "production") {
                console.log("[postMessage] cancelExport received", payload);
            }
        },
    });

    useEffect(() => {
        if (!embedMode || bridgeReady) return;
        sendToParent("ready", {
            editorVersion: EDITOR_VERSION,
            minSupportedVersion: PROTOCOL_VERSION,
            recommendedVersion: PROTOCOL_VERSION,
        });
        setBridgeReady(true);
    }, [embedMode, bridgeReady]);

    useEffect(() => {
        const loadProject = async () => {
            if (typeof window === 'undefined') return;

            if (!id) {
                setError('Project ID is required.');
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            const existing = await getProject(id);
            if (existing) {
                dispatch(setCurrentProject(id));
            } else {
                const project = createBlankProject(id);
                await storeProject(project);
                dispatch(addProject(project));
            }
            setIsLoading(false);
        };
        loadProject();
    }, [id, dispatch]);

    useEffect(() => {
        const loadProject = async () => {
            if (currentProjectId) {
                const project = await getProject(currentProjectId);
                if (project) {
                    dispatch(rehydrate(project));

                    dispatch(setMediaFiles(await Promise.all(
                        project.mediaFiles.map(async (media: MediaFile) => {
                            const file = await getFile(media.fileId);
                            if (!file) {
                                return { ...media, src: "" };
                            }
                            return { ...media, src: URL.createObjectURL(file) };
                        })
                    )));

                    // rehydrate で IndexedDB の旧 projectName が反映されてしまうため、
                    // CMS から init.contentsTitle で受け取った値があれば再度上書きする。
                    if (pendingContentsTitleRef.current) {
                        dispatch(setProjectName(pendingContentsTitleRef.current));
                    }
                }
            }
        };
        loadProject();
    }, [dispatch, currentProjectId]);

    // init.assets でロードした fileId を Library に反映する。
    // rehydrate より onInit が後に走った場合に備え、currentProjectId 変化後にも再 dispatch する。
    // appendFilesID reducer は重複 fileId を skip するので二重 dispatch しても安全。
    useEffect(() => {
        if (pendingAssetFileIds.length === 0) return;
        dispatch(appendFilesID(pendingAssetFileIds));
    }, [dispatch, pendingAssetFileIds, currentProjectId]);

    // edit モードで受け取った既存動画を初期状態でタイムラインに add する。
    // rehydrate が走った後にも欠けていれば追加する（重複 fileId は除外、無限ループ防止）。
    useEffect(() => {
        if (pendingAssetMediaFiles.length === 0) return;
        const existingFileIds = new Set(projectState.mediaFiles.map((m) => m.fileId));
        const toAdd = pendingAssetMediaFiles.filter((m) => !existingFileIds.has(m.fileId));
        if (toAdd.length === 0) return;
        dispatch(setMediaFiles([...projectState.mediaFiles, ...toAdd]));
    }, [dispatch, pendingAssetMediaFiles, projectState.mediaFiles, currentProjectId]);

    useEffect(() => {
        const saveProject = async () => {
            if (!projectState || projectState.id !== currentProjectId) return;
            await storeProject(projectState);
            dispatch(updateProject(projectState));
        };
        saveProject();
    }, [projectState, currentProjectId, dispatch]);

    const handleFocus = (section: "media" | "text" | "export") => {
        dispatch(setActiveSection(section));
    };

    if (error) {
        return (
            <div className="flex items-center justify-center h-screen bg-black text-white">
                <div className="text-center px-6">
                    <h1 className="text-2xl font-bold mb-2">Error</h1>
                    <p className="text-gray-300">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen select-none">
            {
                isLoading ? (
                    <div className="fixed inset-0 flex items-center bg-black bg-opacity-50 justify-center z-50">
                        <div className="bg-black bg-opacity-70 p-6 rounded-lg flex flex-col items-center">
                            <div className="w-16 h-16 border-4 border-t-white border-r-white border-opacity-30 border-t-opacity-100 rounded-full animate-spin"></div>
                            <p className="mt-4 text-white text-lg">Loading project...</p>
                        </div>
                    </div>
                ) : null
            }
            <div className="flex flex-1 overflow-hidden">
                <div className="flex-[0.1] min-w-[60px] max-w-[100px] border-r border-gray-700 overflow-y-auto p-4">
                    <div className="flex flex-col space-y-2">
                        <HomeButton />
                        <TextButton onClick={() => handleFocus("text")} />
                        <LibraryButton onClick={() => handleFocus("media")} />
                        <ExportButton onClick={() => handleFocus("export")} />
                    </div>
                </div>

                <div className="flex-[0.3] min-w-[200px] border-r border-gray-800 overflow-y-auto p-4">
                    {activeSection === "media" && (
                        <div>
                            <h2 className="text-lg flex flex-row gap-2 items-center justify-center font-semibold mb-2">
                                <AddMedia />
                            </h2>
                            <MediaList />
                        </div>
                    )}
                    {activeSection === "text" && (
                        <div>
                            <AddText />
                        </div>
                    )}
                    {activeSection === "export" && (
                        <div>
                            <h2 className="text-lg font-semibold mb-4">Export</h2>
                            <ExportList />
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-center flex-col flex-[1] overflow-hidden">
                    <ProjectName />
                    <PreviewPlayer />
                </div>

                <div className="flex-[0.4] min-w-[200px] border-l border-gray-800 overflow-y-auto p-4">
                    {activeElement === "media" && (
                        <div>
                            <h2 className="text-lg font-semibold mb-4">Media Properties</h2>
                            <MediaProperties />
                        </div>
                    )}
                    {activeElement === "text" && (
                        <div>
                            <h2 className="text-lg font-semibold mb-4">Text Properties</h2>
                            <TextProperties />
                        </div>
                    )}
                </div>
            </div>
            <div className="flex flex-row border-t border-gray-500">
                <div className=" bg-darkSurfacePrimary flex flex-col items-center justify-center mt-20">
                    <div className="relative h-16">
                        <div className="flex items-center gap-2 p-4">
                            <Image
                                alt="Video"
                                className="invert h-auto w-auto max-w-[30px] max-h-[30px]"
                                height={30}
                                width={30}
                                src="https://www.svgrepo.com/show/532727/video.svg"
                            />
                        </div>
                    </div>
                    <div className="relative h-16">
                        <div className="flex items-center gap-2 p-4">
                            <Image
                                alt="Video"
                                className="invert h-auto w-auto max-w-[30px] max-h-[30px]"
                                height={30}
                                width={30}
                                src="https://www.svgrepo.com/show/532708/music.svg"
                            />
                        </div>
                    </div>
                    <div className="relative h-16">
                        <div className="flex items-center gap-2 p-4">
                            <Image
                                alt="Video"
                                className="invert h-auto w-auto max-w-[30px] max-h-[30px]"
                                height={30}
                                width={30}
                                src="https://www.svgrepo.com/show/535454/image.svg"
                            />
                        </div>
                    </div>
                    <div className="relative h-16">
                        <div className="flex items-center gap-2 p-4">
                            <Image
                                alt="Video"
                                className="invert h-auto w-auto max-w-[30px] max-h-[30px]"
                                height={30}
                                width={30}
                                src="https://www.svgrepo.com/show/535686/text.svg"
                            />
                        </div>
                    </div>
                </div>
                <Timeline />
            </div>
        </div>
    );
}

export default function EditorPage() {
    return (
        <Suspense fallback={
            <div className="fixed inset-0 flex items-center bg-black bg-opacity-50 justify-center z-50">
                <div className="bg-black bg-opacity-70 p-6 rounded-lg flex flex-col items-center">
                    <div className="w-16 h-16 border-4 border-t-white border-r-white border-opacity-30 border-t-opacity-100 rounded-full animate-spin"></div>
                    <p className="mt-4 text-white text-lg">Loading editor...</p>
                </div>
            </div>
        }>
            <EditorInner />
        </Suspense>
    );
}
