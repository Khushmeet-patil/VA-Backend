import { Request, Response } from 'express';

export const getHealth = (req: Request, res: Response) => {
    res.status(200).json({ message: 'Backend is healthy', status: 'OK' });
};
