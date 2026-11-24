# dept: 307

依存ライブラリが最新版からどれだけ遅れているか。最新版までに出たリリースを major / minor / patch に分けて数え、重みを掛けて足したもの([スコアの定義](https://github.com/shiroinock/dept#スコアの定義))。

- 合計 **307** = major 5 × 30 + minor 23 × 3 + patch 88 × 1
- 8 / 14 パッケージが遅れている、6.9 libyears
- ロックファイル:`./pnpm-lock.yaml`

| SCORE | PACKAGE | CURRENT | LATEST | MAJ | MIN | PAT | LIBYEAR | KIND |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| 77 | `react-arborist` | 3.4.3 | 4.0.1 | 1 | 12 | 11 | 1.7 | prod |
| 75 | `vite` | 7.3.7 | 8.3.8 | 1 | 3 | 36 | 0.1 | dev |
| 61 | `typescript` | 5.9.3 | 7.0.2 | 2 | 0 | 1 | 0.8 | dev |
| 52 | `@vitejs/plugin-react` | 5.1.2 | 6.3.0 | 1 | 4 | 10 | 0.9 | dev |
| 15 | `@types/react` | 19.2.7 | 19.3.1 | 0 | 1 | 12 | 1.0 | dev |
| 10 | `react` | 19.2.3 | 19.3.1 | 0 | 1 | 7 | 0.8 | prod |
| 10 | `react-dom` | 19.2.3 | 19.3.1 | 0 | 1 | 7 | 0.8 | prod |
| 7 | `@types/react-dom` | 19.2.3 | 19.3.0 | 0 | 1 | 4 | 0.8 | dev |

<details>
<summary>最新の依存(6 件)</summary>

| PACKAGE | VERSION | KIND |
| --- | --- | --- |
| `@tauri-apps/api` | 2.12.5 | prod |
| `@tauri-apps/cli` | 2.12.6 | dev |
| `@xterm/addon-fit` | 0.11.0 | prod |
| `@xterm/addon-web-links` | 0.12.0 | prod |
| `sharp` | 0.35.5 | dev |
| `xterm` | 5.3.0 | prod |

</details>

---

[dept](https://github.com/shiroinock/dept) で作成
