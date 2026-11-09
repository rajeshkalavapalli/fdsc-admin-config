// Sends an OTP by SMS. Provider chosen with SMS_PROVIDER in .env:
//   (empty)   development: the OTP is printed in this API's console instead of being sent
//   fast2sms  Fast2SMS DLT route: needs SMS_API_KEY, SMS_SENDER_ID and SMS_TEMPLATE_ID
//             (the DLT-approved template must contain one variable for the OTP)
// India: commercial OTP SMS must use a DLT-registered sender ID and template (TRAI rule).
const sendOtpSms = async ({ mobile, otp, minutes }) => {
    const provider = (process.env.SMS_PROVIDER || '').toLowerCase();

    if (!provider) {
        console.log(`\n[SMS not configured - printing instead]\nTo: +91 ${mobile}\nFDSC admin password reset OTP: ${otp} (valid ${minutes} minutes)\n`);
        return;
    }

    if (provider === 'fast2sms') {
        const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
            method: 'POST',
            headers: { authorization: process.env.SMS_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                route: 'dlt',
                sender_id: process.env.SMS_SENDER_ID,
                message: process.env.SMS_TEMPLATE_ID,
                variables_values: otp,
                numbers: mobile,
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.return === false) throw new Error(`SMS not sent: ${data.message || response.status}`);
        return;
    }

    throw new Error(`Unknown SMS_PROVIDER "${provider}".`);
};

module.exports = { sendOtpSms };
