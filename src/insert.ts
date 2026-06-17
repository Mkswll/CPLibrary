import * as vscode from "vscode";
import { Library } from "./library";
import { Snippet } from "./types";

export async function insertSnippets(
  library: Library,
  toInsert: Snippet[],
  skipped: Snippet[]
): Promise<void> {
  if (toInsert.length === 0) {
    const names = skipped.map((s) => s.id).join(", ");
    vscode.window.showInformationMessage(
      names
        ? `All snippets already present (${names}).`
        : "Nothing to insert."
    );
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("Open an editor to insert snippets.");
    return;
  }

  const text = library.formatImportBlock(toInsert);
  const position = computeInsertPosition(editor);

  const ok = await editor.edit((edit) => {
    if (position === "top") {
      edit.insert(new vscode.Position(0, 0), text);
    } else if (position === "afterIncludes") {
      const line = findLastIncludeLine(editor.document);
      edit.insert(new vscode.Position(line + 1, 0), "\n" + text);
    } else {
      const needsLeadingNewline =
        editor.selection.active.character > 0 ||
        (editor.selection.active.line > 0 &&
          editor.document.lineAt(editor.selection.active.line - 1).text.length > 0);
      edit.insert(
        editor.selection.active,
        (needsLeadingNewline ? "\n\n" : "") + text
      );
    }
  });

  if (!ok) {
    vscode.window.showErrorMessage("Failed to insert snippets.");
    return;
  }

  const inserted = toInsert.map((s) => s.id).join(", ");
  const skippedMsg =
    skipped.length > 0
      ? ` Skipped: ${skipped.map((s) => s.id).join(", ")}.`
      : "";
  vscode.window.showInformationMessage(`Inserted: ${inserted}.${skippedMsg}`);
}

function computeInsertPosition(
  editor: vscode.TextEditor
): "cursor" | "top" | "afterIncludes" {
  return vscode.workspace
    .getConfiguration("cplib")
    .get<"cursor" | "top" | "afterIncludes">("insertPosition", "cursor");
}

function findLastIncludeLine(document: vscode.TextDocument): number {
  let last = -1;
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text.trim();
    if (line.startsWith("#include")) {
      last = i;
    }
  }
  return last < 0 ? 0 : last;
}

export async function confirmInsert(
  library: Library,
  order: Snippet[],
  skipped: Snippet[],
  toInsert: Snippet[]
): Promise<boolean> {
  const showPreview = vscode.workspace
    .getConfiguration("cplib")
    .get<boolean>("showPreviewBeforeInsert", true);

  if (!showPreview) {
    return true;
  }

  const lines: string[] = [];
  if (toInsert.length > 0) {
    lines.push("Will insert (in order):");
    toInsert.forEach((s, i) => {
      lines.push(`  ${i + 1}. ${s.id}`);
    });
  } else {
    lines.push("Nothing new to insert.");
  }
  if (skipped.length > 0) {
    lines.push("");
    lines.push(`Already in file: ${skipped.map((s) => s.id).join(", ")}`);
  }
  if (order.length > toInsert.length) {
    const transitive = order
      .filter((s) => !toInsert.includes(s) && !skipped.includes(s))
      .map((s) => s.id);
    if (transitive.length > 0) {
      lines.push(`Resolved: ${order.map((s) => s.id).join(" → ")}`);
    }
  }

  const choice = await vscode.window.showInformationMessage(
    lines.join("\n"),
    { modal: true },
    "Insert",
    "Copy to Clipboard"
  );

  if (choice === "Copy to Clipboard") {
    await vscode.env.clipboard.writeText(library.formatImportBlock(toInsert));
    vscode.window.showInformationMessage("Copied to clipboard.");
    return false;
  }

  return choice === "Insert";
}
