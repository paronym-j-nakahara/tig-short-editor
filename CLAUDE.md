# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClipJS (fork: `tig-short-editor`) — a browser-based online video editor. No backend: all files, projects, and rendering live client-side. Built on Next.js 14 App Router. Uses Remotion for real-time preview and FFmpeg WebAssembly for final render.

## Commands

```bash
npm install            # Install dependencies
npm run dev            # Dev server (http://localhost:3000)
npm run build          # Next.js production build (no env injection)
npm start              # Run built output
npm run lint           # next lint (eslint-config-next)

# Environment-specific builds (inject NEXT_PUBLIC_ALLOWED_CMS_ORIGINS)
npm run build:dev      # dev: cms.dev.tigmedia.jp
npm run build:stg      # stg: cms.stg.tigmedia.jp
npm run build:demo     # demo: cms.demo.tigmedia.jp
npm run build:prod     # prod: cms.tigmedia.jp

# Firebase Hosting deploy (build + deploy)
npm run deploy:dev     # → tig-short-editor-dev.web.app
npm run deploy:stg     # → tig-short-editor-stg.web.app
npm run deploy:demo    # → tig-short-editor-demo.web.app
npm run deploy:prod    # → tig-short-editor.web.app

# Docker (self-hosted)
docker build -t clipjs .
docker run -p 3000:3000 clipjs
```

## Firebase Hosting

各環境を **独立した Firebase プロジェクト** で管理。`.firebaserc` の alias で切り替え。

| Alias | Firebase Project | Plan | URL |
|---|---|---|---|
| `dev` | `tig-short-editor-dev` | Spark (free) | tig-short-editor-dev.web.app |
| `stg` | `tig-short-editor-stg` | Spark (free) | tig-short-editor-stg.web.app |
| `demo` | `tig-short-editor-demo` | Spark (free) | tig-short-editor-demo.web.app |
| `prod` | `tig-short-editor` | Spark (free) ※将来 Blaze | tig-short-editor.web.app |

### Initial setup (one-time)

```bash
npm install -g firebase-tools
firebase login
firebase use dev   # (or stg/demo/prod, defined in .firebaserc)
```

### Deploy

```bash
npm run deploy:dev    # most common
firebase hosting:channel:deploy preview-feature-x -P dev   # preview channel
```

### Spark plan limits & monitoring

Spark プランは **月 10 GB データ転送** が上限。社外向け prod は超過リスクがあるため、運用後は Firebase Console > Hosting > 使用量タブを **週次で確認** する。

超過時は対象プロジェクトの Hosting が一時停止（503）→ 翌月リセットを待つか、Blaze にアップグレード。Spark → Blaze 切り替えは Firebase Console から GCP Billing Account を紐付けるだけで、リポジトリ側の変更は不要。

There is no test suite — `package.json` defines no test script and the repo has no tests.

Node 18 is the reference runtime (per `dockerfile`). TypeScript uses `"strict": true`; path alias `@/*` maps to repo root.

## Architecture

### Persistence layer (`app/store/index.ts`)

All data is persisted in IndexedDB (database `clipjs-files`, via the `idb` package) with two object stores:

- `files` — raw `File` blobs keyed by `fileId` (uploaded media).
- `projects` — full `ProjectState` JSON keyed by `id`.

Helpers `storeFile` / `getFile` / `storeProject` / `getProject` / `listProjects` etc. are the only supported way to touch IndexedDB. The older `localStorage` persistence is commented out and deliberately disabled — do not re-enable it without reading the TODO notes in `store/index.ts`.

When a project is (re)loaded (`app/(pages)/projects/[id]/page.tsx`), `File` blobs are pulled back out of IndexedDB and `URL.createObjectURL` regenerates the `src` on every `MediaFile`. `src` is runtime-only; never persist it.

### Redux store

Two slices under `app/store/slices/`:

- `projectSlice.ts` — the currently open project (`ProjectState`: mediaFiles, textElements, playhead, zoom, export settings, active selection). `rehydrate` is the canonical way to load a project from IndexedDB into the slice.
- `projectsSlice.ts` — the list of all known projects and `currentProjectId`.

The project page auto-saves: every change to `projectState` triggers `storeProject(projectState)` and `updateProject` via a `useEffect`. Keep reducers pure — any async work belongs in the component layer.

### Core domain types (`app/types/index.ts`)

- `MediaFile` — video/audio/image clip with timeline position. Distinguishes **source time** (`startTime`/`endTime`, position *within the uploaded file*) from **timeline position** (`positionStart`/`positionEnd`, position *in the final video*). Splits, trims, and render filters rely on this distinction.
- `TextElement` — overlay text with positioning, font, animations, fade in/out.
- `ProjectState` — full project document including `exportSettings` (`ExportConfig`), `resolution`, `fps`, `history`/`future` (undo stacks — not yet wired).
- `mimeToExt` — MIME→extension map used by the FFmpeg pipeline when writing inputs.

### Preview pipeline (Remotion)

`app/components/editor/player/remotion/`:

- `Player.tsx` — hard-coded `fps = 30`, composition `1920x1080`. Syncs `currentTime` ↔ Remotion frame, and Redux `isPlaying` / `isMuted` ↔ player controls.
- `sequence/composition.tsx` + `sequence/items/*` — dispatches each `MediaFile` / `TextElement` to a per-type sequence item (`video`, `audio`, `image`, `text`).
- `canvas-(not-used)/` — legacy canvas renderer, kept for reference only.

### Render pipeline (FFmpeg WASM)

`app/components/editor/render/Ffmpeg/FfmpegRender.tsx` builds a single `filter_complex` graph:

1. Base `color=black:1920x1080` layer.
2. Media sorted by `zIndex` ascending → each written as `inputN.<ext>` into FFmpeg's virtual FS.
3. Video: `trim` to source window, `scale`, `setpts` to shift onto the timeline, `format=yuva420p` + `colorchannelmixer` for opacity.
4. Images: `-loop 1 -t <duration>`, then scaled/shifted.
5. Audio: `atrim` + `adelay` + `volume`, all mixed with `amix`.
6. Overlays chained `[base][visual0]overlay…[tmp0]` → `[tmp0][visual1]…` in zIndex order.
7. Text drawn via `drawtext`, with fonts fetched from `public/fonts/*.ttf` and written to the FFmpeg FS as `font<name>.ttf`. When adding a new font, list it in the `fonts` array and drop the `.ttf` in `public/fonts/`.

Export config (resolution/quality/speed) is translated into FFmpeg flags by `app/utils/extractConfigs.ts` (`scale`, `crf`, `preset`, bitrates). Output is always `output.mp4` → Blob → object URL.

### Editor layout (`app/(pages)/projects/[id]/page.tsx`)

Four vertical zones controlled by `activeSection` ('media' | 'text' | 'export') and `activeElement` ('media' | 'text' | null):

- Far-left icons (`AssetsPanel/SidebarButtons/*`) switch `activeSection`.
- Second column is the tools panel (`AssetsPanel/tools-section/*`: `MediaList`, `AddText`, `ExportList`).
- Center is the Remotion preview (`PreviewPlayer`).
- Right column is properties (`PropertiesSection/MediaProperties.tsx` or `TextProperties.tsx`) driven by `activeElement`.
- Bottom is `timeline/Timline.tsx` plus per-type tracks under `timeline/elements-timeline/`.

### Keyboard shortcuts

`app/components/editor/keys/GlobalKeyHandlerProps.tsx` is mounted inside `Timeline` and receives `handleDuplicate` / `handleSplit` / `handleDelete` callbacks so split/duplicate/delete stay scoped to the selected timeline element. The handler bails out when focus is in an input/textarea. Shortcuts: Space (play), M (mute), D (duplicate), S (split), Del (delete), T (toggle marker tracking), ←/→ (nudge playhead 0.01s). `Ctrl+Z` / redo are still TODO.

## Conventions

- App Router with a single top-level group `app/(pages)/` — pages live at `projects`, `projects/[id]`, `about`. Root `/` is the landing page.
- UI is client-side (`'use client'`) because Redux + IndexedDB + Remotion require the browser. Server components are only used for `app/layout.tsx` metadata and font setup.
- Default theme is dark; `ThemeProvider` has `defaultTheme="dark"` and `enableSystem={false}`.
- The project is intentionally watermark-free / ad-free / no-signup — do not add analytics beyond the existing `@vercel/analytics`, tracking, or remote persistence without explicit user direction.

## Roadmap

Pending work and context for prioritization is tracked in `TODO.md` at the repo root (split into "Done" and "Not done yet" sections). Inline `// TODO` comments across the codebase flag known issues — grep for them before refactoring.
