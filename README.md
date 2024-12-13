# electron-datastore

Simple and secure electron store with template-based data reconciliation and encryption support.

## Installation

```bash
npm install electron-datastore
```

## Usage

```typescript
import { Store } from 'electron-datastore';

interface FrecencyData {
  count: number;
  lastAccessed: number;
}

interface FrecencyStore {
  commands: Record<string, FrecencyData>;
}

// Create a store instance with a template
const store = new Store<FrecencyStore>({
  name: 'commands-frecency',
  template: {
    commands: {}
  },
  // Optional encryption key
  encryptionKey: 'your-secret-key'
});

// Set data (will be reconciled with template)
store.set('commands', {
  'some-command': {
    count: 1,
    lastAccessed: Date.now()
  }
});

// Get data
const commands = store.get('commands');

// Set multiple values at once
store.setAll({
  commands: {
    'command-1': { count: 1, lastAccessed: Date.now() },
    'command-2': { count: 2, lastAccessed: Date.now() }
  }
});

// Reset a key to template value
store.delete('commands');

// Reset entire store to template
store.clear();

// Access entire store
console.log(store.store);

// Get store file path
console.log(store.path);
```

## API

### `Store<T>`

#### Constructor Options

- `name` (required): Name of the store file
- `template` (required): Template object that defines the structure and default values
- `encryptionKey`: Optional key for encrypting the store data

#### Methods

- `get<K extends keyof T>(key: K): T[K]`: Get value for a key
- `set<K extends keyof T>(key: K, value: T[K]): void`: Set value for a key
- `setAll(data: Partial<T>): void`: Set multiple values at once
- `delete<K extends keyof T>(key: K): void`: Reset key to template value
- `clear(): void`: Reset entire store to template
- `store: T`: Get the entire store data
- `path: string`: Get the store file path

## Template-based Reconciliation

The store uses the provided template to:
1. Define the initial state
2. Validate and reconcile data structure
3. Provide default values for missing fields
4. Reset deleted keys to their template values

## Security

Data can be optionally encrypted using AES-256-CBC encryption. When encryption is enabled, the data is stored in an encrypted format and decrypted only when accessed through the API.

## License

MIT