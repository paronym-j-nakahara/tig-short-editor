/**
 * embed mode の `init.assets[]` を S3 署名付き GET URL から fetch して
 * IndexedDB (`storeFile`) に取り込むヘルパー。
 *
 * 仕様: docs/plan/TIG_PF-10627_short_editor/postmessage_protocol.md §5.1
 *
 * - 並列で各 asset を fetch（Promise.all）。30 秒で AbortController によるタイムアウト
 * - urlExpiresAt が過去の場合は即座に失敗扱い。空/不正文字列 (NaN) は期限不明とみなし fetch を試みる
 * - fetch 失敗時は failedAssets として呼び出し元に返す（initAck.failedAssets で CMS へ返却される）
 * - 成功時は IndexedDB に保存して fileId を返却。Library 側 `MediaList` がこの fileId で表示する
 */

import { storeFile } from "../../store";
import type { AssetInput } from "./types";

const FETCH_TIMEOUT_MS = 30_000;

export interface LoadedAsset {
    fileId: string;
    asset: AssetInput;
}

export interface FailedAsset {
    id: string;
    reason: string;
}

export interface LoadAssetsResult {
    loaded: LoadedAsset[];
    failed: FailedAsset[];
}

export async function loadAssetsFromUrls(
    assets: AssetInput[]
): Promise<LoadAssetsResult> {
    const results = await Promise.all(
        assets.map(async (asset): Promise<LoadedAsset | FailedAsset> => {
            const expires = Date.parse(asset.urlExpiresAt);
            // NaN (= 期限不明 / 空文字 / 不正形式) の場合はガードを通す。
            // CMS 側で必ず ISO8601 を入れる契約だが、欠落時に fetch が試行されることを許容。
            if (Number.isFinite(expires) && expires <= Date.now()) {
                return { id: asset.id, reason: "URL_EXPIRED" };
            }

            try {
                const res = await fetch(asset.url, {
                    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                });
                if (!res.ok) {
                    return { id: asset.id, reason: `HTTP_${res.status}` };
                }
                const blob = await res.blob();
                const file = new File([blob], asset.fileName, {
                    type: asset.mime || blob.type,
                });
                const fileId = crypto.randomUUID();
                const stored = await storeFile(file, fileId);
                if (!stored) {
                    return { id: asset.id, reason: "INDEXEDDB_WRITE_FAILED" };
                }
                return { fileId, asset };
            } catch (e) {
                const reason =
                    e instanceof DOMException && e.name === "TimeoutError"
                        ? "FETCH_TIMEOUT"
                        : e instanceof Error
                            ? e.message
                            : "FETCH_FAILED";
                return { id: asset.id, reason };
            }
        })
    );

    const loaded: LoadedAsset[] = [];
    const failed: FailedAsset[] = [];
    for (const r of results) {
        if ("fileId" in r) loaded.push(r);
        else failed.push(r);
    }
    return { loaded, failed };
}
