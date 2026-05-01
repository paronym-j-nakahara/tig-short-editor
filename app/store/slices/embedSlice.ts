import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { UploadConfig } from "@/app/lib/postMessage/types";

/**
 * embed mode のセッション情報を保持する slice。
 * `init` 受信時にセットされ、FfmpegRender などレンダリング系コンポーネントが
 * `upload` を参照して S3 PUT 先を解決する。
 */
export interface EmbedState {
    sessionId: string | null;
    upload: UploadConfig | null;
    /**
     * CMS から init.ui.resolution で受け取った Player キャンバス解像度。
     * 縦動画 (9:16) のとき { width: 1080, height: 1920 } などが入る。
     * null のとき Editor のデフォルト (1920x1080) を使用。
     */
    playerResolution: { width: number; height: number } | null;
}

const initialState: EmbedState = {
    sessionId: null,
    upload: null,
    playerResolution: null,
};

const embedSlice = createSlice({
    name: "embed",
    initialState,
    reducers: {
        setEmbedSession: (
            state,
            action: PayloadAction<{
                sessionId: string;
                upload: UploadConfig;
                playerResolution?: { width: number; height: number } | null;
            }>
        ) => {
            state.sessionId = action.payload.sessionId;
            state.upload = action.payload.upload;
            if (action.payload.playerResolution !== undefined) {
                state.playerResolution = action.payload.playerResolution;
            }
        },
        clearEmbedSession: (state) => {
            state.sessionId = null;
            state.upload = null;
            state.playerResolution = null;
        },
        /**
         * Player キャンバス解像度のみを更新する（embed セッション情報は触らない）。
         * standalone (non-embed) モードで最初に Add Media された動画の画角に
         * Composition を合わせる用途で使用する（TIG_PF-10686）。
         */
        setPlayerResolution: (state, action: PayloadAction<{ width: number; height: number } | null>) => {
            state.playerResolution = action.payload;
        },
    },
});

export const { setEmbedSession, clearEmbedSession, setPlayerResolution } = embedSlice.actions;
export default embedSlice.reducer;
