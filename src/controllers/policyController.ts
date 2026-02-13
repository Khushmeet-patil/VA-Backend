import { Request, Response } from 'express';
import { Policy } from '../models/Policy';

export const getPolicies = async (req: Request, res: Response) => {
    try {
        const policies = await Policy.find();
        res.status(200).json(policies);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching policies', error });
    }
};

export const getPolicyByKey = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const policy = await Policy.findOne({ key });
        if (!policy) {
            return res.status(404).json({ message: 'Policy not found' });
        }
        res.status(200).json(policy);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching policy', error });
    }
};

export const updatePolicy = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const { title, content } = req.body;

        let policy = await Policy.findOne({ key });

        if (policy) {
            policy.title = title || policy.title;
            policy.content = content || policy.content;
            policy.lastUpdated = new Date();
            await policy.save();
        } else {
            // Create if not exists (optional, but good for initialization)
            policy = new Policy({ key, title, content });
            await policy.save();
        }

        res.status(200).json(policy);
    } catch (error) {
        res.status(500).json({ message: 'Error updating policy', error });
    }
};
