import { Request, Response, NextFunction } from 'express'
import {
    getAllUsersService,
    getUserByIdService,
    createUserService,
    updateUserService,
    deleteUserService
} from '../models/userModel'

const sendResponse = <T>(
    res: Response,
    status: number,
    message: string,
    data?: T
): void => {
    res.status(status).json({
        success: status < 400,
        message,
        data
    })
}

const isValidId = (id: string): boolean => {
    // UUID v4 pattern: 8-4-4-4-12 hexadecimal digits
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id
    )
}

export const getAllUsers = async (
    _req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const users = await getAllUsersService()
        sendResponse(res, 200, 'Users fetched successfully', users)
    } catch (error) {
        next(error)
    }
}

export const getUserById = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { id } = req.params as { id: string }

        if (!isValidId(id)) {
            sendResponse(res, 400, 'Invalid user id')
            return
        }

        const user = await getUserByIdService(id)

        if (!user) {
            sendResponse(res, 404, 'User not found')
            return
        }

        sendResponse(res, 200, 'User fetched successfully', user)
    } catch (error) {
        next(error)
    }
}

export const createUser = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { name, email } = req.body as {
            name?: string
            email?: string
        }

        if (!name || !email) {
            sendResponse(res, 400, 'Name and email are required')
            return
        }

        if (typeof name !== 'string' || typeof email !== 'string') {
            sendResponse(res, 400, 'Invalid input types')
            return
        }

        const newUser = await createUserService(
            name.trim(),
            email.toLowerCase()
        )

        sendResponse(res, 201, 'User created successfully', newUser)
    } catch (error) {
        next(error)
    }
}

export const updateUser = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { id } = req.params as { id: string }
        const { name, email, active } = req.body as {
            name?: string
            email?: string
            active?: number
        }

        if (!isValidId(id)) {
            sendResponse(res, 400, 'Invalid user id')
            return
        }

        if (
            (name && typeof name !== 'string') ||
            (email && typeof email !== 'string') ||
            (active !== undefined && typeof active !== 'number')
        ) {
            sendResponse(res, 400, 'Invalid input types')
            return
        }

        const updatedUser = await updateUserService(
            id,
            name ? name.trim() : undefined,
            email ? email.toLowerCase() : undefined,
            active
        )

        if (!updatedUser) {
            sendResponse(res, 404, 'User not found')
            return
        }

        sendResponse(res, 200, 'User updated successfully', updatedUser)
    } catch (error) {
        next(error)
    }
}

export const deleteUser = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { id } = req.params as { id: string }

        if (!isValidId(id)) {
            sendResponse(res, 400, 'Invalid user id')
            return
        }

        const deletedUser = await deleteUserService(id)

        if (!deletedUser) {
            sendResponse(res, 404, 'User not found')
            return
        }

        sendResponse(res, 200, 'User deleted successfully', deletedUser)
    } catch (error) {
        next(error)
    }
}
