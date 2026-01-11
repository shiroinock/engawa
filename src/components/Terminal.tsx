import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { PreviewModal } from './PreviewModal';
import { LongPressGauge } from './LongPressGauge';
import { NaturalLanguageInput } from './NaturalLanguageInput';
import { ErrorTranslation } from './ErrorTranslation';
import 'xterm/css/xterm.css';
import './Terminal.css';

export function Terminal({ onCurrentCommandChange }: { onCurrentCommandChange?: (cmd: string) => void }) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const currentLineRef = useRef<string>('');
  const onCurrentCommandChangeRef = useRef(onCurrentCommandChange);
  const enterPressTimerRef = useRef<number | null>(null);
  const isEnterPressedRef = useRef<boolean>(false);
  const shouldShowPreviewRef = useRef<boolean>(false); // プレビュー表示予定フラグ
  const showPreviewRef = useRef<boolean>(false); // モーダル表示状態
  const [showPreview, setShowPreview] = useState(false);
  const [previewCommand, setPreviewCommand] = useState<string>('');
  const [gaugeKey, setGaugeKey] = useState(0); // 再レンダリング用
  const [showNaturalLanguageInput, setShowNaturalLanguageInput] = useState(false);
  const [detectedError, setDetectedError] = useState<string | null>(null);
  const outputBufferRef = useRef<string>(''); // PTY出力バッファ

  const LONG_PRESS_DURATION = 1000; // 長押し時間（ミリ秒）

  // ANSIエスケープシーケンスを除去
  const stripAnsi = (text: string): string => {
    // ANSIエスケープシーケンスを除去する正規表現（より包括的）
    // \u001b[?2004h のような ? を含むシーケンスもカバー
    // eslint-disable-next-line no-control-regex
    return text.replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, '');
  };

  // エラーパターンの検出
  const detectError = (output: string): string | null => {
    // ANSIエスケープシーケンスを除去してからチェック
    const cleanOutput = stripAnsi(output);

    const errorPatterns = [
      /(?:bash|zsh|sh):\s*command not found:.*/i,
      /permission denied.*/i,
      /no such file or directory.*/i,
      /syntax error.*/i,
      /connection refused.*/i,
      /(?:port|address) already in use.*/i,
      /no space left on device.*/i,
    ];

    for (const pattern of errorPatterns) {
      const match = cleanOutput.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return null;
  };

  // onCurrentCommandChangeが変わったら更新
  useEffect(() => {
    onCurrentCommandChangeRef.current = onCurrentCommandChange;
  }, [onCurrentCommandChange]);

  // Cmd+K / Ctrl+K で自然言語入力モーダルを開く
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd+K (Mac) または Ctrl+K (Windows/Linux)
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setShowNaturalLanguageInput((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!terminalRef.current) return;

    // CSS変数からターミナルの背景色を取得
    const terminalBackground = getComputedStyle(document.documentElement)
      .getPropertyValue('--terminal-background')
      .trim();

    // xterm.jsの初期化
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: terminalBackground || '#1e1e1e',
        foreground: '#d4d4d4',
      },
      scrollback: 10000,
      allowTransparency: false,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    xterm.open(terminalRef.current);

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // xtermバッファから現在のコマンドラインを抽出
    const extractCurrentCommand = (): string => {
      const buffer = xterm.buffer.active;
      const cursorY = buffer.cursorY;
      const cursorX = buffer.cursorX;
      const line = buffer.getLine(cursorY);

      if (!line) return '';

      // カーソル位置までのテキストを取得（補完候補を除外）
      let lineText = '';
      for (let i = 0; i < Math.min(cursorX, line.length); i++) {
        const cell = line.getCell(i);
        if (cell) {
          lineText += cell.getChars();
        }
      }

      // プロンプト記号を除去（%、$、#など）
      // 一般的なプロンプトパターンを検出
      const promptPatterns = [
        /^.*?[\$#%>]\s*/,  // 基本的なプロンプト（$, #, %, >）
        /^.*?❯\s*/,        // oh-my-zshなどの矢印プロンプト
        /^\[.*?\]\s*[\$#%>]\s*/,  // [user@host]$ 形式
      ];

      let command = lineText;
      for (const pattern of promptPatterns) {
        const match = lineText.match(pattern);
        if (match) {
          command = lineText.slice(match[0].length);
          break;
        }
      }

      return command.trim();
    };

    // コマンドラインを更新する関数
    const updateCurrentCommand = () => {
      const currentCommand = extractCurrentCommand();
      if (currentCommand !== currentLineRef.current) {
        currentLineRef.current = currentCommand;
        onCurrentCommandChangeRef.current?.(currentCommand);
      }
    };

    // PTY出力を受信するリスナーを先に設定
    const unlisten = listen<string>('pty-output', (event) => {
      xterm.write(event.payload);

      // 出力バッファに追加してエラー検出
      outputBufferRef.current += event.payload;

      // エラー検出（最新の500文字のみをチェック）
      const recentOutput = outputBufferRef.current.slice(-500);
      const error = detectError(recentOutput);

      if (error) {
        setDetectedError(error);
        // バッファをクリア（同じエラーを繰り返し検出しないように）
        outputBufferRef.current = '';
      }

      // バッファが大きくなりすぎないように定期的にクリア（500文字に制限）
      if (outputBufferRef.current.length > 500) {
        outputBufferRef.current = outputBufferRef.current.slice(-500);
      }

      // PTY出力があったらコマンドラインを更新（次のフレームで）
      requestAnimationFrame(updateCurrentCommand);
    });

    // PTY作成済みフラグ
    let ptyCreated = false;

    // リサイズイベントでPTYを作成（初回のfitで発火）
    const resizeDisposable = xterm.onResize(({ cols, rows }) => {
      if (!ptyCreated) {
        ptyCreated = true;
        console.log('Creating PTY with size:', cols, 'x', rows);

        invoke('create_pty', { cols, rows })
          .then(() => {
            console.log('PTY created successfully');
            // PTY作成後、カレントディレクトリを更新（シェル起動を待つ）
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('engawa-command-executed'));
            }, 500);
          })
          .catch((error) => {
            console.error('Failed to create PTY:', error);
            xterm.writeln(`\r\nError: ${error}`);
          });
      } else {
        // 2回目以降はリサイズ
        invoke('resize_pty', { cols, rows }).catch((error) => {
          console.error('Failed to resize PTY:', error);
        });
      }
    });

    // DOMの準備を待ってからfitを実行
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    // Enterキー長押し検知用のカスタムキーハンドラー
    xterm.attachCustomKeyEventHandler((event) => {
      if (event.key === 'Enter') {
        // モーダルが開いている場合はxtermでの処理をスキップ
        if (showPreviewRef.current) {
          return false;
        }

        if (event.type === 'keydown' && !event.repeat) {
          // Enterキーが押された（長押し開始）
          isEnterPressedRef.current = true;
          shouldShowPreviewRef.current = false; // リセット
          setGaugeKey((prev) => prev + 1); // 再レンダリングをトリガー
          enterPressTimerRef.current = window.setTimeout(() => {
            // 長押しされたらプレビュー表示
            enterPressTimerRef.current = null; // タイマーをクリア
            if (currentLineRef.current.trim()) {
              shouldShowPreviewRef.current = true; // プレビュー表示予定をマーク
              setPreviewCommand(currentLineRef.current);
              showPreviewRef.current = true;
              setShowPreview(true);
              isEnterPressedRef.current = false;
              setGaugeKey((prev) => prev + 1);
            }
          }, LONG_PRESS_DURATION);
          return false; // デフォルト動作を阻止
        } else if (event.type === 'keyup') {
          // Enterキーが離された
          isEnterPressedRef.current = false;
          setGaugeKey((prev) => prev + 1); // 再レンダリングをトリガー
          if (enterPressTimerRef.current) {
            clearTimeout(enterPressTimerRef.current);
            enterPressTimerRef.current = null;

            // プレビュー表示予定がなく、かつモーダルが開いていない場合のみ実行
            if (!shouldShowPreviewRef.current && !showPreviewRef.current) {
              // プレビュー表示前に離された = 通常の実行
              invoke('write_to_pty', { data: '\r' }).catch((error) => {
                console.error('Failed to write to PTY:', error);
              });

              // コマンド実行後にカレントディレクトリ更新イベントを発火
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('engawa-command-executed'));
              }, 100);

              currentLineRef.current = '';
              onCurrentCommandChangeRef.current?.('');
            }
          }
          return false;
        }
      }
      return true; // その他のキーはデフォルト動作
    });

    // ユーザー入力をPTYに送信（Enter以外）
    const disposable = xterm.onData((data) => {
      // Enterキーはカスタムハンドラーで処理するのでスキップ
      if (data === '\r' || data === '\n') {
        return;
      }

      invoke('write_to_pty', { data }).catch((error) => {
        console.error('Failed to write to PTY:', error);
      });
    });

    // ウィンドウリサイズイベント（fitを実行するだけ、PTYリサイズはonResizeで処理）
    const handleResize = () => {
      fitAddon.fit();
    };

    window.addEventListener('resize', handleResize);

    // クリーンアップ
    return () => {
      resizeDisposable.dispose();
      disposable.dispose();
      unlisten.then((fn) => fn());
      window.removeEventListener('resize', handleResize);
      xterm.dispose();
    };
  }, []);

  const handleConfirm = () => {
    // コマンドを実行
    invoke('write_to_pty', { data: '\r' }).catch((error) => {
      console.error('Failed to write to PTY:', error);
    });

    // コマンド実行後にカレントディレクトリ更新イベントを発火
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('engawa-command-executed'));
    }, 100);

    currentLineRef.current = '';
    onCurrentCommandChangeRef.current?.('');
    showPreviewRef.current = false;
    setShowPreview(false);
    shouldShowPreviewRef.current = false; // フラグをリセット
  };

  const handleCancel = () => {
    // プレビューを閉じてコマンドをクリア
    showPreviewRef.current = false;
    setShowPreview(false);
    shouldShowPreviewRef.current = false; // フラグをリセット
    // カーソルを行末に戻す処理は不要（ユーザーが手動でクリア）
  };

  const handleInsertCommand = (command: string) => {
    // コマンドをターミナルに挿入（Enterは押さない）
    if (xtermRef.current) {
      try {
        invoke('write_to_pty', { data: command });
      } catch (error) {
        console.error('Failed to insert command:', error);
      }
    }
  };

  return (
    <>
      <div
        ref={terminalRef}
        className="terminal-container"
      />
      <LongPressGauge key={gaugeKey} isActive={isEnterPressedRef.current} duration={LONG_PRESS_DURATION} />
      {showPreview && (
        <PreviewModal
          command={previewCommand}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
      <NaturalLanguageInput
        isOpen={showNaturalLanguageInput}
        onClose={() => setShowNaturalLanguageInput(false)}
        onInsertCommand={handleInsertCommand}
      />
      <ErrorTranslation
        errorMessage={detectedError}
        onDismiss={() => setDetectedError(null)}
      />
    </>
  );
}
