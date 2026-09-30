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

  // Optional: Google Maps Platform key with the Weather API enabled. Without
  // it, temperature polling falls back to Open-Meteo (keyless) and says so.
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
  // Minutes between automatic sensor polls. Defaults to 15 when a Google key is
  // set, otherwise off (manual poll and the ingest webhook still work).
  sensorPollMinutes: Number(process.env.SENSOR_POLL_MINUTES ?? (process.env.GOOGLE_MAPS_API_KEY ? 15 : 0)),

  // Where the client is served, so notifications can link straight to an alert.
  clientUrl: (process.env.CLIENT_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  // Optional email delivery through any SMTP server. Without it, notifications are recorded in-app.
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'VisEvi <no-reply@visevi.local>',
  },
  // Set AUTO_CAPTURE=off to stop alerts fetching a fresh satellite snapshot on their own.
  autoCapture: (process.env.AUTO_CAPTURE ?? 'on') !== 'off',

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
