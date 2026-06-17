export interface SnippetMeta {
  id: string;
  file: string;
  name: string;
  description: string;
  category: string;
  deps: string[];
}

export interface Manifest {
  snippets: SnippetMeta[];
}

export interface Snippet extends SnippetMeta {
  content: string;
}

export interface ResolveResult {
  order: Snippet[];
  skipped: Snippet[];
  toInsert: Snippet[];
}
