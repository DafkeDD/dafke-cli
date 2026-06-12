import { Request, Response, NextFunction } from 'express'
import Joi from 'joi'

const userSchema = Joi.object({
    name: Joi.string().min(3).max(30).optional(),
    email: Joi.string().email().optional(),
    active: Joi.number().valid(0, 1).optional()
}).min(1)

export const validateUser = (
    req: Request,
    res: Response,
    next: NextFunction
): void | Response => {
    const { error } = userSchema.validate(req.body)
    if (error) {
        return res.status(400).json({
            success: false,
            status: 400,
            message: error.details[0].message
        })
    }
    next()
}

export default validateUser
