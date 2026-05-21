// タイムラインの段階ズーム定義 (TIG_PF-10705)
// 各レベルで major tick 間隔の見た目幅 (px) を固定し、そこから px/sec を逆算している。
// 例: 100% は major=10s を 200px で表示したいので 200/10 = 20 px/sec。
const MAJOR_TICK_PX = 200;

export type LabelUnit = 'sec' | 'min';

export interface ZoomLevel {
    percent: number;
    pxPerSec: number;
    minorSec: number;
    majorSec: number;
    labelUnit: LabelUnit;
}

export const ZOOM_LEVELS: readonly ZoomLevel[] = [
    { percent: 0,   pxPerSec: MAJOR_TICK_PX / 600, minorSec: 120, majorSec: 600, labelUnit: 'min' },
    { percent: 25,  pxPerSec: MAJOR_TICK_PX / 300, minorSec: 60,  majorSec: 300, labelUnit: 'min' },
    { percent: 50,  pxPerSec: MAJOR_TICK_PX / 60,  minorSec: 10,  majorSec: 60,  labelUnit: 'sec' },
    { percent: 75,  pxPerSec: MAJOR_TICK_PX / 30,  minorSec: 5,   majorSec: 30,  labelUnit: 'sec' },
    { percent: 100, pxPerSec: MAJOR_TICK_PX / 10,  minorSec: 1,   majorSec: 10,  labelUnit: 'sec' },
] as const;

export const DEFAULT_ZOOM_INDEX = 2;
export const DEFAULT_TIMELINE_ZOOM = ZOOM_LEVELS[DEFAULT_ZOOM_INDEX].pxPerSec;

// 既存 IndexedDB に保存済みの旧 pxPerSec 値 (例: 30) を、現行 5 段階で最も近いインデックスに丸める。
export const findNearestZoomIndex = (pxPerSec: number): number => {
    let nearest = 0;
    let minDiff = Number.POSITIVE_INFINITY;
    for (let i = 0; i < ZOOM_LEVELS.length; i++) {
        const diff = Math.abs(ZOOM_LEVELS[i].pxPerSec - pxPerSec);
        if (diff < minDiff) {
            minDiff = diff;
            nearest = i;
        }
    }
    return nearest;
};

export const findNearestZoomLevel = (pxPerSec: number): ZoomLevel =>
    ZOOM_LEVELS[findNearestZoomIndex(pxPerSec)];
