import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface TestConfig {
  theme: {
    primary: string;
    secondary: string;
    colors: {
      success: string;
      error: string;
    };
  };
  notifications: {
    enabled: boolean;
    sound: boolean;
  };
}

const template: TestConfig = {
  theme: {
    primary: '#000000',
    secondary: '#ffffff',
    colors: {
      success: '#00ff00',
      error: '#ff0000'
    }
  },
  notifications: {
    enabled: true,
    sound: true
  }
};

test('Store', async (t) => {
  // Create a temporary directory for tests
  const testDir = path.join(os.tmpdir(), 'electron-datastore-test-' + Math.random().toString(36).slice(2));
  fs.mkdirSync(testDir, { recursive: true });

  // Clean up after tests
  t.after(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  await t.test('should create store with template', () => {
    const store = new Store<TestConfig>({
      name: 'test-config',
      template,
      cwd: testDir
    });

    assert.deepEqual(store.store, template);
  });

  await t.test('should get and set top-level properties', () => {
    const store = new Store<TestConfig>({
      name: 'test-config',
      template,
      cwd: testDir
    });

    const newNotifications = { enabled: false, sound: false };
    store.set('notifications', newNotifications);
    assert.deepEqual(store.get('notifications'), newNotifications);
  });

  await t.test('should persist data to file', () => {
    const store = new Store<TestConfig>({
      name: 'test-config',
      template,
      cwd: testDir
    });

    store.set('notifications', { enabled: false, sound: false });
    
    const fileContent = JSON.parse(fs.readFileSync(path.join(testDir, 'test-config.json'), 'utf8'));
    assert.deepEqual(fileContent.notifications, { enabled: false, sound: false });
  });

  await t.test('should get nested properties using dot notation', () => {
    const store = new Store<TestConfig>({
      name: 'test-config',
      template,
      cwd: testDir
    });

    assert.equal(store.get('theme.primary'), '#000000');
    assert.equal(store.get('theme.colors.success'), '#00ff00');
  });

  await t.test('should set nested properties using dot notation', () => {
    const store = new Store<TestConfig>({
      name: 'test-config',
      template,
      cwd: testDir
    });

    store.set('theme.primary', '#111111');
    store.set('theme.colors.success', '#22ff22');

    assert.equal(store.get('theme.primary'), '#111111');
    assert.equal(store.get('theme.colors.success'), '#22ff22');
  });

  await t.test('should handle non-existent paths', () => {
    const store = new Store<TestConfig>({
      name: 'test-config',
      template,
      cwd: testDir
    });

    // Use type assertion for testing invalid paths
    assert.equal(store.get('theme.nonexistent' as any), undefined);
    assert.equal(store.get('nonexistent.path' as any), undefined);
  });

  await t.test('should reconcile data with template on load', () => {
    // Create store with initial data
    const store1 = new Store<TestConfig>({
      name: 'test-config',
      template,
      cwd: testDir
    });

    store1.set('theme.primary', '#111111');
    store1.set('theme.colors.success', '#22ff22');

    // Create new store instance to load from file
    const store2 = new Store<TestConfig>({
      name: 'test-config',
      template,
      cwd: testDir
    });

    // Should keep existing values
    assert.equal(store2.get('theme.primary'), '#111111');
    assert.equal(store2.get('theme.colors.success'), '#22ff22');
  });

  await t.test('should reset to template values on delete', () => {
    const store = new Store<TestConfig>({
      name: 'test-config',
      template,
      cwd: testDir
    });

    store.set('theme.primary', '#111111');
    store.delete('theme');

    assert.deepEqual(store.get('theme'), template.theme);
  });

  await t.test('should encrypt and decrypt data', async (t) => {
    const encryptionKey = 'test-encryption-key';

    await t.test('should encrypt data', () => {
      const store = new Store<TestConfig>({
        name: 'test-config',
        template,
        cwd: testDir,
        encryptionKey
      });

      store.set('theme.primary', '#111111');

      const fileContent = fs.readFileSync(path.join(testDir, 'test-config.json'), 'utf8');
      assert.ok(!fileContent.includes('#111111'));
      assert.notEqual(fileContent, JSON.stringify(store.store));
    });

    await t.test('should decrypt data', () => {
      const store = new Store<TestConfig>({
        name: 'test-config',
        template,
        cwd: testDir,
        encryptionKey
      });

      assert.equal(store.get('theme.primary'), '#111111');
    });
  });
});