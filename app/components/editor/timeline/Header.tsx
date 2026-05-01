import React, { useEffect, useRef } from 'react';
import { useAppSelector } from '../../../store';

const MIN_TIMELINE_DURATION_SEC = 60;
// timelineZoom (px/sec) がこの値以下なら分単位の目盛りに切替（TIG_PF-10686）
const MINUTE_SCALE_ZOOM_THRESHOLD = 10;
// DOM ノード爆発防止の上限（180s 制限撤廃で長尺素材も扱うため、上限なしだと数万ノードに）
const MAX_TICK_COUNT = 2000;

export const Header = () => {
    const { duration, currentTime, timelineZoom, enableMarkerTracking } = useAppSelector((state) => state.projectState);

    // タイムライン目盛りは最低 60s 表示。素材が長ければそれに合わせて伸びる。
    const totalSeconds = Math.max(duration + 2, MIN_TIMELINE_DURATION_SEC);
    const isMinuteScale = timelineZoom < MINUTE_SCALE_ZOOM_THRESHOLD;

    // ティック生成: 分単位なら 10s 間隔（細）+ 60s ごと太線、秒単位なら 0.2s 間隔（細）+ 1s ごと太線。
    // tickCount は MAX_TICK_COUNT で頭打ち（長尺素材の DOM 爆発防止）。
    const minorInterval = isMinuteScale ? 10 : 0.2;
    const majorInterval = isMinuteScale ? 60 : 1;
    const tickCount = Math.min(Math.floor(totalSeconds / minorInterval) + 1, MAX_TICK_COUNT);
    const tickMarkers = Array.from({ length: tickCount }, (_, i) => Number((i * minorInterval).toFixed(2)));

    const isMajorTick = (marker: number) => marker !== 0 && Math.abs(marker % majorInterval) < 1e-6;
    const labelFor = (marker: number) =>
        isMinuteScale ? `${Math.round(marker / 60)}m` : `${marker}s`;

    // to track the marker when time changes
    const markerRefs = useRef<HTMLDivElement[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const roundedTime = Math.floor(currentTime);
        const el = markerRefs.current[roundedTime];
        if (el && el.scrollIntoView && enableMarkerTracking) {
            el.scrollIntoView({
                behavior: 'smooth',
                inline: 'center',
                block: 'nearest',
            });
        }
    }, [currentTime]);

    return (
        <div className="flex items-center py-2 w-full" ref={containerRef}>
            <div className="relative h-8">
                {tickMarkers.map((marker) => {
                    const major = isMajorTick(marker);
                    return (
                        <div
                            // 追従スクロール用 ref は major tick（秒スケール: 1s ごと、分スケール: 60s ごと）
                            // のみ登録し、minor tick は登録しない。Math.floor で同じインデックスに上書き
                            // されるのを防ぐ。
                            ref={(el) => {
                                if (el && major) markerRefs.current[Math.round(marker)] = el;
                            }}
                            key={marker}
                            className="absolute flex flex-col items-center"
                            style={{
                                left: `${marker * timelineZoom}px`,
                                width: `1px`,
                                height: '100%',
                            }}
                        >
                            {/* Tick line */}
                            <div className={`w-px ${major ? 'h-7 bg-gray-400' : 'h-2 bg-gray-300'}`} />

                            {/* second/minute labels */}
                            {major && (
                                <span className="mt-1 text-[10px] text-gray-400 cursor-default">
                                    {labelFor(marker)}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>

    );
};

export default Header;
