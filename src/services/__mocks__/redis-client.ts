// Mock Redis client for testing
import { IRedisClient } from "../redis-client";

export class MockRedisClient implements IRedisClient {
  private storage: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.storage.get(key) || null;
  }

  async set(key: string, value: string): Promise<string> {
    this.storage.set(key, value);
    return 'OK';
  }

  async publish(_channel: string, _message: string): Promise<number> {
    return 0;
  }

  async subscribe(_channel: string): Promise<void> {
    // no-op
  }

  on(_event: string, _callback: (channel: string, message: string) => void): this {
    return this;
  }

  async quit(): Promise<string> {
    return 'OK';
  }
}

export const mockRedisClient = new MockRedisClient();
