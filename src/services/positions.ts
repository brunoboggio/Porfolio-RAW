import {
    collection,
    onSnapshot,
    query,
    orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import { type Operation } from './operations';

export interface Position {
    id: string; // Generated ID for the derived position (e.g. Ticker-Broker)
    ticker: string;
    quantity: number;
    buyPrice: number;
    buyDate: string;
    broker?: string;
}

// Helper to calculate positions from operations
const calculatePositions = (operations: Operation[]): Position[] => {
    // We Map: Key = Ticker + Broker
    const positionMap: Record<string, Position> = {};

    // Sort operations by date (ascending) to process history chronologically
    const sortedOps = [...operations].sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateA - dateB;
    });

    sortedOps.forEach(op => {
        const brokerKey = op.broker || 'Unassigned';
        const key = `${op.ticker}-${brokerKey}`;

        if (!positionMap[key]) {
            // Initialize empty if not exists (only valid for ADD usually)
            // If REMOVE comes first (weird data), we treat as 0 base.
            positionMap[key] = {
                id: key,
                ticker: op.ticker,
                quantity: 0,
                buyPrice: 0,
                buyDate: op.date,
                broker: op.broker
            };
        }

        const pos = positionMap[key];

        if (op.type === 'ADD') {
            // Weighted Average Cost Basis
            const totalCost = (pos.quantity * pos.buyPrice) + (op.quantity * op.price);
            const newQuantity = pos.quantity + op.quantity;

            pos.buyPrice = newQuantity > 0 ? totalCost / newQuantity : 0;
            pos.quantity = newQuantity;

            // If position was closed (qty 0) and reopened, update buyDate
            if (pos.quantity === op.quantity) {
                pos.buyDate = op.date;
            }

        } else if (op.type === 'REMOVE') {
            // Selling reduces quantity but doesn't change Avg Buy Price
            pos.quantity -= op.quantity;
        }

        // Cleanup precision issues
        if (pos.quantity < 0) pos.quantity = 0;
    });

    // Return only active positions (qty > 0)
    return Object.values(positionMap).filter(p => p.quantity > 0.000001);
};

export const subscribeToPositions = (onUpdate: (positions: Position[]) => void) => {
    // Listen to OPERATIONS, not positions
    // We need all operations to calculate current state correctly
    const q = query(collection(db, 'operations'), orderBy('timestamp', 'asc'));

    return onSnapshot(q, (snapshot) => {
        const operations = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as Operation[];

        const derivedPositions = calculatePositions(operations);
        onUpdate(derivedPositions);
    }, (error) => {
        console.error("Error fetching operations for positions:", error);
    });
};

// Deprecated functions - No-op or throw error to ensure they aren't used
export const addPosition = async () => { console.warn("addPosition is deprecated. Use logOperation."); };
export const updatePosition = async () => { console.warn("updatePosition is deprecated. Use logOperation."); };
export const deletePosition = async () => { console.warn("deletePosition is deprecated. Use logOperation."); };
