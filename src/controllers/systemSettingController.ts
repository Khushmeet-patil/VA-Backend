import { Request, Response } from 'express';
import SystemSetting from '../models/SystemSetting';

// Get all settings (Admin)
export const getAllSettings = async (req: Request, res: Response) => {
    try {
        const settings = await SystemSetting.find();
        res.json({ success: true, data: settings });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Update or create a setting (Admin)
export const updateSetting = async (req: Request, res: Response) => {
    try {
        const { key, value, description } = req.body;

        if (!key || value === undefined) {
            return res.status(400).json({ success: false, message: 'Key and value are required' });
        }

        const setting = await SystemSetting.findOneAndUpdate(
            { key },
            { key, value, description },
            { upsert: true, new: true }
        );

        res.json({ success: true, message: 'Setting updated successfully', data: setting });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Get specific setting (Public/Astrologer)
export const getSettingByKey = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const setting = await SystemSetting.findOne({ key });

        if (!setting) {
            // Provide default values if not found in DB
            if (key === 'minWithdrawalBalance') {
                return res.json({ success: true, data: { key, value: 200 } });
            }
            if (key === 'astrologerSupportEmail') {
                return res.json({ success: true, data: { key, value: 'support@vedicastro.com' } });
            }
            return res.status(404).json({ success: false, message: 'Setting not found' });
        }

        res.json({ success: true, data: setting });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Internal helper to get value
export const getSettingValue = async (key: string, defaultValue: any) => {
    try {
        const setting = await SystemSetting.findOne({ key });
        return setting ? setting.value : defaultValue;
    } catch (error) {
        return defaultValue;
    }
};
