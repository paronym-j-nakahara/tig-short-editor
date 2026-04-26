"use client";

import { useSearchParams } from "next/navigation";

/**
 * Returns true when the editor is running inside a CMS iframe (embed mode),
 * detected by `?embed=1` in the URL.
 *
 * Embed mode hides standalone-only UI (HomeButton etc.) and is the gate for
 * the postMessage bridge in Phase 1-2.
 *
 * Caller MUST be wrapped in a `<Suspense>` boundary because `useSearchParams`
 * suspends during static export (output: 'export'). EditorPage already
 * provides this; new call sites outside EditorPage need to add their own.
 */
export function useEmbedMode(): boolean {
    const searchParams = useSearchParams();
    return searchParams.get("embed") === "1";
}
