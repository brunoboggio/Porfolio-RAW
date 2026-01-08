import {
    doc,
    setDoc,
    onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';

export interface UserSettings {
    nonLeveragedCapital: number;
}

const COLLECTION_NAME = 'settings';
const DOC_ID = 'default';

export const updateUserSettings = async (settings: Partial<UserSettings>) => {
    try {
        const docRef = doc(db, COLLECTION_NAME, DOC_ID);
        // setDoc with merge: true will create if not exists
        await setDoc(docRef, settings, { merge: true });
    } catch (error) {
        console.error("Error updating settings:", error);
        throw error;
    }
};

export const subscribeToSettings = (onUpdate: (settings: UserSettings) => void) => {
    const docRef = doc(db, COLLECTION_NAME, DOC_ID);

    return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            onUpdate(docSnap.data() as UserSettings);
        } else {
            // Default if nothing exists
            onUpdate({ nonLeveragedCapital: 0 });
        }
    }, (error) => {
        console.error("Error fetching settings:", error);
    });
};
