import pool from '../config/database'

export const getAllUsersService = async () => {
    const result = await pool.query('SELECT * FROM users')
    return result.rows
}

export const getUserByIdService = async (id: string) => {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id])
    return result.rows[0]
}

export const createUserService = async (name: string, email: string) => {
    const result = await pool.query(
        'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
        [name, email]
    )
    return result.rows[0]
}

export const updateUserService = async (
    id: string,
    name?: string,
    email?: string,
    active?: number
) => {
    const updates: string[] = []
    const values: any[] = []
    let paramCount = 1

    if (name !== undefined) {
        updates.push(`name = $${paramCount++}`)
        values.push(name)
    }

    if (email !== undefined) {
        updates.push(`email = $${paramCount++}`)
        values.push(email)
    }

    if (active !== undefined) {
        updates.push(`active = $${paramCount++}`)
        values.push(active)
    }

    if (updates.length === 0) {
        return undefined
    }

    values.push(id)
    const result = await pool.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
    )
    return result.rows[0]
}

export const deleteUserService = async (id: string) => {
    const result = await pool.query(
        'UPDATE users SET active = 0 WHERE id = $1 RETURNING *',
        [id]
    )
    return result.rows[0]
}
