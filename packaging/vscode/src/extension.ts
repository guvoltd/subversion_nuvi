/**
 * Subversion Nuvi - Visual Studio Code Extension
 * Connects developers to the Subversion Nuvi server API, providing repository browsing,
 * inline diffs, line blame annotations, and lock management.
 */

import * as vscode from 'vscode';

interface SvnRepoItem {
  id: number;
  name: str;
  latest_revision: number;
  fs_path: string;
}

class NuviRepositoryTreeProvider implements vscode.TreeDataProvider<RepositoryTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<RepositoryTreeItem | undefined | null | void> = new vscode.EventEmitter<RepositoryTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<RepositoryTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RepositoryTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: RepositoryTreeItem): Promise<RepositoryTreeItem[]> {
    if (element) {
      return [];
    }

    const config = vscode.workspace.getConfiguration('nuvi');
    const serverUrl = config.get<string>('serverUrl', 'http://localhost:8080');

    try {
      const response = await fetch(`${serverUrl}/api/v1/repositories`);
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
      const repos = (await response.json()) as SvnRepoItem[];
      return repos.map(r => new RepositoryTreeItem(r.name, r.id, r.latest_revision));
    } catch (err: any) {
      vscode.window.showErrorMessage(`Nuvi Connection Error: ${err.message}`);
      return [];
    }
  }
}

class RepositoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly repoId: number,
    public readonly latestRev: number
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = `${label} (r${latestRev})`;
    this.description = `r${latestRev}`;
    this.iconPath = new vscode.ThemeIcon('repo');
    this.contextValue = 'nuviRepository';
  }
}

export function activate(context: vscode.ExtensionContext) {
  const treeProvider = new NuviRepositoryTreeProvider();
  vscode.window.registerTreeDataProvider('nuviRepositoriesView', treeProvider);

  context.subscriptions.push(
    vscode.commands.registerCommand('nuvi.refreshRepositories', () => {
      treeProvider.refresh();
      vscode.window.showInformationMessage('Subversion Nuvi: Repositories refreshed.');
    }),

    vscode.commands.registerCommand('nuvi.openWebClient', () => {
      const config = vscode.workspace.getConfiguration('nuvi');
      const serverUrl = config.get<string>('serverUrl', 'http://localhost:8080');
      vscode.env.openExternal(vscode.Uri.parse(serverUrl));
    }),

    vscode.commands.registerCommand('nuvi.showBlame', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor open.');
        return;
      }
      vscode.window.showInformationMessage(`Subversion Nuvi: Annotating ${editor.document.fileName}...`);
    }),

    vscode.commands.registerCommand('nuvi.showDiff', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor open.');
        return;
      }
      vscode.window.showInformationMessage(`Subversion Nuvi: Comparing ${editor.document.fileName} with HEAD...`);
    })
  );

  // Status bar indicator
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = '$(repo) Subversion Nuvi';
  statusBar.command = 'nuvi.openWebClient';
  statusBar.tooltip = 'Click to open Subversion Nuvi Web Explorer';
  statusBar.show();
  context.subscriptions.push(statusBar);
}

export function deactivate() {}
