import { Request, Response } from 'express';
import horoscopeService from '../services/horoscopeService';

export const getRashi = async (req: Request, res: Response) => {
    try {
        const data = await horoscopeService.getAstroDetails(req.body);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getDailyPrediction = async (req: Request, res: Response) => {
    try {
        const { sign, day, timezone } = req.body;
        if (!sign) {
            res.status(400).json({ message: 'Sign is required' });
            return;
        }
        const data = await horoscopeService.getDailyPrediction(sign, day, timezone);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getNumeroPrediction = async (req: Request, res: Response) => {
    try {
        const { day, month, year, name } = req.body;
        if (!day || !month || !year || !name) {
            res.status(400).json({ message: 'Day, Month, Year, and Name are required' });
            return;
        }
        const data = await horoscopeService.getNumeroPrediction(day, month, year, name);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getLuckyTime = async (req: Request, res: Response) => {
    try {
        const data = await horoscopeService.getLuckyTime(req.body);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getMonthlyPrediction = async (req: Request, res: Response) => {
    try {
        const { sign, timezone } = req.body;
        if (!sign) {
            res.status(400).json({ message: 'Sign is required' });
            return;
        }
        const data = await horoscopeService.getMonthlyPrediction(sign, timezone);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getYearlyPrediction = async (req: Request, res: Response) => {
    try {
        const { sign, year, timezone } = req.body;
        if (!sign || !year) {
            res.status(400).json({ message: 'Sign and Year are required' });
            return;
        }
        const data = await horoscopeService.getYearlyPrediction(sign, year, timezone);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getRemedies = async (req: Request, res: Response) => {
    try {
        const { sign } = req.params;
        if (!sign) {
            res.status(400).json({ message: 'Sign is required' });
            return;
        }
        const data = horoscopeService.getRemedies(sign);
        res.json({ sign, remedies: data });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const searchPlaces = async (req: Request, res: Response) => {
    try {
        const { query } = req.query;
        if (!query || typeof query !== 'string') {
            res.status(400).json({ message: 'Query parameter is required' });
            return;
        }
        const data = await horoscopeService.getPlaceSuggestions(query);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
