import Dexie, { Table } from 'dexie';

export interface OfflineEnquete {
  id?: number;
  clientId: string;
  data: any; // Full form data
  timestamp: Date;
  synced: number; // 0 = false, 1 = true
}

export class AssetTrackerDB extends Dexie {
  enquetes_offline!: Table<OfflineEnquete>;

  constructor() {
    super('AssetTrackerDB');
    this.version(1).stores({
      enquetes_offline: '++id, clientId, timestamp, synced'
    });
  }
}

export const db = new AssetTrackerDB();
