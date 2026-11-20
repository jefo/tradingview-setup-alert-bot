import { mock } from 'bun:test';

// Keep test output readable; individual tests can unmock console when needed.
const consoleMock = {
  log: mock(() => {}),
  error: mock(() => {}),
  warn: mock(() => {}),
  info: mock(() => {})
};

Object.assign(console, consoleMock);

// Shared in-memory Redis double used by every module that imports ./redis.
const storage = new Map<string, string>();
const subscribers = new Map<string, Function[]>();

const mockRedis = {
  async get(key: string) {
    return storage.get(key) ?? null;
  },
  async set(key: string, value: string) {
    storage.set(key, value);
    return 'OK';
  },
  async publish(channel: string, message: string) {
    (subscribers.get(channel) ?? []).forEach((callback) => callback(channel, message));
    return 1;
  },
  async subscribe(channel: string) {
    if (!subscribers.has(channel)) subscribers.set(channel, []);
  },
  on(event: string, callback: Function) {
    if (event === 'message') {
      for (const channel of ['raw_signals', 'processed_signals', 'monitoring']) {
        if (!subscribers.has(channel)) subscribers.set(channel, []);
        subscribers.get(channel)!.push(callback);
      }
    }
    return mockRedis;
  },
  async quit() {
    return 'OK';
  }
};

mock.module('./redis', () => ({
  publisherClient: mockRedis,
  subscriberClient: mockRedis,
  stateClient: mockRedis,
  client: mockRedis,
  default: mockRedis
}));

// Setup process.env defaults for tests
process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.BOT_TOKEN = 'test-token';
process.env.REDIS_URL = 'redis://mock';
