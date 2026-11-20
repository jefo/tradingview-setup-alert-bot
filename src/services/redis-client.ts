import { Redis } from 'ioredis';

export interface IRedisClient {
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string): Promise<void>;
  on(event: string, callback: (channel: string, message: string) => void): this;
  quit(): Promise<string>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<string>;
}

export class RedisClient implements IRedisClient {
  private client: Redis;

  constructor(client: Redis) {
    this.client = client;
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  async subscribe(channel: string): Promise<void> {
    await this.client.subscribe(channel);
  }

  on(event: string, callback: (channel: string, message: string) => void): this {
    this.client.on(event, callback);
    return this;
  }

  async quit(): Promise<string> {
    return this.client.quit();
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string): Promise<string> {
    return this.client.set(key, value);
  }
}
