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
}

const initialState: EmbedState = {
    sessionId: null,
    upload: null,
};

const embedSlice = createSlice({
    name: "embed",
    initialState,
    reducers: {
        setEmbedSession: (
            state,
            action: PayloadAction<{ sessionId: string; upload: UploadConfig }>
        ) => {
            state.sessionId = action.payload.sessionId;
            state.upload = action.payload.upload;
        },
        clearEmbedSession: (state) => {
            state.sessionId = null;
            state.upload = null;
        },
    },
});

export const { setEmbedSession, clearEmbedSession } = embedSlice.actions;
export default embedSlice.reducer;
