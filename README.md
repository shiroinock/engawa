# Engawa (縁側)

> ターミナルが怖い人のための、新しいターミナルエミュレータ

## コンセプト

Engawaは「ターミナルが怖い」と感じる人のための新しいターミナルエミュレータです。日本家屋の「縁側」のように、システムと人間の間の安心できる居場所となることを目指しています。

### 主な特徴

- 🌳 **空間感覚を取り戻す**: リアルタイムファイルツリーとパンくずリストで現在位置を常に可視化
- 🛡️ **仲介者になる**: コマンド実行前のプレビュー、危険度表示、LLMによる分かりやすい説明
- 🔍 **影響範囲の可視化**: ワイルドカードのマッチプレビュー、ファイルツリー上でのハイライト
- 🤖 **LLM統合**: 自然言語でのコマンド入力、エラーメッセージの翻訳
- 🎨 **温かみのあるデザイン**: 黒背景から脱却した親しみやすいUI

## スクリーンショット

_TODO: スクリーンショットを追加_

## インストール

### 必要要件

- macOS 10.15+ / Windows 10+ / Linux
- Node.js 18+
- Rust 1.70+
- pnpm

### ビルド手順

```bash
# リポジトリをクローン
git clone https://github.com/yourusername/engawa.git
cd engawa

# 依存関係をインストール
pnpm install

# 開発モードで起動
pnpm tauri dev

# リリースビルド
pnpm tauri build
```

## 使い方

### 基本操作

1. **コマンド入力**: 通常のターミナルと同じようにコマンドを入力
2. **Enter長押し**: コマンドの詳細な説明と影響範囲をプレビュー
3. **ファイルツリー**: 左側のツリーで現在のディレクトリ構造を確認
4. **自然言語入力**: Cmd+K (Ctrl+K) で自然言語からコマンドを生成

### LLM機能の設定

1. 右上の設定アイコンをクリック
2. OpenAI APIキーを入力
3. モデルを選択（デフォルト: gpt-4o-mini）
4. コスト管理の予算上限を設定（オプション）

## 技術スタック

- **フレームワーク**: [Tauri](https://tauri.app/) v2
- **フロントエンド**: React 19 + TypeScript
- **ターミナル**: xterm.js + portable-pty (Rust)
- **LLM**: OpenAI API (将来的にAnthropic Claude対応予定)
- **ビルドツール**: Vite + pnpm

## 開発

### プロジェクト構造

```
engawa/
├── src/                    # React フロントエンド
│   ├── components/        # UIコンポーネント
│   ├── hooks/            # カスタムフック
│   └── utils/            # ユーティリティ関数
├── src-tauri/            # Rust バックエンド
│   └── src/
│       ├── commands/     # Tauriコマンド
│       ├── llm/         # LLM統合
│       ├── parser/      # コマンド解析
│       └── pty/         # PTY制御
└── public/              # 静的アセット
```

### テスト

```bash
# Rustテスト
cd src-tauri && cargo test

# TypeScriptコンパイルチェック
pnpm exec tsc --noEmit

# Linter
cd src-tauri && cargo clippy
```

## ゴール

ターミナルの力を削ぐのではなく、**ターミナルへの架け橋**になること。
Engawaを卒業した人が、普通のターミナルも怖くなくなっている——それが成功の指標です。

## ライセンス

[MIT License](LICENSE) - 自由に使用、改変、配布できます。

## コントリビューション

Issue、Pull Requestを歓迎します！詳細は[CONTRIBUTING.md](CONTRIBUTING.md)を参照してください。

## 作者

[@shiroino](https://github.com/shiroino)

## 謝辞

- [Tauri](https://tauri.app/) - クロスプラットフォームデスクトップアプリフレームワーク
- [xterm.js](https://xtermjs.org/) - ターミナルエミュレータライブラリ
- [portable-pty](https://github.com/wez/wezterm/tree/main/pty) - PTY制御ライブラリ
