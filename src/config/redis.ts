import Redis, { RedisOptions } from 'ioredis';

/**
 * Redis client shared across the process.
 *
 * Used for:
 *  1. Socket.IO Redis adapter  (pub/sub — two separate connections required)
 *  2. Session cache            (GET/SET/DEL)
 *
 * REDIS_URL defaults to localhost:6379 (no auth).
 * Set REDIS_URL=redis://:password@host:port in .env for remote/auth Redis.
 */

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const redisOptions: RedisOptions = {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    reconnectOnError: (err: Error) => {
        return err.message.includes('READONLY');
    },
    lazyConnect: false,
};

// Main client — used for GET/SET/DEL (session cache, etc.)
export const redisClient = new Redis(REDIS_URL, redisOptions);

// Dedicated pub/sub clients for Socket.IO Redis adapter
// (Socket.IO adapter requires two separate connections)
export const redisPub = new Redis(REDIS_URL, redisOptions);
export const redisSub = new Redis(REDIS_URL, redisOptions);

redisClient.on('connect', () => console.log('[Redis] Client connected'));
redisClient.on('error', (err) => console.error('[Redis] Client error:', err.message));
redisPub.on('error', (err) => console.error('[Redis] Pub error:', err.message));
redisSub.on('error', (err) => console.error('[Redis] Sub error:', err.message));

export default redisClient;
