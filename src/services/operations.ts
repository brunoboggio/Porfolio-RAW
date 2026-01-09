import {
    collection,
    addDoc,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp,
    getDocs,
    where,
    limit,
    updateDoc,
    deleteDoc,
    doc
} from 'firebase/firestore';
import { db } from '../firebase';
import { type Position } from './positions';

export interface Operation {
    id: string;
    type: 'ADD' | 'REMOVE';
    ticker: string;
    quantity: number;
    price: number;
    date: string; // The user-selected date for the position (or today's date)
    timestamp: any; // Server timestamp for sorting by actual operation time
    broker?: string;
}

const COLLECTION_NAME = 'operations';

export const logOperation = async (op: Omit<Operation, 'id' | 'timestamp'>) => {
    try {
        await addDoc(collection(db, COLLECTION_NAME), {
            ...op,
            timestamp: serverTimestamp()
        });
    } catch (error) {
        console.error("Error logging operation:", error);
        // We generally don't want to block the UI if logging fails, but logging is good practice.
    }
};

export const updateOperation = async (id: string, updates: Partial<Operation>) => {
    try {
        const docRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(docRef, updates);
    } catch (error) {
        console.error("Error updating operation:", error);
        throw error;
    }
};

export const deleteOperation = async (id: string) => {
    try {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
    } catch (error) {
        console.error("Error deleting operation:", error);
        throw error;
    }
};

export const subscribeToOperations = (onUpdate: (ops: Operation[]) => void) => {
    const q = query(
        collection(db, COLLECTION_NAME),
        orderBy('timestamp', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
        const ops = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as Operation[];
        onUpdate(ops);
    }, (error) => {
        console.error("Error fetching operations:", error);
    });
};

// function removed
