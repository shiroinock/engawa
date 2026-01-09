import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { PreviewModal } from './PreviewModal';
import { LongPressGauge } from './LongPressGauge';
import 'xterm/css/xterm.css';
import './Terminal.css';

export function Terminal({ onCurrentCommandChange }: { onCurrentCommandChange?: (cmd: string) => void }) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const currentLineRef = useRef<string>('');
  const enterPressTimerRef = useRef<number | null>(null);
  const isEnterPressedRef = useRef<boolean>(false);
  const shouldShowPreviewRef = useRef<boolean>(false); // プレビュー表示予定フラグ
  const showPreviewRef = useRef<boolean>(false); // モーダル表示状態
  const [showPreview, setShowPreview] = useState(false);
  const [previewCommand, setPreviewCommand] = useState<string>('');
  const [gaugeKey, setGaugeKey] = useState(0); // 再レンダリング用

  const LONG_PRESS_DURATION = 1000; // 長押し時間（ミリ秒）

  useEffect(() => {
    if (!terminalRef.current) return;

    // xterm.jsの初期化
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
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

    // PTY出力を受信するリスナーを先に設定
    const unlisten = listen<string>('pty-output', (event) => {
      xterm.write(event.payload);
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
              onCurrentCommandChange?.('');
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

      // 入力を追跡
      if (data === '\x7f' || data === '\b') {
        // バックスペース
        currentLineRef.current = currentLineRef.current.slice(0, -1);
        onCurrentCommandChange?.(currentLineRef.current);
      } else if (data.charCodeAt(0) >= 32) {
        // 通常の文字
        currentLineRef.current += data;
        onCurrentCommandChange?.(currentLineRef.current);
      }
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
    onCurrentCommandChange?.('');
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
    </>
  );
}
