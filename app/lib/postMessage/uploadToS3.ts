/**
 * S3 署名付き PUT URL に Blob をアップロードするヘルパー。
 *
 * 仕様: docs/plan/TIG_PF-10627_short_editor/api_endpoints.md §7.2
 *
 * - 署名時にバインドされた Content-Type を必ず一致させる必要あり（不一致だと 403）
 * - XMLHttpRequest で `upload.onprogress` を購読し、進捗を 0.0〜1.0 で通知
 * - 失敗時は HTTP_<status> または例外メッセージを reason に含めて throw
 */

export interface UploadResult {
    s3Key: string;
    fileSize: number;
}

export interface UploadOptions {
    /** 署名付き PUT URL */
    putUrl: string;
    /** 署名時にバインドされた Content-Type と一致させる */
    contentType: string;
    /** complete 時に CMS へ返すための論理キー（呼び出し元の init.upload.s3Key を渡す） */
    s3Key: string;
    /** PUT 対象 Blob */
    blob: Blob;
    /** 進捗コールバック（0.0〜1.0）。未指定なら通知しない */
    onProgress?: (progress: number) => void;
    /** AbortSignal（cancelExport 連動など） */
    signal?: AbortSignal;
}

export function uploadBlobToSignedUrl(
    options: UploadOptions
): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", options.putUrl);
        xhr.setRequestHeader("Content-Type", options.contentType);

        if (options.onProgress) {
            xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable) {
                    options.onProgress!(e.loaded / e.total);
                }
            });
        }

        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve({ s3Key: options.s3Key, fileSize: options.blob.size });
            } else {
                reject(new Error(`HTTP_${xhr.status}`));
            }
        });

        xhr.addEventListener("error", () =>
            reject(new Error("UPLOAD_NETWORK_ERROR"))
        );
        xhr.addEventListener("abort", () =>
            reject(new Error("UPLOAD_ABORTED"))
        );

        if (options.signal) {
            if (options.signal.aborted) {
                xhr.abort();
                return;
            }
            options.signal.addEventListener("abort", () => xhr.abort());
        }

        xhr.send(options.blob);
    });
}
