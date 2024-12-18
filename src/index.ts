import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

/**
 * Configuration options for the Store class.
 * @template T The type of data to be stored
 */
export interface StoreOptions<T> {
  /** The name of the store file (without extension) */
  name: string;
  /** Template object that defines the structure and default values */
  template: T;
  /** Custom working directory. Defaults to app.getPath('userData') */
  cwd?: string;
  /** Optional encryption key for securing the stored data */
  encryptionKey?: string | Buffer | Uint8Array | DataView;
  /** Whether to allow accessing nested properties using dot notation (e.g., 'theme.colors.primary'). Defaults to true */
  accessPropertiesByDotNotation?: boolean;
  /** Whether to automatically reconcile data with template on load. Defaults to true */
  autoReconcile?: boolean;
}

type PathImpl<T, Key extends keyof T> = Key extends string
  ? T[Key] extends Record<string, any>
    ?
        | `${Key}.${PathImpl<T[Key], Exclude<keyof T[Key], keyof any[]>> &
            string}`
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

/**
 * A type-safe store for electron apps with template-based data structure, dot notation access, and optional encryption.
 * @template T The type of data to be stored, must be a record type
 * @example
 * ```typescript
 * interface Config {
 *   theme: {
 *     primary: string;
 *     dark: boolean;
 *   };
 * }
 *
 * const store = new Store<Config>({
 *   name: 'config',
 *   template: {
 *     theme: {
 *       primary: '#000000',
 *       dark: false
 *     }
 *   }
 * });
 * ```
 */
export class Store<T extends Record<string, any>> {
  private data: T;
  private filePath: string;
  private encryptionKey?: string | Buffer | Uint8Array | DataView;
  /** The template object that defines the structure and default values */
  template: T;
  private accessPropertiesByDotNotation: boolean;
  private autoReconcile: boolean;

  /**
   * Creates a new Store instance.
   * @param options Configuration options for the store
   * @throws {Error} If encryption is enabled but the key is invalid
   * @example
   * ```typescript
   * const store = new Store({
   *   name: 'config',
   *   template: { theme: 'light' },
   *   cwd: '/custom/path',      // optional
   *   encryptionKey: 'secret',  // optional
   *   autoReconcile: true       // optional
   * });
   * ```
   */
  constructor(options: StoreOptions<T>) {
    this.template = options.template;
    this.encryptionKey = options.encryptionKey;
    const cwd = options.cwd ?? app.getPath("userData");
    this.filePath = path.join(cwd, `${options.name}.json`);
    this.accessPropertiesByDotNotation =
      options.accessPropertiesByDotNotation ?? true;
    this.autoReconcile = options.autoReconcile ?? true;
    this.data = this.read();
  }

  /**
   * Manually reconcile the current data with the template.
   * This resets all values to their template defaults.
   * @example
   * ```typescript
   * // Reset all values to template defaults
   * store.reconcile();
   * ```
   */
  reconcile(): void {
    this.data = { ...this.template };
    this.write();
  }

  private hasEncryption(): boolean {
    const key = this.encryptionKey;
    return (
      (typeof key === "string" && key.length > 0) ||
      (Buffer.isBuffer(key) && key.length > 0) ||
      (key instanceof Uint8Array && key.byteLength > 0) ||
      (key instanceof DataView && key.byteLength > 0)
    );
  }

  private getEncryptionKey(): Buffer {
    const key = this.encryptionKey;
    if (!key) {
      throw new Error("No encryption key provided");
    }
    if (typeof key === "string") {
      // Create a 32-byte key using SHA-256
      const hash = crypto.createHash("sha256");
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
    throw new Error("Invalid encryption key");
  }

  // Helper method for deep copying
  private deepCopy<T>(obj: T): T {
    if (obj === null || typeof obj !== "object") {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepCopy(item)) as any;
    }
    const copy = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        copy[key] = this.deepCopy(obj[key]);
      }
    }
    return copy;
  }

  private reconcileWithTemplate(data: Partial<T>): T {
    // Create a deep copy of the template to start with
    const result = this.deepCopy(this.template) as T;

    // Recursive helper function
    const reconcile = (target: any, source: any) => {
      for (const [key, value] of Object.entries(source)) {
        if (typeof key === "string") {
          // Only reconcile string keys
          if (!(key in target)) {
            // If key doesn't exist in target, copy it (deep copy if it's an object)
            target[key] = this.deepCopy(value);
          } else if (
            typeof target[key] === "object" &&
            target[key] !== null &&
            typeof value === "object" &&
            value !== null
          ) {
            // If both are objects (and not null), recursively reconcile
            reconcile(target[key], value);
          }
          // If key exists and is not an object, we keep the target value
        }
      }
    };

    // Start the reconciliation process
    reconcile(result, data);

    return result;
  }

  private read(): T {
    try {
      if (!fs.existsSync(this.filePath)) {
        return this.template;
      }

      let data = fs.readFileSync(this.filePath, "utf8");

      if (this.hasEncryption()) {
        const decipher = crypto.createDecipheriv(
          "aes-256-cbc",
          this.getEncryptionKey(),
          Buffer.alloc(16, 0)
        );
        data = decipher.update(data, "hex", "utf8") + decipher.final("utf8");
      }

      const parsedData = JSON.parse(data) as Partial<T>;
      return this.autoReconcile
        ? this.reconcileWithTemplate(parsedData)
        : (parsedData as T);
    } catch (error) {
      return this.template;
    }
  }

  private write(): void {
    let data = JSON.stringify(this.data, null, 2);

    if (this.hasEncryption()) {
      const cipher = crypto.createCipheriv(
        "aes-256-cbc",
        this.getEncryptionKey(),
        Buffer.alloc(16, 0)
      );
      data = cipher.update(data, "utf8", "hex") + cipher.final("hex");
    }

    fs.writeFileSync(this.filePath, data);
  }

  private getNestedValue<P extends Path<T>>(obj: T, path: P): PathValue<T, P> {
    if (typeof path !== "string") {
      return obj[path as keyof T] as PathValue<T, P>;
    }

    const keys = path.split(".");
    let current: any = obj;

    for (const key of keys) {
      if (current === null || typeof current !== "object") {
        return undefined as PathValue<T, P>;
      }
      current = current[key];
    }

    return current as PathValue<T, P>;
  }

  private setNestedValue<P extends Path<T>>(
    obj: T,
    path: P,
    value: PathValue<T, P>
  ): void {
    if (typeof path !== "string") {
      obj[path as keyof T] = value as T[keyof T];
      return;
    }

    const keys = path.split(".");
    let current: any = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (
        !(key in current) ||
        current[key] === null ||
        typeof current[key] !== "object"
      ) {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * Get a value from the store.
   * @param key The key or path to get
   * @returns The value at the specified key/path, or undefined if not found
   * @example
   * ```typescript
   * // Direct access
   * const theme = store.get('theme');
   *
   * // Dot notation (if enabled)
   * const primary = store.get('theme.colors.primary');
   * ```
   */
  get<K extends keyof T>(key: K): T[K];
  get<P extends Path<T>>(path: P): PathValue<T, P>;
  get(keyOrPath: string): any {
    if (this.accessPropertiesByDotNotation && keyOrPath.includes(".")) {
      return this.getNestedValue(this.data, keyOrPath);
    }
    return this.data[keyOrPath as keyof T];
  }

  /**
   * Set a value in the store.
   * @param key The key or path to set
   * @param value The value to set
   * @example
   * ```typescript
   * // Direct access
   * store.set('theme', { dark: true });
   *
   * // Dot notation (if enabled)
   * store.set('theme.colors.primary', '#000000');
   * ```
   */
  set<K extends keyof T>(key: K, value: T[K]): void;
  set<P extends Path<T>>(path: P, value: PathValue<T, P>): void;
  set(keyOrPath: string, value: any): void {
    if (this.accessPropertiesByDotNotation && keyOrPath.includes(".")) {
      this.setNestedValue(this.data, keyOrPath, value);
    } else {
      this.data[keyOrPath as keyof T] = value;
    }
    this.write();
  }

  /**
   * Set multiple values at once.
   * @param data Partial data to set
   * @example
   * ```typescript
   * store.setAll({
   *   theme: { dark: true },
   *   notifications: { enabled: false }
   * });
   * ```
   */
  setAll(data: Partial<T>): void {
    this.data = this.reconcileWithTemplate({
      ...this.data,
      ...data,
    });
    this.write();
  }

  /**
   * Delete a value from the store by resetting it to its template value.
   * @param key The key or path to delete
   * @example
   * ```typescript
   * // Reset theme to template defaults
   * store.delete('theme');
   *
   * // Reset specific nested value
   * store.delete('theme.colors.primary');
   * ```
   */
  delete<K extends keyof T>(key: K): void;
  delete<P extends Path<T>>(path: P): void;
  delete(keyOrPath: string): void {
    if (this.accessPropertiesByDotNotation && keyOrPath.includes(".")) {
      const templateValue = this.getNestedValue(this.template, keyOrPath);
      this.setNestedValue(this.data, keyOrPath, templateValue);
    } else {
      this.data[keyOrPath as keyof T] = this.template[keyOrPath as keyof T];
    }
    this.write();
  }

  /**
   * Reset all values to their template defaults.
   * @example
   * ```typescript
   * // Reset entire store to template
   * store.clear();
   * ```
   */
  clear(): void {
    this.data = { ...this.template };
    this.write();
  }

  /**
   * Get the entire store data.
   * @returns The current store data
   * @example
   * ```typescript
   * const data = store.store;
   * console.log(data);
   * ```
   */
  get store(): T {
    return this.data;
  }

  /**
   * Get the full path to the store file.
   * @returns The absolute path to the store file
   * @example
   * ```typescript
   * console.log(store.path);
   * // => /Users/username/Library/Application Support/your-app/config.json
   * ```
   */
  get path(): string {
    return this.filePath;
  }
}
