import dotenv from 'dotenv'

dotenv.config()

import express from 'express'
import cors from 'cors'
import pool from './config/database'
import userRoutes from './routes/userRoutes'
import createUserTable from './data/createUserTable'
import errorHandling from './middleware/errorHandler'

const app = express()
const PORT = Number(process.env.PORT) || 5000

// CORS - allow all origins in development
app.use(cors())
app.use(express.json())

// Routes
app.use('/api', userRoutes)

// Test endpoint
app.get('/api/test', (_req, res) => {
    res.json({ message: 'CORS is working!' })
})

// Run database migrations on startup
createUserTable()

// DB health check
app.get('/', async (_req, res) => {
    try {
        const result = await pool.query('SELECT current_database()')
        res.status(200).send(
            `Connected to database: ${result.rows[0].current_database}`
        )
    } catch (error) {
        console.error('Database query failed', error)
        res.status(500).send('Database connection failed')
    }
})

// Centralized error handler (keep last)
app.use(errorHandling)

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`)
})
