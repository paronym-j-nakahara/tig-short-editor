/**
 * 日本語辞書（TIG_PF-10689）。
 *
 * placeholder は `{name}` で囲み、`useTranslation` の t(key, params) で
 * `params.name` に置換する。改行は `\n` をそのまま埋め込む。
 *
 * 新しい文言を追加したら `en.ts` にも同じキーで追加すること。
 */
export const ja = {
    common: {
        loadingProject: '読み込み中...',
        loadingContent: 'コンテンツを読み込み中...',
        defaultProjectName: '新しいプロジェクト',
    },
    sidebar: {
        home: 'ホーム',
        library: 'ライブラリ',
        export: '書き出し',
        text: 'テキスト',
    },
    buttons: {
        addMedia: 'メディアを追加',
        addText: 'テキストを追加',
        split: '分割',
        duplicate: '複製',
        delete: '削除',
        trackMarker: '再生位置追従',
        zoom: 'ズーム',
        render: '書き出し',
        rendering: '書き出し中...',
        loadingFfmpeg: 'FFmpeg を読み込み中...',
        cancel: 'キャンセル',
        edit: '編集',
        deleteFile: 'ファイルを削除',
    },
    properties: {
        mediaProperties: 'メディア設定',
        textProperties: 'テキスト設定',
        sourceVideo: '元動画',
        timingPosition: '配置',
        visualProperties: '表示設定',
        audioProperties: '音声設定',
        startSec: '開始 (秒)',
        endSec: '終了 (秒)',
        xPosition: 'X 座標',
        yPosition: 'Y 座標',
        width: '幅',
        height: '高さ',
        fontSize: '文字サイズ',
        opacity: '不透明度',
        volume: '音量',
        zindex: '重ね順',
    },
    exportPanel: {
        title: '書き出し',
        resolution: '解像度',
        quality: '品質',
        processingSpeed: '処理速度',
        currentSettings: '現在の設定: {resolution} / {quality} / {speed}',
    },
    toasts: {
        mediaAdded: 'メディアを追加しました',
        mediaDeleted: 'メディアを削除しました',
        videoRendered: '動画の書き出しが完了しました',
        renderFailed: '動画の書き出しに失敗しました',
        deleteMediaFailed: 'メディアの削除に失敗しました',
        confirmDeleteWithTimeline: 'このメディアはタイムラインで使用中です（{count} 件）。削除するとタイムラインからも除外されます。続行しますか？',
        markerOutsideBounds: '再生位置が選択中の素材の範囲外です',
        noElementSelected: '素材が選択されていません',
        markerOutsideElement: '再生位置が選択中の素材の外にあります',
        elementSplit: '素材を分割しました',
        elementDuplicated: '素材を複製しました',
        elementDeleted: '素材を削除しました',
        cannotSplit: '分割できません',
        cannotDuplicate: '複製できません',
    },
    errors: {
        projectIdRequired: 'プロジェクト ID が必要です。',
        titleRequired: 'タイトルを入力してください',
        contentRequired: '素材を追加してください',
        durationOver: '動画長が {max} 秒を超えています（現在 {actual} 秒）',
        durationUnder: '動画長は {min} 秒以上にしてください（現在 {actual} 秒）',
    },
    ffmpeg: {
        uploadingToCms: 'CMS にアップロード中... {percent}%',
        tipsExperimental: 'FFmpeg WASM の進捗バーは試験版のため、実際は処理が進んでいても止まって見えることがあります。',
    },
};
