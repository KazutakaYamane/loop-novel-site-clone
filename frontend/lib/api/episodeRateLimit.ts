// Laravel は話の作成・編集の送信が利用者ごとの回数の上限を超えると 429 で拒む(AC-F4-9、docs/adr/0023)
export function isEpisodeRateLimited(response: Response): boolean {
  return response.status === 429;
}
