export interface StorageProvider {
  readonly name: string;
  put(key: string, bytes: Buffer, opts?: { contentType?: string }): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, opts?: { expiresInSeconds?: number }): Promise<string>;
}
