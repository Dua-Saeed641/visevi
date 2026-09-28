import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Single shared .env at repo root — see ../../.env.example.
config({ path: path.resolve(__dirname, '../../.env') })

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  get databaseUrl() {
    return required('DATABASE_URL')
  },
  get cloudinary() {
    return {
      cloudName: required('CLOUDINARY_CLOUD_NAME'),
      apiKey: required('CLOUDINARY_API_KEY'),
      apiSecret: required('CLOUDINARY_API_SECRET'),
    }
  },
}
