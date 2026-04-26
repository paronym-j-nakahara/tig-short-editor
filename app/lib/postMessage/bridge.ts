/**
 * Short Editor postMessage ブリッジコア
 *
 * 仕様: docs/plan/TIG_PF-10627_short_editor/postmessage_protocol.md
 *
 * - 送信: parent window への postMessage。`init` 受信時に記録した parent origin を
 *   target に使う（フォールバックとして allowlist の先頭）。
 * - 受信: window.message リスナーで origin / protocol / version を guard。
 *   許可 origin リストが空の場合は **fail-secure に silently drop**（HIGH 指摘対応）。
 * - origin 許可リストは Phase 1-6 で env (NEXT_PUBLIC_ALLOWED_CMS_ORIGINS) から注入予定。
 *   現状は dev 環境専用のフォールバックを持つが、production ビルドでは env 必須。
 */

import {
    PROTOCOL,
    PROTOCOL_VERSION,
    InboundMessage,
    ShortEditorMessage,
} from "./types";

let knownParentOrigin: string | null = null;

/**
 * `init` などの inbound メッセージ受信時に記録した parent origin を取得する。
 * Phase 1-6 完了までのフォールバック解決にも使う。
 */
export function getKnownParentOrigin(): string | null {
    return knownParentOrigin;
}

/**
 * テスト/リセット用。
 */
export function _resetKnownParentOrigin(): void {
    knownParentOrigin = null;
}

/**
 * ALLOWED_CMS_ORIGINS を取得する。
 * Phase 1-6 で env 注入に置き換え予定。dev では localhost フォールバックを許可する。
 */
export function getAllowedCmsOrigins(): string[] {
    const fromEnv = process.env.NEXT_PUBLIC_ALLOWED_CMS_ORIGINS;
    if (fromEnv) {
        return fromEnv.split(",").map((o) => o.trim()).filter(Boolean);
    }
    if (process.env.NODE_ENV === "development") {
        return [
            "http://localhost:8080",
            "http://localhost:5500",
            "http://127.0.0.1:5500",
        ];
    }
    return [];
}

/**
 * 送信先 targetOrigin を解決する。優先順位:
 * 1. `init` 等で記録した parent origin（許可リスト内のもの）
 * 2. allowlist の先頭（dev フォールバック / Phase 1-6 までの暫定）
 * いずれも null の場合は呼び出し元で send を諦める。
 */
export function resolveTargetOrigin(): string | null {
    const allowed = getAllowedCmsOrigins();
    if (knownParentOrigin && allowed.includes(knownParentOrigin)) {
        return knownParentOrigin;
    }
    return allowed[0] ?? null;
}

/**
 * parent window にメッセージを送る。embed mode 時のみ呼ばれる前提。
 * targetOrigin が解決できない場合は no-op + console.warn。
 */
export function sendToParent<T>(
    type: string,
    payload: T,
    requestId?: string
): void {
    if (typeof window === "undefined" || window.parent === window) {
        return;
    }
    const targetOrigin = resolveTargetOrigin();
    if (!targetOrigin) {
        console.warn(
            `[postMessage] No allowed CMS origin configured; cannot send "${type}". ` +
            `Set NEXT_PUBLIC_ALLOWED_CMS_ORIGINS in production.`
        );
        return;
    }
    const message: ShortEditorMessage<T> = {
        protocol: PROTOCOL,
        version: PROTOCOL_VERSION,
        type,
        ...(requestId ? { requestId } : {}),
        payload,
    };
    window.parent.postMessage(message, targetOrigin);
}

/**
 * 受信したメッセージが本プロトコルの有効な inbound メッセージかを判定する guard。
 * fail-secure: 許可 origin が空の場合は silently drop（HIGH-1 対応）。
 */
export function parseInboundMessage(
    event: MessageEvent
): InboundMessage | null {
    const allowed = getAllowedCmsOrigins();
    if (allowed.length === 0) {
        // production で env 未設定 → 全 origin を拒否（embed mode を実質無効化）
        return null;
    }
    if (!allowed.includes(event.origin)) {
        return null;
    }

    const data = event.data;
    if (!data || typeof data !== "object") return null;
    if (data.protocol !== PROTOCOL) return null;
    if (data.version !== PROTOCOL_VERSION) return null;
    if (typeof data.type !== "string") return null;

    if (data.type === "init" || data.type === "close" || data.type === "cancelExport") {
        // 受理時点で parent origin を記録（以降の send で利用、MEDIUM-1 対応）
        knownParentOrigin = event.origin;
        return data as InboundMessage;
    }

    if (process.env.NODE_ENV !== "production") {
        console.warn(`[postMessage] Unknown inbound type "${data.type}"`);
    }
    return null;
}
