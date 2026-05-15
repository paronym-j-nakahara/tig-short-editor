/**
 * 編集対象プロジェクトの制限値。
 *
 * CMS 側の `creator.min_video_duration` / `creator.max_video_duration`
 * （`tig_server_cms/cms/config/config_common.php`）と同期させる。
 *
 * Editor 側で UX ガード（クランプ + Export ボタン無効化 + 視覚的区切り線）に使用。
 * 実際のサーバーサイドバリデーションは `/creator/editor/complete` で行われる
 * （TIG_PF-10673 / TIG_PF-10674）。
 */
export const MIN_PROJECT_DURATION = 3;
export const MAX_PROJECT_DURATION = 180;
