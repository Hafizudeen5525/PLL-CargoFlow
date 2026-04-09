
import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'CargoFlowDB';
const STORE_NAME = 'app_state';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

export const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
};

export const saveToDB = async (key: string, val: any) => {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, val, key);
  } catch (error) {
    console.error('Failed to save to IndexedDB:', error);
  }
};

export const getFromDB = async (key: string) => {
  try {
    const db = await getDB();
    return await db.get(STORE_NAME, key);
  } catch (error) {
    console.error('Failed to get from IndexedDB:', error);
    return null;
  }
};

export const deleteFromDB = async (key: string) => {
  try {
    const db = await getDB();
    await db.delete(STORE_NAME, key);
  } catch (error) {
    console.error('Failed to delete from IndexedDB:', error);
  }
};
