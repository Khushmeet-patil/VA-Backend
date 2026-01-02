
import axios from 'axios';
import querystring from 'querystring';

export const sendSmsOtp = async (mobile: string, otp: string): Promise<boolean> => {
    // Dev Bypass for specific number
    if (mobile === '7990358824') {
        console.log(`Dev Mode: OTP for ${mobile} is ${otp} (Fixed to 1234 in logic if needed, but here we just log request)`);
        return true;
    }

    try {
        const key = '56661ADC561B64';
        const senderid = 'SPTSMS';
        const message = `Your otp is ${otp} SELECTIAL`;
        const template_id = '1707166619134631839';

        const data = {
            key: key,
            campaign: 0,
            routeid: 9,
            type: 'text',
            contacts: mobile,
            senderid: senderid,
            msg: message,
            template_id: template_id
        };

        const queryString = querystring.stringify(data);
        const url = `http://msg.pwasms.com/app/smsapi/index.php?${queryString}`;

        console.log('Sending SMS to:', mobile, 'OTP:', otp); // Debug log

        // In production, uncomment the axios call. For dev/debugging without burning credits, we might want to just log.
        // But user asked to use PWASMS, so we will make the call.

        const response = await axios.get(url);
        console.log('SMS Response:', response.data);

        // PWASMS usually returns strict text or specific field. 
        // Based on legacy code: if (response.data) return 'success'
        if (response.data) {
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error sending SMS:', error);
        return false;
    }
};
