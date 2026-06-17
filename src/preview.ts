import * as vscode from "vscode";
import { Library } from "./library";

export async function previewSnippet(
  library: Library,
  snippetId: string
): Promise<void> {
  const detectExisting = vscode.workspace
    .getConfiguration("cplib")
    .get<boolean>("detectExisting", true);
  const fileText = vscode.window.activeTextEditor?.document.getText() ?? "";

  const resolved = await library.resolveImport(
    [snippetId],
    fileText,
    detectExisting
  );

  const lines: string[] = [
    `Import plan for ${snippetId}`,
    "",
    "Resolved order:",
    ...resolved.order.map((s, i) => {
      const tag = resolved.skipped.includes(s)
        ? " (already in file)"
        : resolved.toInsert.includes(s)
          ? ""
          : "";
      return `  ${i + 1}. ${s.id}${tag}`;
    }),
    "",
    "---",
    "",
    library.formatImportBlock(resolved.toInsert),
  ];

  const doc = await vscode.workspace.openTextDocument({
    content: lines.join("\n"),
    language: "cpp",
  });
  await vscode.window.showTextDocument(doc, {
    preview: true,
    viewColumn: vscode.ViewColumn.Beside,
  });
}
