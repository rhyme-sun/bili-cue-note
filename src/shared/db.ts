import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION } from './constants';
import type { ChatMessage, StoredChat, StoredSummary, Transcript } from './types';

interface BiliCueNoteDB extends DBSchema {
  transcripts: { key: number; value: Transcript };
  summaries: { key: string; value: StoredSummary };
  chats: { key: number; value: StoredChat };
}

let dbPromise: Promise<IDBPDatabase<BiliCueNoteDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<BiliCueNoteDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BiliCueNoteDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('transcripts')) {
          db.createObjectStore('transcripts', { keyPath: 'cid' });
        }
        if (!db.objectStoreNames.contains('summaries')) {
          db.createObjectStore('summaries');
        }
        if (!db.objectStoreNames.contains('chats')) {
          db.createObjectStore('chats', { keyPath: 'cid' });
        }
      },
    });
  }
  return dbPromise;
}

export async function getTranscript(cid: number): Promise<Transcript | null> {
  const db = await getDB();
  return (await db.get('transcripts', cid)) ?? null;
}

export async function putTranscript(transcript: Transcript): Promise<void> {
  const db = await getDB();
  await db.put('transcripts', transcript);
}

export async function getSummary(key: string): Promise<StoredSummary | null> {
  const db = await getDB();
  return (await db.get('summaries', key)) ?? null;
}

export async function putSummary(key: string, value: StoredSummary): Promise<void> {
  const db = await getDB();
  await db.put('summaries', value, key);
}

export async function deleteSummary(key: string): Promise<void> {
  const db = await getDB();
  await db.delete('summaries', key);
}

export async function getChat(cid: number): Promise<ChatMessage[]> {
  const db = await getDB();
  const stored = (await db.get('chats', cid)) as StoredChat | undefined;
  return stored?.messages ?? [];
}

export async function putChat(cid: number, messages: ChatMessage[]): Promise<void> {
  const db = await getDB();
  await db.put('chats', { cid, messages });
}

export async function clearAll(): Promise<void> {
  const db = await getDB();
  await Promise.all([db.clear('transcripts'), db.clear('summaries'), db.clear('chats')]);
}
