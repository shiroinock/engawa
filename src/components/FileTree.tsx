import { useEffect, useState, useRef } from 'react';
import { Tree, NodeRendererProps } from 'react-arborist';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Breadcrumb } from './Breadcrumb';
import './FileTree.css';

interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
}

interface TreeNode {
  id: string;
  name: string;
  path: string;
  isDir: boolean;
  children?: TreeNode[];
}

interface HighlightedFile {
  name: string;
  riskLevel: 'safe' | 'caution' | 'dangerous';
}

interface AffectedSubdirectory {
  count: number;
  riskLevel: 'safe' | 'caution' | 'dangerous';
}

interface FileTreeProps {
  onFileClick: (path: string, isDir: boolean) => void;
  highlightedFiles?: HighlightedFile[];
  affectedSubdirectories?: Record<string, AffectedSubdirectory>;
  affectedParentLevels?: Record<number, AffectedSubdirectory>;
}

export function FileTree({
  onFileClick,
  highlightedFiles = [],
  affectedSubdirectories = {},
  affectedParentLevels = {}
}: FileTreeProps) {
  const [data, setData] = useState<TreeNode[]>([]);
  const [currentDir, setCurrentDir] = useState<string>('');
  const previousDirRef = useRef<string>('');
  const [permissionError, setPermissionError] = useState<boolean>(false);

  // パンくずの深さを計算（インデント量の決定用）
  const breadcrumbDepth = currentDir.split('/').filter(Boolean).length;

  // ディレクトリの内容を読み込む
  const loadDirectory = async (path: string) => {
    try {
      const nodes = await invoke<FileNode[]>('read_directory', { path });
      const treeNodes = nodes.map((node) => convertToTreeNode(node));
      setData(treeNodes);
      setPermissionError(false);
    } catch (error) {
      console.error('Failed to load directory:', error);
      // 権限エラーかどうかをチェック
      const errorMessage = String(error);
      if (errorMessage.includes('Permission denied') || errorMessage.includes('permission')) {
        setPermissionError(true);
        setData([]);
      }
    }
  };

  // カレントディレクトリを取得（変更があった時だけ更新）
  const loadCurrentDirectory = async () => {
    try {
      const dir = await invoke<string>('get_current_directory');
      // ディレクトリが実際に変わった時だけ更新
      if (dir !== previousDirRef.current) {
        previousDirRef.current = dir;
        setCurrentDir(dir);
        // ディレクトリ変更時は古いデータをクリア（権限エラー対応）
        setData([]);
        setPermissionError(false);
        await loadDirectory(dir);
      }
    } catch (error) {
      console.error('Failed to get current directory:', error);
    }
  };

  // FileNodeをTreeNodeに変換
  const convertToTreeNode = (node: FileNode): TreeNode => {
    return {
      id: node.path,
      name: node.name,
      path: node.path,
      isDir: node.is_dir,
      children: node.children?.map((child) => convertToTreeNode(child)),
    };
  };

  useEffect(() => {
    // 初回読み込みはスキップ（PTY作成後のイベントを待つ）

    // ファイル変更イベントをリッスン
    const unlistenFileChanged = listen('file-changed', () => {
      // ファイルが変更されたら現在のディレクトリを再読み込み
      loadCurrentDirectory();
    });

    // コマンド実行イベントをリッスン
    const handleCommandExecuted = () => {
      console.log('Command executed, updating directory');
      loadCurrentDirectory();
    };
    window.addEventListener('engawa-command-executed', handleCommandExecuted);

    return () => {
      unlistenFileChanged.then((fn) => fn());
      window.removeEventListener('engawa-command-executed', handleCommandExecuted);
    };
  }, []);

  // ノードのレンダリング
  const Node = ({ node, style, dragHandle }: NodeRendererProps<TreeNode>) => {
    const handleClick = () => {
      onFileClick(node.data.path, node.data.isDir);
    };

    const isRootLevel = node.level === 0;

    // ハイライト状態をチェック
    const highlight = highlightedFiles.find(h => h.name === node.data.name);
    const highlightClass = highlight ? `highlight-${highlight.riskLevel}` : '';

    // サブディレクトリへの影響をチェック
    const affectedInfo = node.data.isDir ? affectedSubdirectories[node.data.name] : null;

    return (
      <div
        style={style}
        ref={dragHandle}
        className={`tree-node ${node.data.isDir ? 'directory' : 'file'} ${isRootLevel ? 'root-level' : ''} ${highlightClass}`}
        onClick={handleClick}
      >
        <span className="node-icon">{node.data.isDir ? '📁' : '📄'}</span>
        <span className="node-name">{node.data.name}</span>
        {affectedInfo && (
          <span className={`affected-badge badge-${affectedInfo.riskLevel}`}>
            {affectedInfo.count}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <h3>ファイル</h3>
      </div>
      <Breadcrumb affectedParentLevels={affectedParentLevels} />
      <div style={{ paddingLeft: `${(breadcrumbDepth + 1) * 12 + 12}px` }}>
        {permissionError ? (
          <div className="permission-error">
            <div className="error-icon">🔒</div>
            <div className="error-message">このディレクトリにアクセスする権限がありません</div>
          </div>
        ) : (
          <Tree
            data={data}
            openByDefault={false}
            width="100%"
            height={600}
            indent={12}
            rowHeight={28}
          >
            {Node}
          </Tree>
        )}
      </div>
    </div>
  );
}
