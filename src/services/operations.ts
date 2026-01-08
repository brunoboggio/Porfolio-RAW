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

export const syncPositionsToOperations = async (positions: Position[]) => {
    // For each position, check if there is an existing "ADD" operation
    // This is a simple client-side migration script
    const operationsRef = collection(db, COLLECTION_NAME);

    for (const pos of positions) {
        // Simple check: Look for an operation with same ticker and quantity around the buyDate?
        // Or just check if *any* ADD operation exists for this ticker/qty. 
        // Since this is a one-time "fix", we can be a bit loose or we can try to be precise.
        // Let's check for exact match on Ticker + Quantity + Date + Type=ADD

        const q = query(
            operationsRef,
            where('type', '==', 'ADD'),
            where('ticker', '==', pos.ticker),
            where('quantity', '==', pos.quantity),
            where('date', '==', pos.buyDate),
            limit(1)
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            console.log(`Backfilling missing operation for ${pos.ticker}`);
            await logOperation({
                type: 'ADD',
                ticker: pos.ticker,
                quantity: pos.quantity,
                price: pos.buyPrice,
                date: pos.buyDate
            });
        }
    }
};
