# electron-datastore

Simple and secure electron store with template-based data reconciliation, dot notation access, and encryption support.

## Installation

```bash
npm install electron-datastore
```

## Usage

```typescript
import { Store } from "electron-datastore";

interface FrecencyData {
  count: number;
  lastAccessed: number;
}

interface FrecencyStore {
  commands: Record<string, FrecencyData>;
  settings: {
    maxItems: number;
  };
}

// Create a store instance with a template
const store = new Store<FrecencyStore>({
  name: "commands-frecency",
  template: {
    commands: {},
    settings: {
      maxItems: 100,
    },
  },
  // Optional: custom working directory
  cwd: "/custom/path",
  // Optional: encryption key
  encryptionKey: "your-secret-key",
  // Optional: enable/disable dot notation access (default: true)
  accessPropertiesByDotNotation: true,
  // Optional: enable/disable auto reconciliation on load (default: true)
  autoReconcile: true,
});

// Set data (will be reconciled with template)
store.set("commands.some-command", {
  count: 1,
  lastAccessed: Date.now(),
});

// Get data
const someCommand = store.get("commands.some-command");

// Set multiple values at once
store.setAll({
  commands: {
    "command-1": { count: 1, lastAccessed: Date.now() },
    "command-2": { count: 2, lastAccessed: Date.now() },
  },
});

// Reset a key to template value
store.delete("settings.maxItems");

// Delete a field entirely
store.deleteField("commands.some-command");

// Reset entire store to template
store.clear();

// Manually reconcile with template
store.reconcile();

// Access entire store
console.log(store.store);

// Get store file path
console.log(store.path);
```

## API

### `Store<T>`

#### Constructor Options

- `name` (required): Name of the store file (without extension)
- `template` (required): Template object that defines the structure and default values
- `cwd` (optional): Custom working directory. Defaults to `app.getPath('userData')`
- `encryptionKey` (optional): Key for encrypting the store data
- `accessPropertiesByDotNotation` (optional): Whether to allow accessing nested properties using dot notation. Defaults to `true`
- `autoReconcile` (optional): Whether to automatically reconcile data with template on load. Defaults to `true`

#### Methods

- `get(key: K): T[K]`: Get value for a key
- `get<P extends Path<T>>(path: P): PathValue<T, P>`: Get value using dot notation
- `set<K extends keyof T>(key: K, value: T[K]): void`: Set value for a key
- `set<P extends Path<T>>(path: P, value: PathValue<T, P>): void`: Set value using dot notation
- `setAll(data: Partial<T>): void`: Set multiple values at once
- `delete<K extends keyof T>(key: K): void`: Reset key to template value
- `delete<P extends Path<T>>(path: P): void`: Reset value to template value using dot notation
- `clear(): void`: Reset entire store to template
- `reconcile(): void`: Manually reconcile the current data with the template
- `store: T`: Get the entire store data
- `path: string`: Get the store file path

## Template-based Reconciliation

The store uses the provided template to:

1. Define the initial state
2. Validate and reconcile data structure
3. Provide default values for missing fields
4. Reset deleted keys to their template values

## Dot Notation Access

When enabled, you can access and modify nested properties using dot notation:

```typescript
store.get("settings.theme.primary");
store.set("settings.theme.primary", "#000000");
```

## Security

Data can be optionally encrypted using AES-256-CBC encryption. When encryption is enabled, the data is stored in an encrypted format and decrypted only when accessed through the API.

## License

MIT
