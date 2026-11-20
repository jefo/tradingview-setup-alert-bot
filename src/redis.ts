import Redis from 'ioredis';
import { config } from './config';
import { RedisClient } from './services/redis-client';

const commonOptions = {
  connectTimeout: 2000,
  maxRetriesPerRequest: 1,
  retryStrategy: (times: number) => Math.min(times * 200, 2000),
};

// Publisher fails fast: a webhook must not hang for seconds when Redis is down.
const publisherInstance = new Redis(config.redis.url, {
  ...commonOptions,
  enableOfflineQueue: false,
});

// Subscriber may wait for the initial connection: it is a long-lived consumer.
const subscriberInstance = new Redis(config.redis.url, {
  ...commonOptions,
  enableOfflineQueue: true,
});

// State backup/restore is allowed to queue while Redis reconnects.
const stateInstance = new Redis(config.redis.url, {
  ...commonOptions,
  enableOfflineQueue: true,
});

publisherInstance.on('error', (error) => {
  console.error('Publisher Redis error:', error.message);
});

subscriberInstance.on('error', (error) => {
  console.error('Subscriber Redis error:', error.message);
});

publisherInstance.on('connect', () => {
  console.log('Publisher connected to Redis');
});

subscriberInstance.on('connect', () => {
  console.log('Subscriber connected to Redis');
});

stateInstance.on('error', (error) => {
  console.error('State Redis error:', error.message);
});

stateInstance.on('connect', () => {
  console.log('State store connected to Redis');
});

export const publisherClient = new RedisClient(publisherInstance);
export const subscriberClient = new RedisClient(subscriberInstance);
export const stateClient = new RedisClient(stateInstance);

// Export publisherClient as default for backward compatibility
export const client = publisherClient;
