// src/utils/db.ts
import { 
    FireIcon, 
    ShoppingBagIcon, 
    BuildingStorefrontIcon, 
    TruckIcon 
} from '@heroicons/vue/24/outline';

// Due to IndexedDB's limitation, we can't store component objects directly.
// We store the component's name as a string and map it back upon retrieval.
const iconMap: { [key: string]: any } = {
  FireIcon,
  ShoppingBagIcon,
  BuildingStorefrontIcon,
  TruckIcon,
};

// Define the structure of a bill for database storage.
export interface BillInDB {
  id: number;
  description: string;
  amount: number;
  iconName: string; // We store the icon's name, not the component object.
  payer: 'me' | 'them';
}

const DB_NAME = 'CoupleAccountDB';
const STORE_NAME = 'bills';
const DB_VERSION = 1;

let db: IDBDatabase;

/**
 * Initializes the IndexedDB database and creates the object store if needed.
 * @returns {Promise<boolean>} A promise that resolves to true if the DB is opened successfully.
 */
export function initDB(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Database error:', request.error);
      reject(false);
    };

    // This event is triggered only when the DB version changes.
    request.onupgradeneeded = (event) => {
      const dbInstance = (event.target as IDBOpenDBRequest).result;
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      db = (event.target as IDBOpenDBRequest).result;
      console.log('Database opened successfully.');
      resolve(true);
    };
  });
}

/**
 * Adds a new bill to the database.
 * @param {BillInDB} bill - The bill object to add.
 * @returns {Promise<void>}
 */
export function addBillToDB(bill: BillInDB): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
        reject('DB is not initialized.');
        return;
    }
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(bill);

    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.error('Error adding bill to DB:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Retrieves all bills from the database.
 * @returns {Promise<any[]>} A promise that resolves to an array of all bills.
 */
export function getAllBillsFromDB(): Promise<any[]> {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject('DB is not initialized.');
            return;
        }
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            // Map the stored icon name back to the actual icon component.
            const billsWithIcons = request.result.map(bill => ({
                ...bill,
                icon: iconMap[bill.iconName]
            })).sort((a, b) => b.id - a.id); // Sort by newest first.
            resolve(billsWithIcons);
        };

        request.onerror = () => {
            console.error('Error getting all bills from DB:', request.error);
            reject(request.error);
        };
    });
}

export function updateBillInDB(bill: BillInDB): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject('DB is not initialized.');
      return;
    }
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(bill); // put() will update if key exists

    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.error('Error updating bill in DB:', request.error);
      reject(request.error);
    };
  });
}

export function deleteBillFromDB(id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject('DB is not initialized.');
      return;
    }
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.error('Error deleting bill from DB:', request.error);
      reject(request.error);
    };
  });
}

