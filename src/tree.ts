import * as vscode from "vscode";
import { Library } from "./library";
import { SnippetMeta } from "./types";

export class SnippetTreeProvider
  implements vscode.TreeDataProvider<SnippetTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    SnippetTreeItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly library: Library) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SnippetTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SnippetTreeItem): SnippetTreeItem[] {
    if (!element) {
      return this.library.getCategories().map(
        (cat) =>
          new SnippetTreeItem(
            cat,
            vscode.TreeItemCollapsibleState.Expanded,
            "cplibCategory"
          )
      );
    }

    if (element.contextValue === "cplibCategory") {
      return this.library
        .getAll()
        .filter((s) => s.category === element.label)
        .map((meta) => this.snippetItem(meta));
    }

    if (element.contextValue === "cplibSnippet") {
      const id = element.snippetId!;
      return this.library.getDirectDeps(id).map((depId) => {
        const dep = this.library.get(depId)!;
        return new SnippetTreeItem(
          dep.name,
          vscode.TreeItemCollapsibleState.None,
          "cplibDep",
          depId,
          dep.description
        );
      });
    }

    return [];
  }

  private snippetItem(meta: SnippetMeta): SnippetTreeItem {
    const depCount = this.library.transitiveDepCount(meta.id);
    const depHint =
      depCount > 0 ? ` · ${depCount} dep${depCount === 1 ? "" : "s"}` : "";
    const item = new SnippetTreeItem(
      meta.name,
      meta.deps.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      "cplibSnippet",
      meta.id,
      `${meta.description}${depHint}`
    );
    item.command = {
      command: "cplib.importFromTree",
      title: "Import",
      arguments: [meta.id],
    };
    return item;
  }
}

class SnippetTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    public readonly snippetId?: string,
    description?: string
  ) {
    super(label, collapsibleState);
    this.description = description;
    if (contextValue === "cplibSnippet") {
      this.tooltip = description;
      this.iconPath = new vscode.ThemeIcon("file-code");
    } else if (contextValue === "cplibCategory") {
      this.iconPath = new vscode.ThemeIcon("folder");
    } else if (contextValue === "cplibDep") {
      this.iconPath = new vscode.ThemeIcon("link");
      this.tooltip = `Dependency: ${label}`;
    }
  }
}
