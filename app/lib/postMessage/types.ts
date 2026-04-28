/**
 * Short Editor postMessage プロトコル v1.3 型定義
 *
 * 仕様: docs/plan/TIG_PF-10627_short_editor/postmessage_protocol.md
 *
 * すべてのメッセージは ShortEditorMessage<T> エンベロープに包まれる。
 * `protocol` と `version` が一致しないものは silently drop。
 *
 * v1.3: edit モードでコンテンツタイトル双方向同期を追加 (init.contentsTitle, exportComplete.title)
 */

export const PROTOCOL = "tig-short-editor" as const;
export const PROTOCOL_VERSION = "1.3" as const;

/**
 * Editor アプリのバージョン。`ready` payload の editorVersion 等に使う。
 * プロトコルバージョン (PROTOCOL_VERSION) とは独立して管理する。
 * package.json の version と同期させる（手動更新 or 将来 build で注入）。
 */
export const EDITOR_VERSION = "0.1.0" as const;

export type ErrorCode =
    | "INVALID_ORIGIN"
    | "INVALID_PROTOCOL"
    | "INVALID_PAYLOAD"
    | "SESSION_MISMATCH"
    | "ASSET_FETCH_FAILED"
    | "ASSET_URL_EXPIRED"
    | "RENDER_FAILED"
    | "UPLOAD_FAILED"
    | "UPLOAD_URL_EXPIRED"
    | "CANCELLED"
    | "PROJECT_ID_REQUIRED"
    | "UNKNOWN";

export interface ShortEditorMessage<T = unknown> {
    protocol: typeof PROTOCOL;
    version: typeof PROTOCOL_VERSION;
    type: string;
    requestId?: string;
    payload: T;
}

// ========================================
// CMS → iframe payloads
// ========================================

export interface AssetInput {
    id: string;
    kind: "video" | "audio" | "image";
    url: string;
    urlExpiresAt: string;
    mime: string;
    fileName: string;
    duration?: number;
    width?: number;
    height?: number;
}

export interface UploadConfig {
    putUrl: string;
    putUrlExpiresAt: string;
    s3Key: string;
    contentType: string;
    thumbnailPutUrl: string;
    thumbnailS3Key: string;
    thumbnailContentType: string;
}

export interface SubtitleInput {
    text: string;
    startTime: number;
    endTime: number;
    style?: {
        font?: string;
        fontSize?: number;
        color?: string;
        backgroundColor?: string;
        align?: "left" | "center" | "right";
    };
}

export interface UiConfig {
    locale?: "ja" | "en";
    resolution?: { width: number; height: number };
    fps?: number;
    aspectRatio?: string;
}

export interface InitPayload {
    mode: "new" | "edit";
    sessionId: string;
    contentId?: number;
    /**
     * CMS から受け取るコンテンツタイトル（edit モード時に既存タイトルを引き継ぐ）。
     * 受信時は Redux の projectName にセットされ、IndexedDB に永続化される。
     */
    contentsTitle?: string;
    assets: AssetInput[];
    upload: UploadConfig;
    subtitles?: SubtitleInput[];
    ui?: UiConfig;
}

export interface ClosePayload {
    reason: "user" | "timeout" | "error" | "cancelled";
    message?: string;
}

export interface CancelExportPayload {
    sessionId: string;
    reason?: string;
}

// ========================================
// iframe → CMS payloads
// ========================================

export interface ReadyPayload {
    editorVersion: string;
    minSupportedVersion: string;
    recommendedVersion: string;
}

export interface InitAckPayload {
    sessionId: string;
    ok: true;
    failedAssets?: { id: string; reason: string }[];
}

export interface InitErrorPayload {
    sessionId: string;
    ok: false;
    code: ErrorCode;
    message: string;
}

export interface ExportStartPayload {
    sessionId: string;
    estimatedDurationMs?: number;
}

export interface ExportProgressPayload {
    sessionId: string;
    progress: number;
    phase?: "decoding" | "encoding" | "uploading";
}

export interface ExportCompletePayload {
    sessionId: string;
    s3Key: string;
    thumbnailS3Key: string;
    fileName: string;
    fileSize: number;
    duration: number;
    width: number;
    height: number;
    mimeType: string;
    /**
     * Editor 上で編集された最終タイトル。CMS で contents.title として保存される想定。
     * `init.contentsTitle` で受け取った値、もしくはユーザーが Editor 上で編集した値。
     */
    title?: string;
    textElements?: SubtitleInput[];
}

export interface ExportErrorPayload {
    sessionId: string;
    code: ErrorCode;
    message: string;
    detail?: string;
}

export interface CloseRequestPayload {
    sessionId: string;
    dirty: boolean;
}

export interface ErrorPayload {
    code: ErrorCode;
    message: string;
    detail?: string;
}

// ========================================
// Discriminated union of inbound message types
// ========================================

export type InboundMessage =
    | (ShortEditorMessage<InitPayload> & { type: "init" })
    | (ShortEditorMessage<ClosePayload> & { type: "close" })
    | (ShortEditorMessage<CancelExportPayload> & { type: "cancelExport" });

export type InboundType = InboundMessage["type"];
