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

export function FileTree({ onFileClick }: { onFileClick: (path: string, isDir: boolean) => void }) {
  const [data, setData] = useState<TreeNode[]>([]);
  const [currentDir, setCurrentDir] = useState<string>('');
  const previousDirRef = useRef<string>('');

  // パンくずの深さを計算（インデント量の決定用）
  const breadcrumbDepth = currentDir.split('/').filter(Boolean).length;

  // ディレクトリの内容を読み込む
  const loadDirectory = async (path: string) => {
    try {
      const nodes = await invoke<FileNode[]>('read_directory', { path });
      const treeNodes = nodes.map((node) => convertToTreeNode(node));
      setData(treeNodes);
    } catch (error) {
      console.error('Failed to load directory:', error);
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
    loadCurrentDirectory();

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

    return (
      <div
        style={style}
        ref={dragHandle}
        className={`tree-node ${node.data.isDir ? 'directory' : 'file'} ${isRootLevel ? 'root-level' : ''}`}
        onClick={handleClick}
      >
        <span className="node-icon">{node.data.isDir ? '📁' : '📄'}</span>
        <span className="node-name">{node.data.name}</span>
      </div>
    );
  };

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <h3>ファイル</h3>
      </div>
      <Breadcrumb />
      <div style={{ paddingLeft: `${breadcrumbDepth * 12 + 12}px` }}>
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
      </div>
    </div>
  );
}
