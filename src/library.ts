import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Manifest, ResolveResult, Snippet, SnippetMeta } from "./types";

const MARKER_RE = /\/\/\s*@cplib\s+(\S+)/g;

export class Library {
  private snippets = new Map<string, SnippetMeta>();
  private libraryPath = "";

  async load(context: vscode.ExtensionContext): Promise<void> {
    this.libraryPath = this.resolveLibraryPath(context);
    const manifestPath = path.join(this.libraryPath, "manifest.json");
    const raw = await fs.promises.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw) as Manifest;

    this.snippets.clear();
    for (const meta of manifest.snippets) {
      this.snippets.set(meta.id, meta);
    }

    this.validateDeps();
  }

  getLibraryPath(): string {
    return this.libraryPath;
  }

  getAll(): SnippetMeta[] {
    return [...this.snippets.values()].sort((a, b) => {
      const cat = a.category.localeCompare(b.category);
      return cat !== 0 ? cat : a.name.localeCompare(b.name);
    });
  }

  getCategories(): string[] {
    return [...new Set(this.getAll().map((s) => s.category))].sort();
  }

  get(id: string): SnippetMeta | undefined {
    return this.snippets.get(id);
  }

  getDirectDeps(id: string): string[] {
    return this.snippets.get(id)?.deps ?? [];
  }

  getDependents(id: string): string[] {
    return this.getAll()
      .filter((s) => s.id !== id && s.deps.includes(id))
      .map((s) => s.id);
  }

  async readSnippet(id: string): Promise<Snippet> {
    const meta = this.snippets.get(id);
    if (!meta) {
      throw new Error(`Unknown snippet: ${id}`);
    }
    const filePath = path.join(this.libraryPath, meta.file);
    const content = await fs.promises.readFile(filePath, "utf8");
    return { ...meta, content };
  }

  async resolveImport(
    rootIds: string[],
    fileText: string,
    detectExisting: boolean
  ): Promise<ResolveResult> {
    const existing = detectExisting ? this.findExistingMarkers(fileText) : new Set<string>();
    const visited = new Set<string>();
    const order: Snippet[] = [];

    const visit = async (id: string): Promise<void> => {
      if (visited.has(id)) {
        return;
      }
      if (!this.snippets.has(id)) {
        throw new Error(`Unknown dependency: ${id}`);
      }
      visited.add(id);
      const meta = this.snippets.get(id)!;
      for (const dep of meta.deps) {
        await visit(dep);
      }
      order.push(await this.readSnippet(id));
    };

    for (const id of rootIds) {
      await visit(id);
    }

    const skipped = order.filter((s) => existing.has(s.id));
    const toInsert = order.filter((s) => !existing.has(s.id));
    return { order, skipped, toInsert };
  }

  transitiveDepCount(id: string): number {
    const visited = new Set<string>();
    const stack = [...this.getDirectDeps(id)];
    while (stack.length) {
      const cur = stack.pop()!;
      if (visited.has(cur)) {
        continue;
      }
      visited.add(cur);
      for (const dep of this.getDirectDeps(cur)) {
        stack.push(dep);
      }
    }
    return visited.size;
  }

  findExistingMarkers(fileText: string): Set<string> {
    const found = new Set<string>();
    let match: RegExpExecArray | null;
    const re = new RegExp(MARKER_RE.source, MARKER_RE.flags);
    while ((match = re.exec(fileText)) !== null) {
      found.add(match[1]);
    }
    return found;
  }

  formatSnippetBlock(snippet: Snippet): string {
    const trimmed = snippet.content.replace(/\s+$/, "");
    return `// @cplib ${snippet.id}\n${trimmed}\n// @cplib-end ${snippet.id}`;
  }

  formatImportBlock(snippets: Snippet[]): string {
    return snippets.map((s) => this.formatSnippetBlock(s)).join("\n\n") + "\n";
  }

  hasId(id: string): boolean {
    return this.snippets.has(id);
  }

  async isWritable(): Promise<boolean> {
    try {
      await fs.promises.access(this.libraryPath, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  toRelativeFile(absolutePath: string): string {
    const rel = path.relative(this.libraryPath, absolutePath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error("File must be inside the library folder.");
    }
    return rel.split(path.sep).join("/");
  }

  async upsertSnippet(meta: SnippetMeta): Promise<void> {
    this.snippets.set(meta.id, meta);
    this.validateDeps();
    await this.saveManifest();
  }

  async renameSnippet(oldId: string, newId: string): Promise<string[]> {
    if (oldId === newId) {
      return [];
    }
    const meta = this.snippets.get(oldId);
    if (!meta) {
      throw new Error(`Unknown snippet: ${oldId}`);
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newId)) {
      throw new Error(
        "ID must start with a letter or underscore and contain only letters, numbers, and underscores."
      );
    }
    if (this.snippets.has(newId)) {
      throw new Error(`Snippet "${newId}" already exists.`);
    }

    const dependents = this.getDependents(oldId);
    for (const snippet of this.snippets.values()) {
      if (snippet.deps.includes(oldId)) {
        snippet.deps = snippet.deps.map((dep) => (dep === oldId ? newId : dep));
      }
    }

    this.snippets.delete(oldId);
    this.snippets.set(newId, { ...meta, id: newId });
    this.validateDeps();
    await this.saveManifest();
    return dependents;
  }

  async removeSnippet(id: string): Promise<boolean> {
    const dependents = this.getDependents(id);
    if (dependents.length > 0) {
      throw new Error(
        `Cannot remove "${id}": required by ${dependents.join(", ")}. Edit those snippets and remove the dependency first.`
      );
    }
    if (!this.snippets.delete(id)) {
      return false;
    }
    this.validateDeps();
    await this.saveManifest();
    return true;
  }

  async deleteSnippet(id: string): Promise<boolean> {
    const meta = this.snippets.get(id);
    if (!meta) {
      return false;
    }
    const filePath = path.join(this.libraryPath, meta.file);
    await this.removeSnippet(id);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
    return true;
  }

  async saveManifest(): Promise<void> {
    const manifestPath = path.join(this.libraryPath, "manifest.json");
    const snippets = this.getAll();
    const body = JSON.stringify({ snippets }, null, 2) + "\n";
    await fs.promises.writeFile(manifestPath, body, "utf8");
  }

  private resolveLibraryPath(context: vscode.ExtensionContext): string {
    const configured = vscode.workspace
      .getConfiguration("cplib")
      .get<string>("libraryPath", "")
      .trim();
    if (configured) {
      return configured.replace(/^~/, process.env.HOME ?? "");
    }
    return path.join(context.extensionPath, "library");
  }

  private validateDeps(): void {
    for (const meta of this.snippets.values()) {
      for (const dep of meta.deps) {
        if (!this.snippets.has(dep)) {
          throw new Error(
            `Snippet "${meta.id}" depends on unknown snippet "${dep}"`
          );
        }
      }
    }
  }
}
