# M-Pesa STK Push Integration Guide

## Overview
Your Pay-to-Connect system is fully integrated with M-Pesa STK Push (Lipa na M-Pesa Online) API for seamless Wi-Fi payment processing.

## Features Implemented

### ✅ Complete STK Push Integration
- **Initiate Payment**: Send STK push to customer's phone
- **Callback Processing**: Handle M-Pesa payment confirmations
- **Payment Validation**: Verify payment status and amounts
- **Session Creation**: Automatically create Wi-Fi sessions on successful payment
- **Error Handling**: Comprehensive error handling with proper user messages

### ✅ Security & Validation
- Phone number validation (Safaricom numbers only)
- Amount validation (KES 1 - 250,000)
- Duplicate payment prevention
- Rate limiting on payment endpoints
- Secure password generation using timestamp and passkey

### ✅ Database Integration
- Payment tracking with status updates
- Session management linked to payments
- Audit trail with raw callback storage
- Redis caching for session data

## API Endpoints

### 1. Initiate Payment
```http
POST /api/portal/pay
Content-Type: application/json

{
    "phone": "0722000000",
    "packageId": "uuid-of-package",
    "macAddress": "AA:BB:CC:DD:EE:FF"
}
```

**Response:**
```json
{
    "success": true,
    "message": "Payment initiated successfully",
    "checkoutRequestId": "ws_CO_1007202409152617172396192",
    "amount": 10.00,
    "packageName": "1 Hour"
}
```

### 2. Check Payment Status
```http
GET /api/portal/status/{checkoutRequestId}
```

**Response:**
```json
{
    "success": true,
    "status": "success",
    "session": {
        "sessionId": "uuid",
        "packageName": "1 Hour",
        "expiresAt": "2024-12-25T15:00:00Z",
        "remainingSeconds": 3600
    }
}
```

### 3. M-Pesa Callback (Internal)
```http
POST /api/portal/mpesa/callback
```

## Configuration Setup

### 1. Get Daraja API Credentials
1. Visit [Safaricom Developer Portal](https://developer.safaricom.co.ke)
2. Create account and login
3. Create a new app with "M-Pesa Express" product
4. Get Consumer Key and Consumer Secret

### 2. Update Environment Variables
```env
# M-Pesa Configuration
MPESA_CONSUMER_KEY=your-consumer-key-from-daraja-app
MPESA_CONSUMER_SECRET=your-consumer-secret-from-daraja-app
MPESA_SHORTCODE=174379
MPESA_PASSKEY=bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
MPESA_CALLBACK_URL=https://yourdomain.com/api/portal/mpesa/callback
MPESA_ENVIRONMENT=sandbox
```

### 3. Callback URL Requirements
- Must be publicly accessible (use ngrok for local testing)
- Must use HTTPS in production
- Should respond with 200 status code
- Example: `https://your-domain.com/api/portal/mpesa/callback`

## Testing

### Sandbox Testing
Use these test credentials for sandbox environment:

**Test Phone Numbers:**
- `254708374149` - Success scenario
- `254722000000` - General test number

**Test Shortcode:** `174379`
**Test Passkey:** `bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919`

### Testing Steps
1. Start your application
2. Use ngrok to expose your local server: `ngrok http 3000`
3. Update `MPESA_CALLBACK_URL` with ngrok URL
4. Make payment request to `/api/portal/pay`
5. Check M-Pesa prompt on test phone
6. Enter PIN to complete payment
7. Verify callback processing in logs

### Using Daraja Simulator
1. Go to [Daraja Portal](https://developer.safaricom.co.ke)
2. Navigate to your app's simulator
3. Use "M-Pesa Express" simulator
4. Test with predefined test data

## Error Handling

### Common Error Codes
- `400.002.02`: Invalid request parameters
- `404.001.03`: Invalid access token
- `500.001.1001`: Wrong credentials or merchant issues
- `1032`: Request cancelled by user
- `1037`: Customer phone unreachable

### Payment Status Codes
- `0`: Success
- `1`: Insufficient balance
- `1032`: Cancelled by user
- `1037`: Phone unreachable
- `2001`: Wrong PIN

## Production Deployment

### 1. Go Live Process
1. Complete testing in sandbox
2. Apply for Go Live on Daraja Portal
3. Provide live PayBill/Till number
4. Get production credentials
5. Update environment to production

### 2. Production Configuration
```env
MPESA_ENVIRONMENT=production
MPESA_CONSUMER_KEY=production-consumer-key
MPESA_CONSUMER_SECRET=production-consumer-secret
MPESA_SHORTCODE=your-live-shortcode
MPESA_PASSKEY=production-passkey
MPESA_CALLBACK_URL=https://yourdomain.com/api/portal/mpesa/callback
```

## Monitoring & Logs

### Log Monitoring
- Payment initiations logged with phone and amount
- Callback processing logged with full payload
- Error scenarios logged with context
- Session creation logged with details

### Key Metrics to Monitor
- Payment success rate
- Callback processing time
- Failed payment reasons
- Customer phone number patterns

## Security Best Practices

### ✅ Implemented Security
- Rate limiting on payment endpoints
- Phone number validation
- Amount validation and limits
- Callback payload validation
- Secure credential storage
- Request idempotency

### Additional Recommendations
- Monitor for suspicious payment patterns
- Implement fraud detection rules
- Regular credential rotation
- Secure callback endpoint with IP whitelisting
- Log all payment activities for audit

## Troubleshooting

### Common Issues
1. **Callback not received**: Check callback URL accessibility
2. **Invalid access token**: Regenerate token (expires hourly)
3. **Payment timeout**: Customer didn't complete payment in time
4. **Wrong credentials**: Verify consumer key/secret and passkey

### Debug Steps
1. Check application logs for errors
2. Verify M-Pesa credentials in .env
3. Test callback URL accessibility
4. Monitor network connectivity
5. Check Daraja portal for API status

## Support
- **Daraja Support**: apisupport@safaricom.co.ke
- **Documentation**: https://developer.safaricom.co.ke
- **Incident Management**: Use Daraja portal incident page
