import React, { useEffect, useRef } from 'react';
import { useAppSelector } from '../../../store';
import { MAX_PROJECT_DURATION } from '../../../lib/limits';
export const Header = () => {
    const { duration, currentTime, timelineZoom, enableMarkerTracking } = useAppSelector((state) => state.projectState);
    const secondInterval = 0.2; // Every 0.2s
    const totalSeconds = Math.max(duration + 2, MAX_PROJECT_DURATION + 2);
    const tickMarkers = Array.from({ length: totalSeconds / secondInterval }, (_, i) => i * secondInterval);

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
                {/* 動画長上限ガイド（TIG_PF-10675） */}
                <div
                    className="absolute top-0 bottom-0 z-10 pointer-events-none"
                    style={{ left: `${MAX_PROJECT_DURATION * timelineZoom}px` }}
                >
                    <div className="w-0.5 h-full bg-red-500/70" />
                    <span className="absolute -top-3 left-1 text-[10px] text-red-500 whitespace-nowrap">
                        上限 {MAX_PROJECT_DURATION}s
                    </span>
                </div>
                {tickMarkers.map((marker) => {
                    const isWholeSecond = Number.isInteger(marker) && marker !== 0;
                    return (
                        <div
                            ref={(el) => {
                                if (el) markerRefs.current[marker] = el;
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
                            <div className={`w-px ${isWholeSecond ? 'h-7 bg-gray-400' : 'h-2 bg-gray-300'}`} />

                            {/* second labels */}
                            {isWholeSecond && (
                                <span className="mt-1 text-[10px] text-gray-400 cursor-default">
                                    {marker}s
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