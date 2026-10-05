import mongoose from "mongoose";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

const globalCache = globalThis as typeof globalThis & { __hqMongoose?: Cache };

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Start MongoDB or run npm run dev:local.");
  }
  if (!globalCache.__hqMongoose) globalCache.__hqMongoose = { conn: null, promise: null };
  const cache = globalCache.__hqMongoose;
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    mongoose.set("strictQuery", true);
    cache.promise = mongoose.connect(uri, { bufferCommands: false });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}

export async function disconnectDB() {
  await mongoose.disconnect();
  if (globalCache.__hqMongoose) globalCache.__hqMongoose = { conn: null, promise: null };
}

export async function withTransaction<T>(work: (session: mongoose.ClientSession | null) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/replica set|Transaction numbers are only allowed/i.test(message)) {
      return work(null);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export function sessionOptions(session: mongoose.ClientSession | null | undefined) {
  return session ? { session } : {};
}
