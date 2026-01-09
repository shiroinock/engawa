/**
 * ワイルドカードパターン(*や?)をファイル名にマッチングする
 *
 * @param pattern - ワイルドカードパターン（例: *.log, test?.txt）
 * @param filename - マッチング対象のファイル名
 * @returns マッチする場合true
 */
export function globMatch(pattern: string, filename: string): boolean {
  // パターンを正規表現に変換
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // 正規表現の特殊文字をエスケープ
    .replace(/\*/g, '.*')                 // * → 任意の文字列
    .replace(/\?/g, '.');                  // ? → 任意の1文字

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filename);
}

/**
 * パスのファイル名部分だけを取得
 */
export function getFileName(path: string): string {
  return path.split('/').pop() || '';
}

/**
 * ブレース展開を処理する（{a..e}, {1..5}, {foo,bar}など）
 *
 * @param pattern - ブレース展開を含むパターン
 * @returns 展開されたパターンのリスト
 */
export function expandBraces(pattern: string): string[] {
  // ブレースがない場合はそのまま返す
  if (!pattern.includes('{') || !pattern.includes('}')) {
    return [pattern];
  }

  // 最も内側のブレースを見つける
  const braceRegex = /\{([^{}]+)\}/;
  const match = pattern.match(braceRegex);

  if (!match) {
    return [pattern];
  }

  const braceContent = match[1];
  const prefix = pattern.slice(0, match.index);
  const suffix = pattern.slice(match.index! + match[0].length);

  let expansions: string[] = [];

  // 範囲展開をチェック（{a..z}, {1..10}など）
  const rangeMatch = braceContent.match(/^(.+)\.\.(.+)$/);
  if (rangeMatch) {
    const start = rangeMatch[1];
    const end = rangeMatch[2];

    // 数値範囲
    const startNum = parseInt(start, 10);
    const endNum = parseInt(end, 10);
    if (!isNaN(startNum) && !isNaN(endNum)) {
      const step = startNum <= endNum ? 1 : -1;
      for (let i = startNum; step > 0 ? i <= endNum : i >= endNum; i += step) {
        expansions.push(i.toString());
      }
    }
    // 文字範囲
    else if (start.length === 1 && end.length === 1) {
      const startCode = start.charCodeAt(0);
      const endCode = end.charCodeAt(0);
      const step = startCode <= endCode ? 1 : -1;
      for (let i = startCode; step > 0 ? i <= endCode : i >= endCode; i += step) {
        expansions.push(String.fromCharCode(i));
      }
    }
  }
  // リスト展開（{foo,bar,baz}など）
  else {
    expansions = braceContent.split(',');
  }

  // 展開された各要素に対して prefix と suffix を付けて再帰的に処理
  const results: string[] = [];
  for (const expansion of expansions) {
    const expanded = prefix + expansion + suffix;
    // 再帰的に処理（ネストしたブレース展開に対応）
    results.push(...expandBraces(expanded));
  }

  return results;
}

/**
 * ファイルのリストに対してパターンマッチングを行う
 *
 * @param pattern - ワイルドカードパターン（ブレース展開を含む可能性あり）
 * @param files - ファイルパスのリスト
 * @returns マッチしたファイルパスのリスト
 */
export function matchFiles(pattern: string, files: string[]): string[] {
  // ブレース展開を処理
  const expandedPatterns = expandBraces(pattern);

  const allMatches = new Set<string>();

  for (const expandedPattern of expandedPatterns) {
    // パターンにスラッシュが含まれていない場合、ファイル名のみをマッチング
    const hasPath = expandedPattern.includes('/');

    const matches = files.filter((file) => {
      const target = hasPath ? file : getFileName(file);
      return globMatch(expandedPattern, target);
    });

    matches.forEach(match => allMatches.add(match));
  }

  return Array.from(allMatches);
}
