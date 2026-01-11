# コントリビューションガイド

Engawaへの貢献に興味を持っていただき、ありがとうございます！

## 行動規範

このプロジェクトは、オープンで友好的なコミュニティを維持することを目指しています。すべての参加者は、お互いを尊重し、建設的なフィードバックを心がけてください。

## 貢献の方法

### バグ報告

バグを発見した場合は、以下の情報を含めてIssueを作成してください：

- 使用しているOS（macOS / Windows / Linux）
- Engawaのバージョン
- 再現手順
- 期待される動作
- 実際の動作
- スクリーンショット（可能であれば）

### 機能提案

新機能のアイデアがある場合：

1. まず既存のIssueを検索して、同じ提案がないか確認
2. Issueを作成し、以下を含める：
   - 機能の説明
   - なぜその機能が必要か（ユースケース）
   - 可能であれば、実装のアイデア

### Pull Request

#### 事前準備

```bash
# リポジトリをフォーク後、クローン
git clone https://github.com/yourusername/engawa.git
cd engawa

# 依存関係をインストール
pnpm install

# 開発サーバーを起動して動作確認
pnpm tauri dev
```

#### 開発フロー

1. **ブランチを作成**
   ```bash
   git checkout -b feature/your-feature-name
   # または
   git checkout -b fix/your-bug-fix
   ```

2. **コードを変更**
   - コードスタイル：既存のコードに合わせる
   - コメント：複雑なロジックには日本語でコメントを追加
   - テスト：可能な限りテストを追加

3. **動作確認**
   ```bash
   # TypeScriptのコンパイルエラーチェック
   pnpm exec tsc --noEmit

   # Rustのテスト
   cd src-tauri && cargo test

   # Linter
   cd src-tauri && cargo clippy

   # ビルド確認
   pnpm tauri build
   ```

4. **コミット**
   - コミットメッセージは日本語でOK
   - 簡潔で分かりやすいメッセージを心がける
   ```bash
   git commit -m "機能追加: エラーメッセージのハイライト表示"
   ```

5. **Pull Requestを作成**
   - タイトル：変更内容を簡潔に説明
   - 本文：
     - 何を変更したか
     - なぜ変更したか
     - 関連するIssue番号（あれば）
     - スクリーンショット（UI変更の場合）

#### レビュープロセス

- メンテナーがコードをレビューします
- 変更要望があれば、対応をお願いします
- 承認後、mainブランチにマージされます

## 開発のヒント

### プロジェクト構造

- `src/`: Reactフロントエンド
  - `components/`: UIコンポーネント
  - `hooks/`: カスタムReact Hooks
  - `utils/`: ユーティリティ関数
- `src-tauri/src/`: Rustバックエンド
  - `commands/`: Tauriコマンド（フロントエンドから呼び出される）
  - `llm/`: LLM統合機能
  - `parser/`: コマンド解析ロジック
  - `pty/`: 疑似端末制御

### デバッグ

- Rustのログ：`log::info!()`, `log::error!()`を使用
- Reactのログ：`console.log()`, `console.error()`を使用
- 開発モード：`pnpm tauri dev`でDevToolsが使える

### よくある問題

**Q: ビルドが失敗する**
- `pnpm install`を再実行
- `src-tauri/target`を削除して再ビルド
- Rustとpnpmのバージョンを確認

**Q: PTYが動作しない**
- シェルのパスが正しいか確認（`which bash`, `which zsh`）
- ターミナルの権限を確認

## 質問・サポート

- GitHub Issueで質問を投稿
- Discord（準備中）

## ライセンス

コントリビューションはすべてMIT Licenseの下で公開されます。
