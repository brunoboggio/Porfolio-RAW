import axios from 'axios';

const token = 'd1ptae9r01qku4u4ig80d1ptae9r01qku4u4ig8g';
const symbol = 'BAH';
// Test with known past dates (Jan 2024)
// 2024-01-01 = 1704067200
// 2024-02-01 = 1706745600
const from = 1704067200;
const to = 1706745600;

// Use https://finnhub.io directly since we are running in Node (no CORS)
const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${token}`;

console.log(`Testing URL: ${url}`);
console.log(`Date Range: ${new Date(from * 1000).toISOString()} to ${new Date(to * 1000).toISOString()}`);

async function testApi() {
    try {
        const response = await axios.get(url);
        console.log("Success:", response.status);
        console.log("Data:", response.data);
    } catch (error) {
        console.error("Error Status:", error.response?.status);
        console.error("Error Data:", error.response?.data);
        console.error("Error Message:", error.message);
    }
}

testApi();
