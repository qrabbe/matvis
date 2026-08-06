import { createLocalStorageStore } from '@matvis/ui';

const connectionStore = createLocalStorageStore(
  'matvis.connector.connectionId',
);

export function loadConnectionId(): string | null {
  return connectionStore.load();
}

export function saveConnectionId(id: string): void {
  connectionStore.save(id);
}

export function clearConnectionId(): void {
  connectionStore.clear();
}
