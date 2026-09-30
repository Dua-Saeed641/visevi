import compression from 'compression'
import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import { env } from './env.js'
import { connectMongo, getDb } from './lib/mongo.js'
import { assetsRouter } from './routes/assets.js'
import { healthRouter } from './routes/health.js'
import { reportsRouter } from './routes/reports.js'
import { pollSites, signalsRouter } from './routes/signals.js'

async function main() {
  // Connect before accepting requests — fail loudly at startup rather than
  // on the first request if MongoDB is unreachable or the URI is wrong.
  await connectMongo()
  console.log('Connected to MongoDB')

  const app = express()

  app.use(compression()) // JSON compresses ~5x; matters on a deployed link
  app.use(cors({ origin: env.corsOrigin }))
  app.use(express.json())

  app.use('/api/health', healthRouter)
  app.use('/api/assets', assetsRouter)
  app.use('/api/reports', reportsRouter)
  app.use('/api/signals', signalsRouter)

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    res.status(500).json({ error: message })
  }
  app.use(errorHandler)

  app.listen(env.port, () => {
    console.log(`VisEvi API listening on http://localhost:${env.port}`)
  })

  // Automatic temperature polling: each monitored site is read on a timer and
  // any threshold breach raises an alert. Off unless configured (see env.ts).
  if (env.sensorPollMinutes > 0) {
    const run = () =>
      pollSites(getDb())
        .then((r) => console.log(`Sensor poll: ${r.length} site(s), ${r.filter((x) => x.alert).length} with an active alert`))
        .catch((err) => console.error('Sensor poll failed:', err))
    setInterval(run, env.sensorPollMinutes * 60_000)
    void run()
  }
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
