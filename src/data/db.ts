import { MongoClient } from 'mongodb';
import { config } from '../config';

// Fail fast instead of stalling signal processing for 30 seconds when Mongo is down.
const client = new MongoClient(config.mongodb.url, {
  ...config.mongodb.options,
  serverSelectionTimeoutMS: 2000,
  connectTimeoutMS: 2000,
});

export const alertsCollection = client.db(config.mongodb.dbName).collection('alerts');

export async function connectToDatabase(): Promise<void> {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

export async function closeDatabase(): Promise<void> {
  await client.close();
}
