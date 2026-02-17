import axios from 'axios';

export const sendSmsOtp = async (mobile: string, otp: string, appName: string = 'VedicAstro'): Promise<boolean> => {
    // Dev Bypass for specific number
    if (mobile === '7990358824') {
        console.log(`Dev Mode: OTP for ${mobile} is ${otp} (AppName: ${appName})`);
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
