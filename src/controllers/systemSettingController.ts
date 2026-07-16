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
            if (key === 'gstRate') {
                return res.json({ success: true, data: { key, value: 18 } });
            }
            if (key === 'rechargePacks') {
                const defaultPacks = [
                    { amount: 50, bonus: 0 },
                    { amount: 100, bonus: 5 },
                    { amount: 199, bonus: 10 },
                    { amount: 300, bonus: 15 },
                    { amount: 500, bonus: 20 },
                    { amount: 1000, bonus: 25 },
                ];
                return res.json({ success: true, data: { key, value: defaultPacks } });
            }
            if (key === 'globalDiscount') {
                return res.json({ success: true, data: { key, value: 10 } });
            }
            if (key === 'minWithdrawalBalance') {
                return res.json({ success: true, data: { key, value: 200 } });
            }
            if (key === 'astrologerSupportEmail') {
                return res.json({ success: true, data: { key, value: 'support@vedicastro.co.in' } });
            }
            if (key === 'astrologerCommission') {
                return res.json({ success: true, data: { key, value: 40 } }); // 40% to astrologer
            }
            if (key === 'voiceCallCommission') {
                return res.json({ success: true, data: { key, value: 40 } }); // 40% to astrologer for voice calls
            }
            if (key === 'videoCallCommission') {
                return res.json({ success: true, data: { key, value: 40 } }); // 40% to astrologer for video calls
            }
            if (key === 'bonusUsagePercent') {
                return res.json({ success: true, data: { key, value: 20 } }); // 20% from bonus wallet
            }
            if (key === 'socialMediaLinks') {
                return res.json({
                    success: true, data: {
                        key, value: {
                            instagram: 'https://instagram.com',
                            facebook: 'https://facebook.com',
                            linkedin: 'https://linkedin.com',
                            youtube: 'https://youtube.com',
                            website: 'https://vedicastro.com'
                        }
                    }
                });
            }
            if (key === 'ASTROLOGER_NOTIFICATION_TEMPLATES') {
                return res.json({ success: true, data: { key, value: ['Hello {username}, I am available now!'] } });
            }
            if (key === 'ASTROLOGER_NOTIFICATION_LIMIT_PER_DAY') {
                return res.json({ success: true, data: { key, value: 5 } });
            }
            if (key === 'ASTROLOGER_NOTIFICATION_COOLDOWN_HOURS') {
                return res.json({ success: true, data: { key, value: 24 } });
            }
            if (key === 'OFFLINE_NOTIFY_MSG') {
                return res.json({ success: true, data: { key, value: 'Dear {astrologername}, {username} is waiting for you to come online.' } });
            }
            if (key === 'kundliPdfBasicPrice') {
                return res.json({ success: true, data: { key, value: 99 } });
            }
            if (key === 'kundliPdfProPrice') {
                return res.json({ success: true, data: { key, value: 199 } });
            }
            if (key === 'numerologyPdfPrice') {
                return res.json({ success: true, data: { key, value: 149 } });
            }
            if (key === 'matchmakingPdfPrice') {
                return res.json({ success: true, data: { key, value: 299 } });
            }
            if (key === 'gemstonePdfPrice') {
                return res.json({ success: true, data: { key, value: 199 } });
            }
            if (key === 'gemstonePdfDiscount') {
                return res.json({ success: true, data: { key, value: 50 } });
            }
            if (key === 'lifeforecastPdfPrice') {
                return res.json({ success: true, data: { key, value: 399 } });
            }
            if (key === 'lifeforecastPdfDiscount') {
                return res.json({ success: true, data: { key, value: 50 } });
            }
            if (key === 'kundliPdfBasicDiscount') {
                return res.json({ success: true, data: { key, value: 50 } });
            }
            if (key === 'kundliPdfProDiscount') {
                return res.json({ success: true, data: { key, value: 50 } });
            }
            if (key === 'numerologyPdfDiscount') {
                return res.json({ success: true, data: { key, value: 50 } });
            }
            if (key === 'matchmakingPdfDiscount') {
                return res.json({ success: true, data: { key, value: 50 } });
            }
            if (key === 'kundliPdfCompanyName') {
                return res.json({ success: true, data: { key, value: '' } });
            }
            if (key === 'kundliPdfCompanyEmail') {
                return res.json({ success: true, data: { key, value: 'support@vedicastro.co.in' } });
            }
            if (key === 'kundliPdfCompanyMobile') {
                return res.json({ success: true, data: { key, value: '+91 75749 70100' } });
            }
            if (key === 'kundliPdfCompanyInfo') {
                return res.json({ success: true, data: { key, value: 'VedicAstro provides personalized horoscope predictions and guidance.' } });
            }
            if (key === 'kundliPdfLogoUrl') {
                return res.json({ success: true, data: { key, value: 'https://pub-b2ae4a07bcf84513b37ee77414a45541.r2.dev/logo/Untitled%20design%20(18)%20(1).png' } });
            }
            if (key === 'kundliPdfDomainUrl') {
                return res.json({ success: true, data: { key, value: 'https://vedicastro.co.in' } });
            }
            if (key === 'kundliPdfFooterLink') {
                return res.json({ success: true, data: { key, value: 'vedicastro.co.in' } });
            }
            if (key === 'kundliPdfCompanyLandline') {
                return res.json({ success: true, data: { key, value: '+91-1234567890' } });
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
