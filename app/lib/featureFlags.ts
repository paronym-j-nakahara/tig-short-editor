/**
 * Editor UI 機能の有効/無効フラグ。
 *
 * Tig Short の用途では一部 UI を非表示にしているが、将来的に復活させる
 * 可能性があるため、削除ではなくフラグで制御する。復活させたい場合は
 * 該当フラグを `true` にするだけで元の挙動に戻る（コード追加不要）。
 *
 * import の tree-shaking が効かなくなる程度のオーバーヘッドはあるが、
 * 実用上は誤差レベル。
 */
export const FEATURE_FLAGS = {
  /** Text（字幕）挿入機能。Sidebar の Text ボタン + AddText パネル + TextProperties。 */
  enableText: false,
  /** 画像アップロード。UploadMedia の accept に `image/*` を含めるか。 */
  enableImageUpload: false,
  /** タイムライン左側の Video/Music/Image/Text 段アイコン。 */
  enableTimelineSideIcons: false,
  /** 右側 Properties パネル（MediaProperties / TextProperties）。 */
  enablePropertiesPanel: false,
  /** Timeline 上部の Track Marker トグルボタン（再生中プレイヘッド追従の ON/OFF）。 */
  enableTrackMarkerToggle: false,
  /** Render 中モーダルの Tips 文言（FFmpeg WASM 進捗バーの説明）。 */
  enableRenderTips: false,
} as const;
