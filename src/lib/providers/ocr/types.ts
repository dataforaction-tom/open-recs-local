export type ParsedPage = {
  pageNumber: number;
  markdown: string;
  imageRefs: string[];
};

export type ParsedDocument = {
  markdown: string;
  pages: ParsedPage[];
  metadata: Record<string, unknown>;
};

export interface OcrProvider {
  readonly name: string;
  parseDocument(input: { filename: string; bytes: Buffer }): Promise<ParsedDocument>;
}
