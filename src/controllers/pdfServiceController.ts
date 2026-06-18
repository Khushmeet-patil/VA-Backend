import { Request, Response } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import KundliPdfRequest from '../models/KundliPdfRequest';
import Transaction from '../models/Transaction';
import User from '../models/User';
import { generateKundliPdf, sendPdfEmail, generateNumerologyPdf, sendNumerologyPdfEmail } from '../services/pdfService';
import { getSettingValue } from './systemSettingController';
import mongoose from 'mongoose';
import axios from 'axios';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || '',
    key_secret: process.env.RAZORPAY_KEY_SECRET || ''
});

interface AuthRequest extends Request {
    userId?: string;
}

// 1. Create Order — supports both Kundli and Numerology PDFs
export const createPdfOrder = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const { reportType = 'kundli', ...body } = req.body;

        let amount: number;
        let pdfRequest: any;

        if (reportType === 'numerology') {
            // Numerology PDF: only needs name, day, month, year, language, email
            const { name, day, month, year, language, email } = body;

            if (!name || !day || !month || !year || !email) {
                return res.status(400).json({ success: false, message: 'Name, date of birth, and email are required for Numerology PDF.' });
            }

            const basePrice = await getSettingValue('numerologyPdfPrice', 149);
            const gstRate = await getSettingValue('gstRate', 18);
            const gstAmount = (basePrice * gstRate) / 100;
            amount = basePrice + gstAmount;

            pdfRequest = await KundliPdfRequest.create({
                user: userId,
                reportType: 'numerology',
                name,
                day: Number(day),
                month: Number(month),
                year: Number(year),
                language: language || 'en',
                email,
                amount,
                pdfType: 'numerology',
                status: 'pending'
            });
        } else {
            // Kundli PDF
            const { name, gender, day, month, year, hour, min, lat, lon, tzone, place, pdfType, language, email } = body;

            if (!name || !gender || !day || !month || !year || hour === undefined || min === undefined ||
                lat === undefined || lon === undefined || tzone === undefined || !place || !pdfType || !email) {
                return res.status(400).json({ success: false, message: 'All birth details, pdfType, and email are required.' });
            }

            const rateKey = pdfType === 'pro' ? 'kundliPdfProPrice' : 'kundliPdfBasicPrice';
            const defaultRate = pdfType === 'pro' ? 199 : 99;
            const basePrice = await getSettingValue(rateKey, defaultRate);
            const gstRate = await getSettingValue('gstRate', 18);
            const gstAmount = (basePrice * gstRate) / 100;
            amount = basePrice + gstAmount;

            pdfRequest = await KundliPdfRequest.create({
                user: userId,
                reportType: 'kundli',
                name,
                gender,
                day: Number(day),
                month: Number(month),
                year: Number(year),
                hour: Number(hour),
                min: Number(min),
                lat: Number(lat),
                lon: Number(lon),
                tzone: Number(tzone),
                place,
                pdfType,
                language: language || 'en',
                email,
                amount,
                status: 'pending'
            });
        }

        // Setup Razorpay options
        const options = {
            amount: Math.round(amount * 100),
            currency: 'INR',
            receipt: pdfRequest._id.toString(),
            notes: { userId, pdfRequestId: pdfRequest._id.toString(), reportType }
        };

        let orderId = `mock_order_${pdfRequest._id}`;
        let orderAmount = Math.round(amount * 100);
        let currency = 'INR';

        try {
            if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
                const order = await razorpay.orders.create(options);
                orderId = order.id;
                orderAmount = Number(order.amount);
                currency = order.currency;
            } else {
                console.log('[PDF Service Controller] Razorpay credentials missing. Using mock order ID for testing.');
            }
        } catch (err: any) {
            console.warn('[PDF Service Controller] Razorpay order creation failed, using mock:', err.message);
        }

        return res.status(200).json({
            success: true,
            orderId,
            amount: orderAmount,
            currency,
            key_id: process.env.RAZORPAY_KEY_ID || 'mock_key_id',
            pdfRequestId: pdfRequest._id
        });

    } catch (error: any) {
        console.error('[PDF Service Controller] createPdfOrder Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to initiate PDF purchase order', error: error.message });
    }
};

// 2. Verify Payment & Generate PDF (Kundli or Numerology)
export const verifyPdfPayment = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, pdfRequestId } = req.body;

        const isBypass = !process.env.RAZORPAY_KEY_SECRET;

        if (!pdfRequestId) {
            return res.status(400).json({ success: false, message: 'Missing PDF request ID.' });
        }

        if (!isBypass) {
            if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
                return res.status(400).json({ success: false, message: 'Missing payment signature components.' });
            }

            const body = razorpay_order_id + '|' + razorpay_payment_id;
            const expectedSignature = crypto
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
                .update(body.toString())
                .digest('hex');

            if (expectedSignature !== razorpay_signature) {
                return res.status(400).json({ success: false, message: 'Invalid payment signature' });
            }
        }

        const pdfRequest = await KundliPdfRequest.findById(pdfRequestId);
        if (!pdfRequest) {
            return res.status(404).json({ success: false, message: 'PDF Request details not found.' });
        }

        if (pdfRequest.status === 'success' && pdfRequest.pdfUrl) {
            return res.status(200).json({ success: true, pdfUrl: pdfRequest.pdfUrl });
        }

        const paymentId = razorpay_payment_id || `mock_pay_${Date.now()}`;

        try {
            const gstRate = await getSettingValue('gstRate', 18);
            const baseAmount = pdfRequest.amount / (1 + gstRate / 100);
            const gstAmount = pdfRequest.amount - baseAmount;

            const reportLabel = pdfRequest.reportType === 'numerology'
                ? 'Numerology Report PDF'
                : `${pdfRequest.pdfType === 'pro' ? 'Advanced' : 'Basic'} Kundli PDF`;

            await Transaction.create({
                paymentId,
                fromUser: userId,
                amount: baseAmount,
                gstAmount,
                totalPaid: pdfRequest.amount,
                type: 'debit',
                status: 'success',
                description: `${reportLabel} Service Purchase (Txn: ${paymentId})`
            });
        } catch (err: any) {
            if (err.code === 11000) {
                const existingReq = await KundliPdfRequest.findById(pdfRequestId);
                if (existingReq?.pdfUrl) {
                    return res.status(200).json({ success: true, pdfUrl: existingReq.pdfUrl });
                }
            }
            throw err;
        }

        let pdfUrl = '';
        try {
            if (pdfRequest.reportType === 'numerology') {
                pdfUrl = await generateNumerologyPdf({
                    name: pdfRequest.name,
                    day: pdfRequest.day,
                    month: pdfRequest.month,
                    year: pdfRequest.year,
                    language: (pdfRequest.language as 'en' | 'hi') || 'en'
                });
            } else {
                pdfUrl = await generateKundliPdf({
                    name: pdfRequest.name,
                    gender: pdfRequest.gender as 'male' | 'female',
                    day: pdfRequest.day,
                    month: pdfRequest.month,
                    year: pdfRequest.year,
                    hour: pdfRequest.hour!,
                    min: pdfRequest.min!,
                    lat: pdfRequest.lat!,
                    lon: pdfRequest.lon!,
                    tzone: pdfRequest.tzone!,
                    place: pdfRequest.place!,
                    pdfType: pdfRequest.pdfType as 'basic' | 'pro',
                    language: pdfRequest.language
                });
            }
        } catch (pdfError: any) {
            console.error('[PDF Service Controller] PDF Generation Failed:', pdfError.message);
            pdfRequest.status = 'failed';
            await pdfRequest.save();
            return res.status(500).json({ success: false, message: 'Payment verified but PDF generation failed.', error: pdfError.message });
        }

        pdfRequest.pdfUrl = pdfUrl;
        pdfRequest.paymentId = paymentId;
        pdfRequest.status = 'success';
        await pdfRequest.save();

        // Send email asynchronously
        if (pdfRequest.reportType === 'numerology') {
            sendNumerologyPdfEmail(pdfRequest.email, pdfUrl, pdfRequest.name)
                .catch(err => console.error('[PDF Service Controller] Async Numerology Email Failed:', err.message));
        } else {
            sendPdfEmail(pdfRequest.email, pdfUrl, pdfRequest.name, pdfRequest.pdfType as 'basic' | 'pro')
                .catch(err => console.error('[PDF Service Controller] Async Kundli Email Failed:', err.message));
        }

        return res.status(200).json({
            success: true,
            message: 'Payment verified and PDF generated successfully',
            pdfUrl
        });

    } catch (error: any) {
        console.error('[PDF Service Controller] verifyPdfPayment Error:', error);
        return res.status(500).json({ success: false, message: 'Payment verification failed', error: error.message });
    }
};

// 3. Get all PDF Orders (Admin Analytics)
export const getPdfOrders = async (req: Request, res: Response) => {
    try {
        const orders = await KundliPdfRequest.find()
            .sort({ createdAt: -1 })
            .populate('user', 'name mobile email');

        return res.status(200).json({ success: true, data: orders });
    } catch (error: any) {
        console.error('[PDF Service Controller] getPdfOrders Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to retrieve PDF orders analytics', error: error.message });
    }
};

// 4. Public route to download PDF with attachment headers
export const downloadPdfFile = async (req: Request, res: Response) => {
    try {
        const { url, name } = req.query;
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ success: false, message: 'PDF URL is required.' });
        }

        const response = await axios.get(url, { responseType: 'arraybuffer' });

        const safeName = name && typeof name === 'string'
            ? name.replace(/[^a-zA-Z0-9]/g, '_')
            : 'Report';
        const filename = `${safeName}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', response.data.length);

        return res.send(Buffer.from(response.data));
    } catch (error: any) {
        console.error('[PDF Service Controller] downloadPdfFile Error:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to download PDF file.', error: error.message });
    }
};
