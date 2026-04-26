"use client";

import { useEffect, useRef } from "react";
import { parseInboundMessage, sendToParent } from "./bridge";
import type {
    CancelExportPayload,
    ClosePayload,
    CloseRequestPayload,
    ErrorPayload,
    ExportCompletePayload,
    ExportErrorPayload,
    ExportProgressPayload,
    ExportStartPayload,
    InboundMessage,
    InitAckPayload,
    InitErrorPayload,
    InitPayload,
    ReadyPayload,
} from "./types";

export interface PostMessageSenders {
    sendReady: (payload: ReadyPayload) => void;
    sendInitAck: (payload: InitAckPayload, requestId?: string) => void;
    sendInitError: (payload: InitErrorPayload, requestId?: string) => void;
    sendExportStart: (payload: ExportStartPayload) => void;
    sendExportProgress: (payload: ExportProgressPayload) => void;
    sendExportComplete: (payload: ExportCompletePayload) => void;
    sendExportError: (payload: ExportErrorPayload) => void;
    sendCloseRequest: (payload: CloseRequestPayload) => void;
    sendError: (payload: ErrorPayload) => void;
}

export interface InboundHandlers {
    onInit?: (payload: InitPayload, msg: InboundMessage, senders: PostMessageSenders) => void;
    onClose?: (payload: ClosePayload, msg: InboundMessage, senders: PostMessageSenders) => void;
    onCancelExport?: (payload: CancelExportPayload, msg: InboundMessage, senders: PostMessageSenders) => void;
}

/**
 * 送信ヘルパー（無条件版）。enabled かどうかは購読側 Hook が制御するため、
 * このオブジェクト自体はモジュールレベルの安定参照として共有できる。
 */
const SENDERS: PostMessageSenders = {
    sendReady: (p) => sendToParent("ready", p),
    sendInitAck: (p, requestId) => sendToParent("initAck", p, requestId),
    sendInitError: (p, requestId) => sendToParent("initError", p, requestId),
    sendExportStart: (p) => sendToParent("exportStart", p),
    sendExportProgress: (p) => sendToParent("exportProgress", p),
    sendExportComplete: (p) => sendToParent("exportComplete", p),
    sendExportError: (p) => sendToParent("exportError", p),
    sendCloseRequest: (p) => sendToParent("closeRequest", p),
    sendError: (p) => sendToParent("error", p),
};

/**
 * postMessage ブリッジを購読する Hook。
 *
 * - `enabled = false`（embed mode でない時）はリスナーを設置しない。
 * - `handlers` は ref に保持して最新版を呼ぶため、毎回再購読しない。
 * - 送信は handlers に第3引数で渡される `senders` か、`sendToParent` を直接使う。
 */
export function usePostMessageBridge(
    enabled: boolean,
    handlers: InboundHandlers
): void {
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;

    useEffect(() => {
        if (!enabled || typeof window === "undefined") return;

        const listener = (event: MessageEvent) => {
            const msg = parseInboundMessage(event);
            if (!msg) return;
            switch (msg.type) {
                case "init":
                    handlersRef.current.onInit?.(msg.payload, msg, SENDERS);
                    break;
                case "close":
                    handlersRef.current.onClose?.(msg.payload, msg, SENDERS);
                    break;
                case "cancelExport":
                    handlersRef.current.onCancelExport?.(msg.payload, msg, SENDERS);
                    break;
            }
        };

        window.addEventListener("message", listener);
        return () => window.removeEventListener("message", listener);
    }, [enabled]);
}
