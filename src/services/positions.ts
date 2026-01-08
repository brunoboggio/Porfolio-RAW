import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    orderBy
} from 'firebase/firestore';
import { db } from '../firebase';

export interface Position {
    id: string; // Firestore doc ID
    ticker: string;
    quantity: number;
    buyPrice: number;
    buyDate: string;
}

const COLLECTION_NAME = 'positions';

export const subscribeToPositions = (onUpdate: (positions: Position[]) => void) => {
    const q = query(collection(db, COLLECTION_NAME), orderBy('buyDate', 'desc'));

    return onSnapshot(q, (snapshot) => {
        const positions = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as Position[];
        onUpdate(positions);
    }, (error) => {
        console.error("Error fetching positions:", error);
    });
};

export const addPosition = async (position: Omit<Position, 'id'>) => {
    try {
        await addDoc(collection(db, COLLECTION_NAME), position);
    } catch (error) {
        console.error("Error adding position:", error);
        throw error;
    }
};

export const updatePosition = async (id: string, updates: Partial<Omit<Position, 'id'>>) => {
    try {
        await updateDoc(doc(db, COLLECTION_NAME, id), updates);
    } catch (error) {
        console.error("Error updating position:", error);
        throw error;
    }
};

export const deletePosition = async (id: string) => {
    try {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
    } catch (error) {
        console.error("Error deleting position:", error);
        throw error;
    }
};
