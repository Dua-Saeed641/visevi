import { MongoClient, type Db } from 'mongodb'
import { env } from '../env.js'

let client: MongoClient | undefined
let db: Db | undefined

/** Connects once at server startup. Call before app.listen(); see index.ts. */
export async function connectMongo(): Promise<Db> {
  if (db) return db

  client = new MongoClient(env.databaseUrl)
  await client.connect()
  // Database name comes from the connection string's path segment
  // (see .env.example: .../visevi?...) — no separate config needed.
  db = client.db()

  await ensureIndexes(db)

  return db
}

async function ensureIndexes(database: Db): Promise<void> {
  await database.collection('projects').createIndex({ name: 1 }, { unique: true })
  await database
    .collection('locations')
    .createIndex({ projectId: 1, name: 1 }, { unique: true })
  await database.collection('assets').createIndex({ cloudinaryPublicId: 1 }, { unique: true })
  await database.collection('assets').createIndex({ projectId: 1 })
  await database.collection('assets').createIndex({ locationId: 1 })
  await database.collection('assets').createIndex({ perceptualHash: 1 })
}

/** Throws if connectMongo() hasn't run yet — mirrors env.ts's fail-fast style. */
export function getDb(): Db {
  if (!db) {
    throw new Error('MongoDB not connected: connectMongo() must run before the server starts handling requests')
  }
  return db
}

export async function closeMongo(): Promise<void> {
  await client?.close()
  client = undefined
  db = undefined
}
