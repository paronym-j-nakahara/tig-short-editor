"use client";
import { Suspense, useEffect, useState } from "react";
import { getFile, storeProject, useAppDispatch, useAppSelector } from "../../store";
import { getProject } from "../../store";
import { createBlankProject } from "../../store/projectFactory";
import { addProject, setCurrentProject, updateProject } from "../../store/slices/projectsSlice";
import { rehydrate, setMediaFiles } from '../../store/slices/projectSlice';
import { setActiveSection } from "../../store/slices/projectSlice";
import { useEmbedMode } from "@/app/lib/useEmbedMode";
import { usePostMessageBridge } from "@/app/lib/postMessage/usePostMessageBridge";
import { sendToParent } from "@/app/lib/postMessage/bridge";
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

    const { activeSection, activeElement } = projectState;

    usePostMessageBridge(embedMode, {
        onInit: (payload, _msg, senders) => {
            // Phase 1-3 で assets を S3 から fetch して Redux に展開する。
            // 現状はエンベロープ疎通確認のため initAck を返すのみ。
            if (process.env.NODE_ENV !== "production") {
                console.log("[postMessage] init received", payload);
            }
            senders.sendInitAck({ sessionId: payload.sessionId, ok: true });
        },
        onClose: (payload) => {
            // CMS から強制クローズ要求。embed mode では CMS が iframe を削除するので
            // 内部状態のクリーンアップのみ行う想定（Phase 1 後半で配線）。
            if (process.env.NODE_ENV !== "production") {
                console.log("[postMessage] close received", payload);
            }
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
                }
            }
        };
        loadProject();
    }, [dispatch, currentProjectId]);

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
