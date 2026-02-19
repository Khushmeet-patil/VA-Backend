import axios from 'axios';

// Test numbers that bypass fast2sms and use fixed OTP 1234
// VedicAstro (user app): 7990358824, 1234567890, 9374742346
// VedicPannel (astrologer app): 7990358821, 2345678901, 9999999999
const TEST_NUMBERS = ['7990358824', '1234567890', '9374742346', '7990358821', '2345678901', '9999999999'];

export const sendSmsOtp = async (mobile: string, otp: string, appName: string = 'VedicAstro'): Promise<boolean> => {
    // Dev Bypass: skip fast2sms for test numbers (OTP is already set to 1234 by the controller)
    if (TEST_NUMBERS.includes(mobile)) {
        console.log(`[SMS Bypass] Test number ${mobile} — OTP: ${otp} (App: ${appName})`);
        return true;
    }

    try {
        const url = 'https://www.fast2sms.com/dev/bulkV2';
        const authorization = process.env.FAST2SMS_API_KEY || '';
        const route = process.env.FAST2SMS_ROUTE || 'dlt';
        const sender_id = process.env.FAST2SMS_SENDER_ID || 'SPVEDI';
        const message = process.env.FAST2SMS_MESSAGE_ID || '209382';

        // Variables: OTP | AppName
        const variables_values = `${otp}|${appName}`;
        const flash = 0;

        const params = {
            authorization,
            route,
            sender_id,
            message,
            variables_values,
            flash,
            numbers: mobile,
        };

        console.log(`[Fast2SMS] Sending OTP to ${mobile} for ${appName}`);

        const response = await axios.get(url, { params });
        console.log('[Fast2SMS] Full Response Data:', JSON.stringify(response.data, null, 2));

        if (response.data && response.data.return === true) {
            console.log('[Fast2SMS] Success:', response.data.message);
            return true;
        }
        return false;
    } catch (error) {
        console.error('[Fast2SMS] Error sending SMS:', error);
        return false;
    }
};
