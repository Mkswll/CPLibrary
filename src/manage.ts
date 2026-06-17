import * as vscode from "vscode";
import { Library } from "./library";
import { SnippetMeta } from "./types";
import {
  buildFormInit,
  openSnippetForm,
} from "./snippetForm";

type RefreshFn = () => Promise<void>;

export async function addSnippet(
  library: Library,
  refresh: RefreshFn
): Promise<void> {
  if (!(await ensureWritable(library))) {
    return;
  }
  await openSnippetForm(library, buildFormInit(library, "add"), refresh);
}

export async function editSnippet(
  library: Library,
  refresh: RefreshFn
): Promise<void> {
  if (!(await ensureWritable(library))) {
    return;
  }

  const meta = await pickExistingSnippet(library);
  if (!meta) {
    return;
  }

  await openSnippetForm(library, buildFormInit(library, "edit", meta), refresh);
}

async function ensureWritable(library: Library): Promise<boolean> {
  if (await library.isWritable()) {
    return true;
  }
  const libPath = library.getLibraryPath();
  const choice = await vscode.window.showErrorMessage(
    `Library folder is not writable: ${libPath}. Set "cplib.libraryPath" to a writable folder.`,
    "Open Settings"
  );
  if (choice === "Open Settings") {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "cplib.libraryPath"
    );
  }
  return false;
}

async function pickExistingSnippet(
  library: Library
): Promise<SnippetMeta | undefined> {
  const items = library.getAll().map((s) => ({
    label: s.id,
    description: s.name,
    detail: s.deps.length ? `deps: ${s.deps.join(", ")}` : "no deps",
    meta: s,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Pick a snippet to edit",
    matchOnDescription: true,
  });
  return picked?.meta;
}
