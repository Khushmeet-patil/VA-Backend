import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Astrologer from '../models/Astrologer';

export interface AuthRequest extends Request {
    userId?: string;
    userRole?: string;
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { id: string; role?: string };

        // Check if this is an astrologer token
        if (decoded.role === 'astrologer') {
            const astrologer = await Astrologer.findById(decoded.id);
            if (!astrologer) {
                return res.status(401).json({ message: 'Astrologer not found' });
            }
            if (astrologer.status !== 'approved') {
                return res.status(403).json({ message: 'Astrologer not approved' });
            }
            req.userId = decoded.id;
            req.userRole = 'astrologer';
            return next();
        }

        // Regular user token
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        if (user.isBlocked) {
            return res.status(403).json({ message: 'User is blocked' });
        }

        req.userId = decoded.id;
        req.userRole = user.role;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid token' });
    }
};

export const adminMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.userRole !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
};
