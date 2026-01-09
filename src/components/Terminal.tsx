import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import 'xterm/css/xterm.css';
import './Terminal.css';

export function Terminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

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

    // 少し遅延させてからfitを実行（DOMの準備を待つ）
    setTimeout(() => {
      fitAddon.fit();
    }, 0);

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // PTYセッションを作成
    const cols = xterm.cols;
    const rows = xterm.rows;

    invoke('create_pty', { cols, rows })
      .then(() => {
        console.log('PTY created successfully');
      })
      .catch((error) => {
        console.error('Failed to create PTY:', error);
        xterm.writeln(`\r\nError: ${error}`);
      });

    // PTY出力を受信
    const unlisten = listen<string>('pty-output', (event) => {
      xterm.write(event.payload);
    });

    // ユーザー入力をPTYに送信
    const disposable = xterm.onData((data) => {
      invoke('write_to_pty', { data }).catch((error) => {
        console.error('Failed to write to PTY:', error);
      });
    });

    // リサイズイベント
    const handleResize = () => {
      fitAddon.fit();
      const newCols = xterm.cols;
      const newRows = xterm.rows;

      invoke('resize_pty', { cols: newCols, rows: newRows }).catch((error) => {
        console.error('Failed to resize PTY:', error);
      });
    };

    window.addEventListener('resize', handleResize);

    // クリーンアップ
    return () => {
      disposable.dispose();
      unlisten.then((fn) => fn());
      window.removeEventListener('resize', handleResize);
      xterm.dispose();
    };
  }, []);

  return (
    <div
      ref={terminalRef}
      className="terminal-container"
    />
  );
}
