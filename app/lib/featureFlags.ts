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
  /** 画像アップロード。UploadMedia の accept に `image/*` を含めるか。Timeline 左側の Image アイコン段と Image トラック行も連動。 */
  enableImageUpload: false,
  /** 右側 Properties パネル（MediaProperties / TextProperties）。 */
  enablePropertiesPanel: false,
  /** Timeline 上部の Track Marker トグルボタン（再生中プレイヘッド追従の ON/OFF）。 */
  enableTrackMarkerToggle: false,
  /** Render 中モーダルの Tips 文言（FFmpeg WASM 進捗バーの説明）。 */
  enableRenderTips: false,
  /**
   * 動画クリップ間トランジション (POC, TIG_PF-10733)。
   * on の時、タイムライン上で隣接 (positionEnd === next.positionStart) する video
   * クリップ間に fade トランジション (固定 1s) を自動適用する。Capcut 方式で
   * タイムライン表示は連接のまま内部で 1s 重ねるため、全体長は (隣接ペア数 × 1s) 短縮。
   * プレビュー (Remotion) と書き出し (FFmpeg xfade) の両方に効く。
   */
  enableTransitions: false,
} as const;
