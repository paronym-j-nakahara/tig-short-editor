import { storeProject, useAppDispatch, useAppSelector } from "@/app/store";
import { SequenceItem } from "./sequence-item";
import { MediaFile, TextElement } from "@/app/types";
import { Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import React, { use, useCallback, useEffect, useRef, useState } from "react";
import { setCurrentTime, setMediaFiles } from "@/app/store/slices/projectSlice";
import { FEATURE_FLAGS } from "@/app/lib/featureFlags";
import { VideoContent } from "./items/video-sequence-item";

// 隣接 video クリップ間に挿入する fade トランジションの長さ (秒) (TIG_PF-10733 POC)。
const TRANSITION_DURATION_SEC = 1;
// 隣接判定の許容誤差 (秒)。positionEnd と次の positionStart の浮動小数誤差を吸収。
const ADJACENT_EPSILON_SEC = 0.01;

/** 時系列順の video 配列を「positionEnd ≒ 次の positionStart」で連続する塊に分割する。 */
const groupAdjacentVideos = (videos: MediaFile[]): MediaFile[][] => {
    const groups: MediaFile[][] = [];
    for (const v of videos) {
        const last = groups[groups.length - 1];
        if (last && Math.abs(last[last.length - 1].positionEnd - v.positionStart) < ADJACENT_EPSILON_SEC) {
            last.push(v);
        } else {
            groups.push([v]);
        }
    }
    return groups;
};

const Composition = () => {
    const projectState = useAppSelector((state) => state.projectState);
    const { mediaFiles, textElements } = projectState;
    const frame = useCurrentFrame();
    const dispatch = useAppDispatch();

    const THRESHOLD = 0.1; // Minimum change to trigger dispatch (in seconds)
    const previousTime = useRef(0); // Store previous time to track changes

    useEffect(() => {
        const currentTimeInSeconds = frame / fps;
        if (Math.abs(currentTimeInSeconds - previousTime.current) > THRESHOLD) {
            if (currentTimeInSeconds !== undefined) {
                dispatch(setCurrentTime(currentTimeInSeconds));
            }
        }

    }, [frame, dispatch]);

    const fps = 30;

    if (FEATURE_FLAGS.enableTransitions) {
        // 隣接する video 群を TransitionSeries (fade) で繋ぐ。video 以外は通常 sequence。
        const videos = mediaFiles
            .filter((m) => m.type === 'video')
            .slice()
            .sort((a, b) => a.positionStart - b.positionStart);
        const nonVideos = mediaFiles.filter((m) => m.type !== 'video');
        const transitionFrames = Math.max(1, Math.floor(TRANSITION_DURATION_SEC * fps));
        const groups = groupAdjacentVideos(videos);
        return (
            <>
                {groups.map((group, gi) => {
                    if (group.length === 1) {
                        // 単独 video はトランジション不要。通常 Sequence で描画。
                        return SequenceItem['video']({ ...group[0] }, { fps });
                    }
                    const groupFrom = Math.floor(group[0].positionStart * fps);
                    return (
                        <Sequence key={`tgrp-${gi}`} from={groupFrom}>
                            <TransitionSeries>
                                {group.flatMap((clip, ci) => {
                                    const clipFrames = Math.max(
                                        1,
                                        Math.floor((clip.positionEnd - clip.positionStart) * fps)
                                    );
                                    const nodes: React.ReactNode[] = [];
                                    if (ci > 0) {
                                        nodes.push(
                                            <TransitionSeries.Transition
                                                key={`${clip.id}-trans`}
                                                presentation={fade()}
                                                timing={linearTiming({ durationInFrames: transitionFrames })}
                                            />
                                        );
                                    }
                                    nodes.push(
                                        <TransitionSeries.Sequence
                                            key={clip.id}
                                            durationInFrames={clipFrames}
                                        >
                                            <VideoContent item={clip} fps={fps} />
                                        </TransitionSeries.Sequence>
                                    );
                                    return nodes;
                                })}
                            </TransitionSeries>
                        </Sequence>
                    );
                })}
                {nonVideos.map((item: MediaFile) => {
                    if (!item) return null;
                    return SequenceItem[item.type]({ ...item }, { fps });
                })}
                {textElements.map((item: TextElement) => {
                    if (!item) return null;
                    return SequenceItem['text']({ ...item }, { fps });
                })}
            </>
        );
    }

    return (
        <>
            {mediaFiles
                .map((item: MediaFile) => {
                    if (!item) return;
                    const trackItem = {
                        ...item,
                    } as MediaFile;
                    return SequenceItem[trackItem.type](trackItem, {
                        fps
                    });
                })}
            {textElements
                .map((item: TextElement) => {
                    if (!item) return;
                    const trackItem = {
                        ...item,
                    } as TextElement;
                    return SequenceItem["text"](trackItem, {
                        fps
                    });
                })}
        </>
    );
};

export default Composition;
