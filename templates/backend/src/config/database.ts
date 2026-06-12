// postgresql database configuration
import pkg from 'pg'
const { Pool } = pkg

import dotenv from 'dotenv'

dotenv.config()

let pool: any

try {
    console.log(process.env.DB_USER)
    console.log(process.env.DB_HOST)

    pool = new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_DATABASE,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT)
    })

    pool.on('connect', () => {
        console.log('Connected to the database')
    })

    pool.on('error', (err: Error) => {
        console.error('Unexpected error on idle client', err)
    })
} catch (error) {
    console.error('Failed to initialize database pool:', error)
    process.exit(1)
}

export default pool
