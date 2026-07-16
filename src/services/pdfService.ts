import axios from 'axios';
import nodemailer from 'nodemailer';
import { getSettingValue } from '../controllers/systemSettingController';
import dotenv from 'dotenv';

dotenv.config();

// Create transporter for email dispatch
const getEmailTransporter = () => {
    const port = parseInt(process.env.STORE_EMAIL_PORT || '465');
    const secure = port === 465;

    return nodemailer.createTransport({
        host: process.env.STORE_EMAIL_HOST || 'smtp.hostinger.com',
        port: port,
        secure: secure,
        auth: {
            user: process.env.STORE_EMAIL_USER || 'support@vedicastro.co.in',
            pass: process.env.STORE_EMAIL_PASS || 'VedicAstro@26',
        },
        tls: {
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2'
        },
        connectionTimeout: 20000,
        greetingTimeout: 20000,
        socketTimeout: 20000,
    });
};

interface GeneratePdfInput {
    name: string;
    gender: 'male' | 'female';
    day: number;
    month: number;
    year: number;
    hour: number;
    min: number;
    lat: number;
    lon: number;
    tzone: number;
    place: string;
    pdfType: 'basic' | 'pro';
    language: string;
}

interface GenerateNumerologyPdfInput {
    name: string;
    day: number;
    month: number;
    year: number;
    language: 'en' | 'hi';
}

export const generateKundliPdf = async (input: GeneratePdfInput): Promise<string> => {
    try {
        const apiKey = process.env.ASTRO_PDF_ACCESS_TOKEN || process.env.ASTRO_API_KEY || '';
        const endpoint = input.pdfType === 'pro' 
            ? 'https://pdf.astrologyapi.com/v1/pro_horoscope_pdf'
            : 'https://pdf.astrologyapi.com/v1/basic_horoscope_pdf';

        // Load branding / company info from admin settings or fall back to defaults
        const companyName = await getSettingValue('kundliPdfCompanyName', '');
        const companyInfo = await getSettingValue('kundliPdfCompanyInfo', 'VedicAstro provides personalized horoscope predictions and guidance.');
        const domainUrl = await getSettingValue('kundliPdfDomainUrl', 'https://vedicastro.co.in');
        const footerLink = await getSettingValue('kundliPdfFooterLink', 'vedicastro.co.in');
        const logoUrl = await getSettingValue('kundliPdfLogoUrl', 'https://pub-b2ae4a07bcf84513b37ee77414a45541.r2.dev/logo/Untitled%20design%20(18)%20(1).png');
        const companyEmail = await getSettingValue('kundliPdfCompanyEmail', 'support@vedicastro.co.in');
        const companyLandline = await getSettingValue('kundliPdfCompanyLandline', '+91-1234567890');
        const companyMobile = await getSettingValue('kundliPdfCompanyMobile', '+91 75749 70100');

        const requestBody = {
            name: input.name,
            gender: input.gender,
            day: input.day,
            month: input.month,
            year: input.year,
            hour: input.hour,
            min: input.min,
            lat: input.lat,
            lon: input.lon,
            tzone: input.tzone,
            place: input.place,
            language: input.language || 'en',
            chart_style: 'NORTH_INDIAN',
            footer_link: footerLink,
            logo_url: logoUrl,
            company_name: companyName,
            // Ensure company info is less than 500 characters
            company_info: companyInfo.substring(0, 490),
            domain_url: domainUrl,
            company_email: companyEmail,
            company_landline: companyLandline,
            company_mobile: companyMobile
        };

        console.log(`[PDF Service] Requesting PDF (${input.pdfType}) from Astrology API:`, JSON.stringify(requestBody));

        const response = await axios.post(endpoint, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'x-astrologyapi-key': apiKey
            }
        });

        console.log('[PDF Service] Astrology PDF API Response:', response.data);

        // API usually returns { status: true, pdf_url: "..." } or { success: true, pdf_url: "..." }
        let pdfUrl = response.data?.pdf_url || response.data?.pdfUrl;
        if (!pdfUrl) {
            throw new Error(response.data?.message || 'Astrology PDF API did not return a PDF URL');
        }

        if (pdfUrl.startsWith('http://')) {
            pdfUrl = pdfUrl.replace('http://', 'https://');
        }

        return pdfUrl;
    } catch (error: any) {
        console.error('[PDF Service] generateKundliPdf Error:', error.response?.data || error.message);
        throw new Error(error.response?.data?.message || error.message || 'Failed to generate Kundli PDF from Astrology API');
    }
};

export const sendPdfEmail = async (toEmail: string, pdfUrl: string, userName: string, pdfType: 'basic' | 'pro') => {
    try {
        console.log(`[PDF Service] Downloading PDF for email attachment from: ${pdfUrl}`);
        
        // Fetch the PDF from URL as binary
        const pdfResponse = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        const pdfBuffer = Buffer.from(pdfResponse.data);

        const transporter = getEmailTransporter();
        const typeLabel = pdfType === 'pro' ? 'Professional/Advanced' : 'Basic';
        const companyName = await getSettingValue('kundliPdfCompanyName', 'VedicAstro Solutions');
        const supportEmail = await getSettingValue('kundliPdfCompanyEmail', 'support@vedicastro.co.in');

        console.log(`[PDF Service] Preparing to send email to: ${toEmail}`);

        const mailOptions = {
            from: `"${companyName}" <${process.env.STORE_EMAIL_USER || 'support@vedicastro.co.in'}>`,
            to: toEmail,
            subject: `Your ${typeLabel} Kundli PDF from ${companyName}`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #FF6B00; padding: 20px; text-align: center; color: white;">
                        <h1 style="margin: 0; font-size: 24px;">Your Kundli is Ready!</h1>
                    </div>
                    <div style="padding: 20px; background-color: #fff;">
                        <p>Dear <strong>${userName}</strong>,</p>
                        <p>Thank you for using our <strong>Kundli PDF Service</strong> on VedicAstro. Your detailed ${typeLabel} Horoscope PDF has been successfully generated based on your birth details.</p>
                        
                        <div style="background-color: #FFF9E6; border-left: 4px solid #FF6B00; padding: 15px; margin: 20px 0; border-radius: 4px;">
                            <p style="margin: 0; font-weight: bold; color: #B24B00;">Horoscope Details:</p>
                            <p style="margin: 5px 0 0 0;">We have attached the PDF file directly to this email so you can access it anytime offline.</p>
                        </div>

                        <p>You can also download your PDF report directly from this URL:</p>
                        <p style="text-align: center; margin: 25px 0;">
                            <a href="${pdfUrl}" target="_blank" style="background-color: #FF6B00; color: white; padding: 12px 25px; text-decoration: none; font-weight: bold; border-radius: 5px; display: inline-block; box-shadow: 0 2px 4px rgba(255,107,0,0.3);">
                                View & Download PDF
                            </a>
                        </p>

                        <p>If you have any questions or feedback, please contact us at <a href="mailto:${supportEmail}" style="color: #FF6B00;">${supportEmail}</a>.</p>
                        <p style="margin-top: 30px; font-size: 14px; color: #888;">Warm regards,<br>Team ${companyName}</p>
                    </div>
                    <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee;">
                        <p style="margin: 0;">&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
                    </div>
                </div>
            `,
            attachments: [
                {
                    filename: `${userName.replace(/[^a-zA-Z0-9]/g, '_')}_Kundli_${pdfType}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[PDF Service] Email sent successfully to ${toEmail}. Message ID: ${info.messageId}`);
        return info;
    } catch (error: any) {
        console.error('[PDF Service] sendPdfEmail Error:', error.message);
        // Do not throw so that verification succeeds even if email fails (resilient behavior)
    }
};

export const generateNumerologyPdf = async (input: GenerateNumerologyPdfInput): Promise<string> => {
    try {
        const apiKey = process.env.ASTRO_PDF_ACCESS_TOKEN || process.env.ASTRO_API_KEY || '';
        const endpoint = 'https://pdf.astrologyapi.com/v1/pro_numerology_report';

        const companyName = await getSettingValue('kundliPdfCompanyName', '');
        const companyInfo = await getSettingValue('kundliPdfCompanyInfo', 'VedicAstro provides personalized horoscope predictions and guidance.');
        const domainUrl = await getSettingValue('kundliPdfDomainUrl', 'https://vedicastro.co.in');
        const footerLink = await getSettingValue('kundliPdfFooterLink', 'vedicastro.co.in');
        const logoUrl = await getSettingValue('kundliPdfLogoUrl', 'https://pub-b2ae4a07bcf84513b37ee77414a45541.r2.dev/logo/Untitled%20design%20(18)%20(1).png');
        const companyEmail = await getSettingValue('kundliPdfCompanyEmail', 'support@vedicastro.co.in');
        const companyLandline = await getSettingValue('kundliPdfCompanyLandline', '+91-1234567890');
        const companyMobile = await getSettingValue('kundliPdfCompanyMobile', '+91 75749 70100');

        const requestBody = {
            name: input.name,
            day: input.day,
            month: input.month,
            year: input.year,
            language: input.language || 'en',
            footer_link: footerLink,
            logo_url: logoUrl,
            company_name: companyName,
            company_info: companyInfo.substring(0, 490),
            domain_url: domainUrl,
            company_email: companyEmail,
            company_landline: companyLandline,
            company_mobile: companyMobile
        };

        console.log('[PDF Service] Requesting Numerology PDF from Astrology API:', JSON.stringify(requestBody));

        const response = await axios.post(endpoint, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'x-astrologyapi-key': apiKey
            }
        });

        console.log('[PDF Service] Numerology PDF API Response:', response.data);

        let pdfUrl = response.data?.response?.pdf_url || response.data?.response?.pdfUrl || response.data?.pdf_url || response.data?.pdfUrl;
        if (!pdfUrl) {
            throw new Error(response.data?.message || 'Astrology Numerology PDF API did not return a PDF URL');
        }

        if (pdfUrl.startsWith('http://')) {
            pdfUrl = pdfUrl.replace('http://', 'https://');
        }

        return pdfUrl;
    } catch (error: any) {
        console.error('[PDF Service] generateNumerologyPdf Error:', error.response?.data || error.message);
        throw new Error(error.response?.data?.message || error.message || 'Failed to generate Numerology PDF from Astrology API');
    }
};

export const sendNumerologyPdfEmail = async (toEmail: string, pdfUrl: string, userName: string) => {
    try {
        console.log(`[PDF Service] Downloading Numerology PDF for email: ${pdfUrl}`);
        const pdfResponse = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        const pdfBuffer = Buffer.from(pdfResponse.data);

        const transporter = getEmailTransporter();
        const companyName = await getSettingValue('kundliPdfCompanyName', 'VedicAstro Solutions');
        const supportEmail = await getSettingValue('kundliPdfCompanyEmail', 'support@vedicastro.co.in');

        const mailOptions = {
            from: `"${companyName}" <${process.env.STORE_EMAIL_USER || 'support@vedicastro.co.in'}>`,
            to: toEmail,
            subject: `Your Numerology Report PDF from ${companyName}`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #7B2FBE; padding: 20px; text-align: center; color: white;">
                        <h1 style="margin: 0; font-size: 24px;">Your Numerology Report is Ready!</h1>
                    </div>
                    <div style="padding: 20px; background-color: #fff;">
                        <p>Dear <strong>${userName}</strong>,</p>
                        <p>Thank you for using our <strong>Numerology PDF Service</strong> on VedicAstro. Your detailed Pro Numerology Report PDF (98 pages) has been generated based on your birth details.</p>
                        <p style="text-align: center; margin: 25px 0;">
                            <a href="${pdfUrl}" target="_blank" style="background-color: #7B2FBE; color: white; padding: 12px 25px; text-decoration: none; font-weight: bold; border-radius: 5px; display: inline-block;">
                                View &amp; Download PDF
                            </a>
                        </p>
                        <p>If you have any questions, please contact us at <a href="mailto:${supportEmail}" style="color: #7B2FBE;">${supportEmail}</a>.</p>
                        <p style="margin-top: 30px; font-size: 14px; color: #888;">Warm regards,<br>Team ${companyName}</p>
                    </div>
                    <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee;">
                        <p style="margin: 0;">&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
                    </div>
                </div>
            `,
            attachments: [
                {
                    filename: `${userName.replace(/[^a-zA-Z0-9]/g, '_')}_Numerology_Report.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[PDF Service] Numerology email sent to ${toEmail}. Message ID: ${info.messageId}`);
        return info;
    } catch (error: any) {
        console.error('[PDF Service] sendNumerologyPdfEmail Error:', error.message);
    }
};

interface GenerateMatchMakingPdfInput {
    mFirstName: string;
    mLastName: string;
    mDay: number;
    mMonth: number;
    mYear: number;
    mHour: number;
    mMinute: number;
    mLatitude: number;
    mLongitude: number;
    mTimezone: number;
    mPlace: string;
    fFirstName: string;
    fLastName: string;
    fDay: number;
    fMonth: number;
    fYear: number;
    fHour: number;
    fMinute: number;
    fLatitude: number;
    fLongitude: number;
    fTimezone: number;
    fPlace: string;
    language: 'en' | 'hi';
}

export const generateMatchMakingPdf = async (input: GenerateMatchMakingPdfInput): Promise<string> => {
    try {
        const apiKey = process.env.ASTRO_PDF_ACCESS_TOKEN || process.env.ASTRO_API_KEY || '';
        const endpoint = 'https://pdf.astrologyapi.com/v1/match_making_pdf';

        const companyName = await getSettingValue('kundliPdfCompanyName', '');
        const companyInfo = await getSettingValue('kundliPdfCompanyInfo', 'VedicAstro provides personalized horoscope predictions and guidance.');
        const domainUrl = await getSettingValue('kundliPdfDomainUrl', 'https://vedicastro.co.in');
        const footerLink = await getSettingValue('kundliPdfFooterLink', 'vedicastro.co.in');
        const logoUrl = await getSettingValue('kundliPdfLogoUrl', 'https://pub-b2ae4a07bcf84513b37ee77414a45541.r2.dev/logo/Untitled%20design%20(18)%20(1).png');
        const companyEmail = await getSettingValue('kundliPdfCompanyEmail', 'support@vedicastro.co.in');
        const companyLandline = await getSettingValue('kundliPdfCompanyLandline', '+91-1234567890');
        const companyMobile = await getSettingValue('kundliPdfCompanyMobile', '+91 75749 70100');

        const requestBody = {
            m_first_name: input.mFirstName,
            m_last_name: input.mLastName,
            m_day: input.mDay,
            m_month: input.mMonth,
            m_year: input.mYear,
            m_hour: input.mHour,
            m_minute: input.mMinute,
            m_latitude: input.mLatitude,
            m_longitude: input.mLongitude,
            m_timezone: input.mTimezone,
            m_place: input.mPlace,
            f_first_name: input.fFirstName,
            f_last_name: input.fLastName,
            f_day: input.fDay,
            f_month: input.fMonth,
            f_year: input.fYear,
            f_hour: input.fHour,
            f_minute: input.fMinute,
            f_latitude: input.fLatitude,
            f_longitude: input.fLongitude,
            f_timezone: input.fTimezone,
            f_place: input.fPlace,
            language: input.language || 'en',
            ashtakoot: true,
            dashakoot: false,
            papasamyam: true,
            chart_style: 'NORTH_INDIAN',
            footer_link: footerLink,
            logo_url: logoUrl,
            company_name: companyName,
            company_info: companyInfo.substring(0, 490),
            domain_url: domainUrl,
            company_email: companyEmail,
            company_landline: companyLandline,
            company_mobile: companyMobile
        };

        console.log('[PDF Service] Requesting Match Making PDF from Astrology API:', JSON.stringify(requestBody));

        const response = await axios.post(endpoint, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'x-astrologyapi-key': apiKey
            }
        });

        console.log('[PDF Service] Match Making PDF API Response:', response.data);

        let pdfUrl = response.data?.pdf_url || response.data?.pdfUrl;
        if (!pdfUrl) {
            throw new Error(response.data?.message || 'Astrology Match Making PDF API did not return a PDF URL');
        }

        if (pdfUrl.startsWith('http://')) {
            pdfUrl = pdfUrl.replace('http://', 'https://');
        }

        return pdfUrl;
    } catch (error: any) {
        console.error('[PDF Service] generateMatchMakingPdf Error:', error.response?.data || error.message);
        throw new Error(error.response?.data?.message || error.message || 'Failed to generate Match Making PDF from Astrology API');
    }
};

export const sendMatchMakingPdfEmail = async (toEmail: string, pdfUrl: string, mName: string, fName: string) => {
    try {
        console.log(`[PDF Service] Downloading Match Making PDF for email: ${pdfUrl}`);
        const pdfResponse = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        const pdfBuffer = Buffer.from(pdfResponse.data);

        const transporter = getEmailTransporter();
        const companyName = await getSettingValue('kundliPdfCompanyName', 'VedicAstro Solutions');
        const supportEmail = await getSettingValue('kundliPdfCompanyEmail', 'support@vedicastro.co.in');

        const mailOptions = {
            from: `"${companyName}" <${process.env.STORE_EMAIL_USER || 'support@vedicastro.co.in'}>`,
            to: toEmail,
            subject: `Your Match Making Report PDF from ${companyName}`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #E91E63; padding: 20px; text-align: center; color: white;">
                        <h1 style="margin: 0; font-size: 24px;">Your Match Making Report is Ready!</h1>
                    </div>
                    <div style="padding: 20px; background-color: #fff;">
                        <p>Dear Customer,</p>
                        <p>Thank you for using our <strong>Match Making PDF Service</strong> on VedicAstro. Your detailed compatibility and match making PDF report for <strong>${mName}</strong> and <strong>${fName}</strong> has been successfully generated.</p>
                        <p style="text-align: center; margin: 25px 0;">
                            <a href="${pdfUrl}" target="_blank" style="background-color: #E91E63; color: white; padding: 12px 25px; text-decoration: none; font-weight: bold; border-radius: 5px; display: inline-block;">
                                View &amp; Download PDF
                            </a>
                        </p>
                        <p>If you have any questions, please contact us at <a href="mailto:${supportEmail}" style="color: #E91E63;">${supportEmail}</a>.</p>
                        <p style="margin-top: 30px; font-size: 14px; color: #888;">Warm regards,<br>Team ${companyName}</p>
                    </div>
                    <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee;">
                        <p style="margin: 0;">&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
                    </div>
                </div>
            `,
            attachments: [
                {
                    filename: `${mName.replace(/[^a-zA-Z0-9]/g, '_')}_and_${fName.replace(/[^a-zA-Z0-9]/g, '_')}_MatchMaking.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[PDF Service] Match making email sent to ${toEmail}. Message ID: ${info.messageId}`);
        return info;
    } catch (error: any) {
        console.error('[PDF Service] sendMatchMakingPdfEmail Error:', error.message);
    }
};

export default {
    generateKundliPdf,
    sendPdfEmail,
    generateNumerologyPdf,
    sendNumerologyPdfEmail,
    generateMatchMakingPdf,
    sendMatchMakingPdfEmail
};
