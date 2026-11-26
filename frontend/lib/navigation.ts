// ログイン状態が変わった後は、サーバー側の描画(ヘッダーのログイン中の表示)を作り直すため、ページを読み直して移動する
export function navigateTo(path: string): void {
  window.location.assign(path);
}
