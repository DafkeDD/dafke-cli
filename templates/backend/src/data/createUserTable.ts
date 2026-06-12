import pool from '../config/database'

const DATABASE_VERSION = 2 // Current database version in code

interface Migration {
    version: number
    queries: string[]
}

// Define migrations inline - each version specifies which queries to run
const migrations: Migration[] = [
    {
        version: 1,
        queries: [
            'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"',
            `CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                active SMALLINT DEFAULT 1,
                created_at TIMESTAMP DEFAULT NOW()
            )`,
            `INSERT INTO users (id, name, email, active) VALUES
                (uuid_generate_v4(), 'John Doe', 'john.doe@example.com', 1),
                (uuid_generate_v4(), 'Jane Smith', 'jane.smith@example.com', 1),
                (uuid_generate_v4(), 'Bob Johnson', 'bob.johnson@example.com', 0),
                (uuid_generate_v4(), 'Alice Williams', 'alice.williams@example.com', 1),
                (uuid_generate_v4(), 'Charlie Brown', 'charlie.brown@example.com', 1)
            ON CONFLICT (email) DO NOTHING`
        ]
    },
    {
        version: 2,
        queries: [
            `CREATE TABLE IF NOT EXISTS persons (
                id SERIAL PRIMARY KEY,
                name VARCHAR(250),
                first_name VARCHAR(250),
                street VARCHAR(250),
                street_number VARCHAR(50),
                zip VARCHAR(50),
                city VARCHAR(250),
                telephone VARCHAR(250),
                cell_phone VARCHAR(250),
                email_address VARCHAR(250),
                date_of_birth TIMESTAMP,
                profession VARCHAR(250),
                sex INTEGER,
                additional_name VARCHAR(250)
            )`
        ]
    }
]

const createUserTable = async () => {
    try {
        // Create version tracking table first
        await pool.query(`
            CREATE TABLE IF NOT EXISTS database_state (
                version INT PRIMARY KEY,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `)
        console.log('Database state table created.')

        // Check current database version
        const versionResult = await pool.query(
            'SELECT version FROM database_state ORDER BY version DESC LIMIT 1'
        )
        const currentDbVersion =
            versionResult.rows.length > 0 ? versionResult.rows[0].version : 0

        console.log(
            `Code version: ${DATABASE_VERSION}, Database version: ${currentDbVersion}`
        )

        // If database version is lower than code version, run migrations
        if (currentDbVersion < DATABASE_VERSION) {
            console.log('Running database migrations...')

            // Run each migration sequentially
            for (const migration of migrations) {
                if (
                    migration.version > currentDbVersion &&
                    migration.version <= DATABASE_VERSION
                ) {
                    console.log(`Executing migration v${migration.version}...`)

                    for (const query of migration.queries) {
                        await pool.query(query)
                    }

                    // Update version after successful migration
                    await pool.query(
                        'INSERT INTO database_state (version) VALUES ($1) ON CONFLICT (version) DO UPDATE SET updated_at = NOW()',
                        [migration.version]
                    )
                    console.log(
                        `Migration v${migration.version} completed successfully.`
                    )
                }
            }

            console.log(`Database migrated to version ${DATABASE_VERSION}`)
        } else {
            console.log('Database is up to date.')
        }
    } catch (error) {
        console.log('Error creating user table or seeding data:', error)
    }
}

export default createUserTable
