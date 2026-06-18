import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Library } from "./library";
import { SnippetMeta } from "./types";

export interface FormInit {
  mode: "add" | "edit";
  meta?: SnippetMeta;
  categories: string[];
  depOptions: { id: string; name: string; description: string }[];
  excludeId?: string;
  initialCode?: string;
}

export interface FormSubmit {
  id: string;
  name: string;
  description: string;
  category: string;
  file: string;
  deps: string[];
  pastedCode?: string;
  fileMode?: "existing" | "new";
}

type RefreshFn = () => Promise<void>;

export async function openSnippetForm(
  library: Library,
  init: FormInit,
  refresh: RefreshFn
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    "cplibSnippetForm",
    init.mode === "add" ? "Add Snippet" : `Edit: ${init.meta?.id}`,
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.webview.html = getFormHtml(panel.webview);

  panel.webview.onDidReceiveMessage(async (msg) => {
    try {
      if (msg.type === "ready") {
        let data = init;
        if (init.mode === "edit" && init.meta) {
          try {
            const snippet = await library.readSnippet(init.meta.id);
            data = { ...init, initialCode: snippet.content };
          } catch {
            // leave initialCode unset if file missing
          }
        }
        panel.webview.postMessage({ type: "init", data });
        return;
      }
      if (msg.type === "browseExisting") {
        const libraryUri = vscode.Uri.file(library.getLibraryPath());
        const picked = await vscode.window.showOpenDialog({
          defaultUri: libraryUri,
          canSelectMany: false,
          filters: { Headers: ["h", "hpp"], "All Files": ["*"] },
          title: "Pick an existing snippet file (navigate into subfolders)",
        });
        if (picked?.length) {
          const rel = library.toRelativeFile(picked[0].fsPath);
          panel.webview.postMessage({ type: "filePicked", file: rel, target: "existing" });
        }
        return;
      }
      if (msg.type === "choosePath") {
        const libraryUri = vscode.Uri.file(library.getLibraryPath());
        const hint = (msg.file as string | undefined)?.trim();
        const idHint = (msg.id as string | undefined)?.trim();
        const target = (msg.target as string | undefined) === "edit" ? "edit" : "new";
        let defaultUri: vscode.Uri = libraryUri;
        if (hint) {
          defaultUri = vscode.Uri.file(
            path.join(library.getLibraryPath(), hint.replace(/\\/g, "/"))
          );
        } else if (idHint) {
          defaultUri = vscode.Uri.joinPath(libraryUri, `${idHint}.h`);
        }
        const saved = await vscode.window.showSaveDialog({
          defaultUri,
          filters: { Headers: ["h", "hpp"] },
          title: "Choose path in library — create folders and name the file",
        });
        if (saved) {
          const rel = library.toRelativeFile(saved.fsPath);
          panel.webview.postMessage({ type: "filePicked", file: rel, target });
        }
        return;
      }
      if (msg.type === "save") {
        await handleSave(library, init.mode, msg.data as FormSubmit, refresh);
        panel.dispose();
        return;
      }
      if (msg.type === "remove" && init.mode === "edit" && init.meta) {
        panel.dispose();
        await openRemoveConfirm(library, init.meta, refresh);
        return;
      }
      if (msg.type === "cancel") {
        panel.dispose();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      panel.webview.postMessage({ type: "error", message });
    }
  });
}

async function handleSave(
  library: Library,
  mode: "add" | "edit",
  data: FormSubmit,
  refresh: RefreshFn
): Promise<void> {
  const id = data.id.trim();
  const name = data.name.trim();
  const category = data.category.trim();
  const file = data.file.trim().replace(/\\/g, "/");

  if (!id) {
    throw new Error("ID is required.");
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) {
    throw new Error(
      "ID must start with a letter or underscore and contain only letters, numbers, and underscores."
    );
  }
  if (mode === "add" && library.hasId(id)) {
    throw new Error(`Snippet "${id}" already exists.`);
  }
  if (!name) {
    throw new Error("Display name is required.");
  }
  if (!category) {
    throw new Error("Category is required.");
  }
  if (!file) {
    throw new Error("Library file path is required.");
  }
  if (file.includes("..")) {
    throw new Error("File path must be relative to the library folder.");
  }

  const absFile = path.join(library.getLibraryPath(), file);

  if (mode === "add") {
    if (data.fileMode === "existing") {
      if (!fs.existsSync(absFile)) {
        throw new Error(`File not found: ${file}. Pick an existing file in the library.`);
      }
    } else {
      const pasted = data.pastedCode?.trim();
      if (!pasted) {
        throw new Error("Paste snippet code to create the new file.");
      }
      await fs.promises.mkdir(path.dirname(absFile), { recursive: true });
      await fs.promises.writeFile(absFile, data.pastedCode!, "utf8");
    }
  } else {
    const pasted = data.pastedCode?.trim();
    if (pasted) {
      await fs.promises.mkdir(path.dirname(absFile), { recursive: true });
      await fs.promises.writeFile(absFile, data.pastedCode!, "utf8");
    } else if (!fs.existsSync(absFile)) {
      throw new Error(`File not found: ${file}. Paste code or pick a valid path.`);
    }
  }

  for (const dep of data.deps) {
    if (dep === id) {
      throw new Error("A snippet cannot depend on itself.");
    }
    if (!library.hasId(dep) && mode === "edit") {
      throw new Error(`Unknown dependency: ${dep}`);
    }
    if (mode === "add" && !library.hasId(dep)) {
      throw new Error(`Unknown dependency: ${dep}`);
    }
  }

  const meta: SnippetMeta = {
    id,
    file,
    name,
    description: data.description.trim(),
    category,
    deps: data.deps,
  };

  await library.upsertSnippet(meta);
  await refresh();
  vscode.window.showInformationMessage(
    mode === "add" ? `Added snippet "${id}".` : `Updated "${id}".`
  );
}

export async function openRemoveConfirm(
  library: Library,
  meta: SnippetMeta,
  refresh: RefreshFn
): Promise<void> {
  const dependents = library.getDependents(meta.id);
  if (dependents.length > 0) {
    vscode.window.showErrorMessage(
      `Cannot remove "${meta.id}": required by ${dependents.join(", ")}. Edit those snippets and remove the dependency first.`
    );
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Remove "${meta.id}" from manifest.json? (The .h file is not deleted.)`,
    { modal: true },
    "Remove"
  );
  if (confirm !== "Remove") {
    return;
  }
  try {
    await library.removeSnippet(meta.id);
    await refresh();
    vscode.window.showInformationMessage(`Removed "${meta.id}" from the library.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`CP Library: ${message}`);
  }
}

function getFormHtml(webview: vscode.Webview): string {
  const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'unsafe-inline';`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px 20px 24px;
      max-width: 640px;
      margin: 0 auto;
    }
    h1 {
      font-size: 1.3em;
      font-weight: 600;
      margin: 0 0 16px;
    }
    label {
      display: block;
      margin-top: 14px;
      margin-bottom: 4px;
      font-weight: 500;
    }
    .hint {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }
    input[type="text"], textarea, select {
      width: 100%;
      padding: 6px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
      font-family: inherit;
      font-size: inherit;
    }
    textarea { min-height: 72px; resize: vertical; }
    textarea.code-box {
      min-height: 200px;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: 1.4;
      tab-size: 4;
    }
    input:disabled {
      opacity: 0.7;
    }
    .file-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .file-row input { flex: 1; }
    .deps {
      border: 1px solid var(--vscode-widget-border, #444);
      border-radius: 4px;
      padding: 8px 10px;
      max-height: 220px;
      overflow-y: auto;
      margin-top: 4px;
    }
    .dep-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 5px 0;
      border-bottom: 1px solid var(--vscode-widget-border, #333);
    }
    .dep-item:last-child { border-bottom: none; }
    .dep-item label {
      margin: 0;
      font-weight: normal;
      cursor: pointer;
      flex: 1;
    }
    .dep-id { font-weight: 600; }
    .dep-desc {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
    }
    .empty-deps {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      padding: 4px 0;
    }
    .error {
      display: none;
      margin-top: 12px;
      padding: 8px 10px;
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-inputValidation-errorForeground);
      border-radius: 2px;
      font-size: 0.9em;
    }
    .error.visible { display: block; }
    .actions {
      margin-top: 20px;
      display: flex;
      gap: 10px;
      align-items: center;
    }
    button {
      padding: 6px 14px;
      font-family: inherit;
      font-size: inherit;
      cursor: pointer;
      border: none;
      border-radius: 2px;
    }
    .primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .danger {
      background: transparent;
      color: var(--vscode-errorForeground);
      border: 1px solid var(--vscode-errorForeground);
      margin-left: auto;
    }
    datalist { display: none; }
    .tabbar {
      display: flex;
      gap: 0;
      margin: 6px 0 0;
      border-bottom: 1px solid var(--vscode-widget-border, #444);
    }
    .tab {
      padding: 6px 12px;
      background: transparent;
      color: var(--vscode-foreground);
      border: none;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      opacity: 0.75;
    }
    .tab:hover { opacity: 1; }
    .tab.active {
      opacity: 1;
      border-bottom-color: var(--vscode-focusBorder, #007fd4);
      font-weight: 500;
    }
    .tab-panel { display: none; padding-top: 10px; }
    .tab-panel.active { display: block; }
    .file-path-readonly {
      flex: 1;
      padding: 6px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-descriptionForeground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
      font-family: var(--vscode-editor-font-family);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .file-path-readonly.empty {
      font-style: italic;
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <h1 id="title">Snippet</h1>

  <label for="id">ID</label>
  <span class="hint">Used in // @cplib markers and deps (e.g. HLD)</span>
  <input type="text" id="id" autocomplete="off" />

  <label for="name">Display name</label>
  <input type="text" id="name" autocomplete="off" />

  <label for="description">Description</label>
  <textarea id="description"></textarea>

  <label for="category">Category</label>
  <input type="text" id="category" list="categories" autocomplete="off" />
  <datalist id="categories"></datalist>

  <label>Snippet file</label>

  <div id="fileSectionAdd">
    <div class="tabbar" role="tablist">
      <button type="button" class="tab active" data-tab="existing" role="tab">Use existing file</button>
      <button type="button" class="tab" data-tab="new" role="tab">Create new file</button>
    </div>
    <div id="panelExisting" class="tab-panel active" role="tabpanel">
      <span class="hint">Pick a .h file that already exists in your library folder.</span>
      <div class="file-row" style="margin-top: 8px">
        <div id="fileExistingDisplay" class="file-path-readonly empty">No file selected</div>
        <input type="hidden" id="fileExisting" value="" />
        <button type="button" class="secondary" id="pickExisting">Pick file…</button>
      </div>
    </div>
    <div id="panelNew" class="tab-panel" role="tabpanel">
      <span class="hint">Set the path and paste the snippet code — the file will be created on save.</span>
      <div class="file-row" style="margin-top: 8px">
        <input type="text" id="fileNew" autocomplete="off" placeholder="e.g. graph/HLD.h" />
        <button type="button" class="secondary" id="choosePath">Choose path…</button>
      </div>
      <textarea id="codeNew" class="code-box" spellcheck="false" placeholder="Paste snippet code here…"></textarea>
    </div>
  </div>

  <div id="fileSectionEdit" style="display:none">
    <span class="hint">Update the file path and/or snippet code.</span>
    <div class="file-row" style="margin-top: 8px">
      <input type="text" id="fileEdit" autocomplete="off" />
      <button type="button" class="secondary" id="choosePathEdit">Choose path…</button>
    </div>
    <textarea id="codeEdit" class="code-box" spellcheck="false"></textarea>
  </div>

  <label>Dependencies</label>
  <span class="hint">Snippets imported automatically before this one</span>
  <div class="deps" id="deps"></div>

  <div class="error" id="error"></div>

  <div class="actions">
    <button type="button" class="primary" id="save">Save</button>
    <button type="button" class="secondary" id="cancel">Cancel</button>
    <button type="button" class="danger" id="remove" style="display:none">Remove from library</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let mode = "add";
    let excludeId = "";
    let activeFileTab = "existing";

    function showError(msg) {
      const el = document.getElementById("error");
      el.textContent = msg;
      el.classList.add("visible");
    }
    function clearError() {
      const el = document.getElementById("error");
      el.classList.remove("visible");
    }

    function renderDeps(options, selected) {
      const container = document.getElementById("deps");
      container.innerHTML = "";
      const filtered = options.filter((o) => o.id !== excludeId);
      if (!filtered.length) {
        container.innerHTML = '<div class="empty-deps">No other snippets yet.</div>';
        return;
      }
      for (const opt of filtered) {
        const row = document.createElement("div");
        row.className = "dep-item";
        const checked = selected.includes(opt.id) ? "checked" : "";
        row.innerHTML =
          '<input type="checkbox" id="dep-' + opt.id + '" value="' + opt.id + '" ' + checked + ' />' +
          '<label for="dep-' + opt.id + '">' +
          '<div class="dep-id">' + opt.id + '</div>' +
          '<div class="dep-desc">' + (opt.name || "") + (opt.description ? " — " + opt.description : "") + '</div>' +
          '</label>';
        container.appendChild(row);
      }
    }

    function getSelectedDeps() {
      return [...document.querySelectorAll('#deps input[type="checkbox"]:checked')].map((el) => el.value);
    }

    function setFileTab(tab) {
      activeFileTab = tab;
      document.querySelectorAll(".tab").forEach((el) => {
        el.classList.toggle("active", el.dataset.tab === tab);
      });
      document.getElementById("panelExisting").classList.toggle("active", tab === "existing");
      document.getElementById("panelNew").classList.toggle("active", tab === "new");
    }

    function setExistingFileDisplay(path) {
      const display = document.getElementById("fileExistingDisplay");
      const hidden = document.getElementById("fileExisting");
      hidden.value = path;
      if (path) {
        display.textContent = path;
        display.classList.remove("empty");
      } else {
        display.textContent = "No file selected";
        display.classList.add("empty");
      }
    }

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (msg.type === "init") {
        const d = msg.data;
        mode = d.mode;
        excludeId = d.excludeId || (d.meta && d.meta.id) || "";

        document.getElementById("title").textContent =
          mode === "add" ? "Add Snippet" : "Edit: " + d.meta.id;

        const idEl = document.getElementById("id");
        idEl.value = d.meta ? d.meta.id : "";
        idEl.disabled = mode === "edit";

        document.getElementById("name").value = d.meta ? d.meta.name : "";
        document.getElementById("description").value = d.meta ? d.meta.description : "";
        document.getElementById("category").value = d.meta ? d.meta.category : "";

        const isEdit = mode === "edit";
        document.getElementById("fileSectionAdd").style.display = isEdit ? "none" : "block";
        document.getElementById("fileSectionEdit").style.display = isEdit ? "block" : "none";

        if (isEdit && d.meta) {
          document.getElementById("fileEdit").value = d.meta.file;
          document.getElementById("codeEdit").value = d.initialCode || "";
        } else {
          setExistingFileDisplay("");
          document.getElementById("fileNew").value = "";
          document.getElementById("codeNew").value = "";
          setFileTab("existing");
        }

        const dl = document.getElementById("categories");
        dl.innerHTML = "";
        for (const cat of d.categories) {
          const opt = document.createElement("option");
          opt.value = cat;
          dl.appendChild(opt);
        }

        renderDeps(d.depOptions, d.meta ? d.meta.deps : []);

        document.getElementById("remove").style.display =
          mode === "edit" ? "inline-block" : "none";
      }
      if (msg.type === "filePicked") {
        if (msg.target === "existing") {
          setExistingFileDisplay(msg.file);
          setFileTab("existing");
        } else if (msg.target === "edit") {
          document.getElementById("fileEdit").value = msg.file;
        } else {
          document.getElementById("fileNew").value = msg.file;
          document.getElementById("fileNew").dataset.auto = "0";
          setFileTab("new");
        }
      }
      if (msg.type === "error") {
        showError(msg.message);
      }
    });

    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => setFileTab(btn.dataset.tab));
    });

    document.getElementById("pickExisting").addEventListener("click", () => {
      vscode.postMessage({ type: "browseExisting" });
    });

    document.getElementById("choosePath").addEventListener("click", () => {
      vscode.postMessage({
        type: "choosePath",
        file: document.getElementById("fileNew").value,
        id: document.getElementById("id").value,
      });
    });

    document.getElementById("choosePathEdit").addEventListener("click", () => {
      vscode.postMessage({
        type: "choosePath",
        file: document.getElementById("fileEdit").value,
        id: document.getElementById("id").value,
        target: "edit",
      });
    });

    document.getElementById("id").addEventListener("input", (e) => {
      if (mode !== "add" || activeFileTab !== "new") return;
      const fileEl = document.getElementById("fileNew");
      if (!fileEl.value || fileEl.dataset.auto === "1") {
        fileEl.value = e.target.value ? e.target.value + ".h" : "";
        fileEl.dataset.auto = "1";
      }
    });
    document.getElementById("fileNew").addEventListener("input", () => {
      document.getElementById("fileNew").dataset.auto = "0";
    });

    document.getElementById("save").addEventListener("click", () => {
      clearError();
      let file = "";
      let pastedCode;
      let fileMode;

      if (mode === "edit") {
        file = document.getElementById("fileEdit").value;
        pastedCode = document.getElementById("codeEdit").value || undefined;
      } else if (activeFileTab === "existing") {
        fileMode = "existing";
        file = document.getElementById("fileExisting").value;
      } else {
        fileMode = "new";
        file = document.getElementById("fileNew").value;
        pastedCode = document.getElementById("codeNew").value || undefined;
      }

      vscode.postMessage({
        type: "save",
        data: {
          id: document.getElementById("id").value,
          name: document.getElementById("name").value,
          description: document.getElementById("description").value,
          category: document.getElementById("category").value,
          file,
          deps: getSelectedDeps(),
          pastedCode,
          fileMode,
        },
      });
    });

    document.getElementById("cancel").addEventListener("click", () => {
      vscode.postMessage({ type: "cancel" });
    });

    document.getElementById("remove").addEventListener("click", () => {
      vscode.postMessage({ type: "remove" });
    });

    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}

export function buildFormInit(
  library: Library,
  mode: "add" | "edit",
  meta?: SnippetMeta
): FormInit {
  return {
    mode,
    meta,
    categories: library.getCategories(),
    depOptions: library.getAll().map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
    })),
    excludeId: meta?.id,
  };
}
