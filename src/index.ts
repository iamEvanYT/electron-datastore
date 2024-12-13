import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface StoreOptions<T> {
  name: string;
  template: T;
  cwd?: string;
  encryptionKey?: string | Buffer | Uint8Array | DataView;
  accessPropertiesByDotNotation?: boolean;
  autoReconcile?: boolean;
}

type PathImpl<T, Key extends keyof T> = Key extends string
  ? T[Key] extends Record<string, any>
    ? | `${Key}.${PathImpl<T[Key], Exclude<keyof T[Key], keyof any[]>> & string}`
      | Key
    : Key
  : never;

type Path<T> = PathImpl<T, keyof T> | keyof T;

type PathValue<T, P extends Path<T>> = P extends `${infer Key}.${infer Rest}`
  ? Key extends keyof T
    ? Rest extends Path<T[Key]>
      ? PathValue<T[Key], Rest>
      : never
    : never
  : P extends keyof T
    ? T[P]
    : never;

export class Store<T extends Record<string, any>> {
  private data: T;
  private filePath: string;
  private encryptionKey?: string | Buffer | Uint8Array | DataView;
  template: T;
  private accessPropertiesByDotNotation: boolean;
  private autoReconcile: boolean;

  constructor(options: StoreOptions<T>) {
    this.template = options.template;
    this.encryptionKey = options.encryptionKey;
    const cwd = options.cwd ?? app.getPath('userData');
    this.filePath = path.join(cwd, `${options.name}.json`);
    this.accessPropertiesByDotNotation = options.accessPropertiesByDotNotation ?? true;
    this.autoReconcile = options.autoReconcile ?? true;
    this.data = this.read();
  }

  /**
   * Manually reconcile the current data with the template.
   * This is useful when autoReconcile is disabled or when you want to force a reconciliation.
   */
  reconcile(): void {
    this.data = { ...this.template };
    this.write();
  }

  private hasEncryption(): boolean {
    const key = this.encryptionKey;
    return (
      (typeof key === 'string' && key.length > 0) ||
      (Buffer.isBuffer(key) && key.length > 0) ||
      (key instanceof Uint8Array && key.byteLength > 0) ||
      (key instanceof DataView && key.byteLength > 0)
    );
  }

  private getEncryptionKey(): Buffer {
    const key = this.encryptionKey;
    if (!key) {
      throw new Error('No encryption key provided');
    }
    if (typeof key === 'string') {
      // Create a 32-byte key using SHA-256
      const hash = crypto.createHash('sha256');
      hash.update(key);
      return hash.digest();
    }
    if (Buffer.isBuffer(key)) {
      return key.length === 32 ? key : Buffer.concat([key], 32);
    }
    if (key instanceof Uint8Array || key instanceof DataView) {
      const buf = Buffer.from(key.buffer, key.byteOffset, key.byteLength);
      return buf.length === 32 ? buf : Buffer.concat([buf], 32);
    }
    throw new Error('Invalid encryption key');
  }

  private reconcileWithTemplate(data: Partial<T>): T {
    const result = { ...this.template } as T;

    for (const [key, value] of Object.entries(data)) {
      const templateKey = key as keyof T;
      if (templateKey in this.template) {
        if (
          value !== null &&
          typeof value === 'object' &&
          typeof this.template[templateKey] === 'object' &&
          !Array.isArray(value) &&
          !Array.isArray(this.template[templateKey])
        ) {
          result[templateKey] = {
            ...this.template[templateKey],
            ...value
          } as T[keyof T];
        } else {
          result[templateKey] = this.template[templateKey] as T[keyof T];
        }
      }
    }

    return result;
  }

  private read(): T {
    try {
      if (!fs.existsSync(this.filePath)) {
        return this.template;
      }

      let data = fs.readFileSync(this.filePath, 'utf8');

      if (this.hasEncryption()) {
        const decipher = crypto.createDecipheriv(
          'aes-256-cbc',
          this.getEncryptionKey(),
          Buffer.alloc(16, 0)
        );
        data = decipher.update(data, 'hex', 'utf8') + decipher.final('utf8');
      }

      const parsedData = JSON.parse(data) as Partial<T>;
      return this.autoReconcile ? this.reconcileWithTemplate(parsedData) : parsedData as T;
    } catch (error) {
      return this.template;
    }
  }

  private write(): void {
    let data = JSON.stringify(this.data, null, 2);

    if (this.hasEncryption()) {
      const cipher = crypto.createCipheriv(
        'aes-256-cbc',
        this.getEncryptionKey(),
        Buffer.alloc(16, 0)
      );
      data = cipher.update(data, 'utf8', 'hex') + cipher.final('hex');
    }

    fs.writeFileSync(this.filePath, data);
  }

  private getNestedValue<P extends Path<T>>(obj: T, path: P): PathValue<T, P> {
    if (typeof path !== 'string') {
      return obj[path as keyof T] as PathValue<T, P>;
    }

    const keys = path.split('.');
    let current: any = obj;

    for (const key of keys) {
      if (current === null || typeof current !== 'object') {
        return undefined as PathValue<T, P>;
      }
      current = current[key];
    }

    return current as PathValue<T, P>;
  }

  private setNestedValue<P extends Path<T>>(obj: T, path: P, value: PathValue<T, P>): void {
    if (typeof path !== 'string') {
      obj[path as keyof T] = value as T[keyof T];
      return;
    }

    const keys = path.split('.');
    let current: any = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || current[key] === null || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  get<K extends keyof T>(key: K): T[K];
  get<P extends Path<T>>(path: P): PathValue<T, P>;
  get(keyOrPath: string): any {
    if (this.accessPropertiesByDotNotation && keyOrPath.includes('.')) {
      return this.getNestedValue(this.data, keyOrPath);
    }
    return this.data[keyOrPath as keyof T];
  }

  set<K extends keyof T>(key: K, value: T[K]): void;
  set<P extends Path<T>>(path: P, value: PathValue<T, P>): void;
  set(keyOrPath: string, value: any): void {
    if (this.accessPropertiesByDotNotation && keyOrPath.includes('.')) {
      this.setNestedValue(this.data, keyOrPath, value);
    } else {
      this.data[keyOrPath as keyof T] = value;
    }
    this.write();
  }

  setAll(data: Partial<T>): void {
    this.data = this.reconcileWithTemplate({
      ...this.data,
      ...data
    });
    this.write();
  }

  delete<K extends keyof T>(key: K): void;
  delete<P extends Path<T>>(path: P): void;
  delete(keyOrPath: string): void {
    if (this.accessPropertiesByDotNotation && keyOrPath.includes('.')) {
      const templateValue = this.getNestedValue(this.template, keyOrPath);
      this.setNestedValue(this.data, keyOrPath, templateValue);
    } else {
      this.data[keyOrPath as keyof T] = this.template[keyOrPath as keyof T];
    }
    this.write();
  }

  clear(): void {
    this.data = { ...this.template };
    this.write();
  }

  get store(): T {
    return this.data;
  }

  get path(): string {
    return this.filePath;
  }
}