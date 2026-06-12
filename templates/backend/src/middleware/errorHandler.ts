import { Request, Response, NextFunction } from 'express'

interface CustomError extends Error {
    status?: number
    message: string
}

const errorHandling = (
    err: CustomError,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const status = err.status || 500
    const message = err.message || 'Internal Server Error'

    console.error(err.stack)
    res.status(status).json({
        success: false,
        status,
        message,
        error: process.env.NODE_ENV === 'development' ? err : {}
    })
}

export default errorHandling
