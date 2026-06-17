import * as vscode from "vscode";
import { confirmInsert, insertSnippets } from "./insert";
import { Library } from "./library";
import { addSnippet, editSnippet } from "./manage";
import { previewSnippet } from "./preview";
import { SnippetTreeProvider } from "./tree";

let library: Library;
let extensionContext: vscode.ExtensionContext;

function snippetIdFromArg(arg: unknown): string | undefined {
  if (typeof arg === "string") {
    return arg;
  }
  if (arg && typeof arg === "object" && "snippetId" in arg) {
    const id = (arg as { snippetId?: string }).snippetId;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  extensionContext = context;
  library = new Library();
  await library.load(context);

  const treeProvider = new SnippetTreeProvider(library);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("cplib.snippetTree", treeProvider)
  );

  const refresh = async () => {
    await library.load(extensionContext);
    treeProvider.refresh();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("cplib.refresh", async () => {
      await refresh();
      vscode.window.showInformationMessage("CP Library refreshed.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cplib.importSnippet", async () => {
      const id = await pickSnippet(library);
      if (!id) {
        return;
      }
      await runImport(id);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cplib.importFromTree",
      async (arg?: unknown) => {
        const id = snippetIdFromArg(arg);
        if (!id) {
          return;
        }
        await runImport(id);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cplib.previewSnippet", async () => {
      const id = await pickSnippet(library);
      if (!id) {
        return;
      }
      await previewSnippet(library, id);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cplib.previewFromTree",
      async (arg?: unknown) => {
        const id = snippetIdFromArg(arg);
        if (!id) {
          return;
        }
        await previewSnippet(library, id);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cplib.addSnippet", async () => {
      await addSnippet(library, refresh);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cplib.editSnippet", async () => {
      await editSnippet(library, refresh);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("cplib.libraryPath")) {
        await refresh();
      }
    })
  );
}

export function deactivate(): void {}

async function pickSnippet(lib: Library): Promise<string | undefined> {
  const items = lib.getAll().map((s) => {
    const depCount = lib.transitiveDepCount(s.id);
    const depLabel =
      depCount > 0 ? ` · ${depCount} transitive dep${depCount === 1 ? "" : "s"}` : "";
    return {
      label: s.name,
      description: s.category,
      detail: s.description + depLabel,
      id: s.id,
    };
  });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Search snippets to import",
    matchOnDescription: true,
    matchOnDetail: true,
  });
  return picked?.id;
}

async function runImport(snippetId: string): Promise<void> {
  const detectExisting = vscode.workspace
    .getConfiguration("cplib")
    .get<boolean>("detectExisting", true);
  const fileText = vscode.window.activeTextEditor?.document.getText() ?? "";

  try {
    const resolved = await library.resolveImport(
      [snippetId],
      fileText,
      detectExisting
    );
    const confirmed = await confirmInsert(
      library,
      resolved.order,
      resolved.skipped,
      resolved.toInsert
    );
    if (confirmed) {
      await insertSnippets(library, resolved.toInsert, resolved.skipped);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`CP Library: ${message}`);
  }
}
