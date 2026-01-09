# Payment Testing Guide for SmartWiFi

## 🔴 Issue: Payment Stuck at "Payment Pending"

### Why This Happens

When testing M-Pesa payments in **sandbox/development mode**, the M-Pesa callback cannot reach your local server because:
1. Your callback URL is set to `https://yourdomain.com` (not accessible)
2. M-Pesa sandbox requires a publicly accessible HTTPS URL
3. Local development servers (localhost) are not reachable by M-Pesa servers

---

## ✅ Solution 1: Manual Payment Approval (Quick Testing)

I've added an admin endpoint to manually approve pending payments for testing purposes.

### Steps to Approve a Payment:

1. **Make a payment** from the user portal (it will show "Payment Pending")

2. **Login to Admin Panel**: http://localhost:3000/api/admin

3. **Go to Payments section** in the admin panel

4. **Find the pending payment** - it will show status: "pending"

5. **Use this API call to approve it**:

```bash
# Using curl (replace PAYMENT_ID and YOUR_ADMIN_TOKEN)
curl -X POST http://localhost:3000/api/admin/payments/PAYMENT_ID/approve \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mpesaReceipt": "TEST123456"}'
```

Or use **Postman/Thunder Client**:
- **Method**: POST
- **URL**: `http://localhost:3000/api/admin/payments/{payment_id}/approve`
- **Headers**: 
  - `Authorization: Bearer {your_admin_token}`
  - `Content-Type: application/json`
- **Body** (optional):
```json
{
  "mpesaReceipt": "TEST123456"
}
```

6. **Refresh the user portal** - the payment should now show as successful and create an active session

---

## ✅ Solution 2: Use ngrok for Real M-Pesa Testing

To test with actual M-Pesa callbacks:

### Step 1: Install ngrok
```bash
# Download from https://ngrok.com/download
# Or install via chocolatey
choco install ngrok
```

### Step 2: Start ngrok tunnel
```bash
ngrok http 3000
```

This will give you a public URL like: `https://abc123.ngrok.io`

### Step 3: Update .env file
```env
MPESA_CALLBACK_URL=https://abc123.ngrok.io/api/portal/mpesa/callback
```

### Step 4: Restart your server
```bash
npm run dev
```

### Step 5: Update M-Pesa Daraja Portal
- Login to https://developer.safaricom.co.ke
- Update your app's callback URL to the ngrok URL
- Test payments - callbacks will now reach your local server

---

## ✅ Solution 3: Production Deployment

For production, you need:

1. **Deploy to a server with public IP/domain**
   - Use services like: Render, Railway, Heroku, DigitalOcean, AWS, etc.

2. **Get SSL certificate** (HTTPS required)
   - Use Let's Encrypt (free)
   - Or use platform-provided SSL

3. **Update .env with production URL**
```env
MPESA_CALLBACK_URL=https://yourdomain.com/api/portal/mpesa/callback
MPESA_ENVIRONMENT=production
```

4. **Register production credentials**
   - Get production M-Pesa credentials from Safaricom
   - Update MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET

---

## 📊 How to Check Payment Status

### Via Database Query:
```sql
SELECT id, phone, amount, status, mpesa_receipt, created_at 
FROM payments 
ORDER BY created_at DESC 
LIMIT 10;
```

### Via Admin API:
```bash
GET http://localhost:3000/api/admin/payments
Authorization: Bearer {admin_token}
```

### Via User Portal:
- Click "Check Status" button on the payment pending screen
- The frontend polls every 3 seconds for 5 minutes

---

## 🔧 Troubleshooting

### Payment stays pending forever
- **Cause**: Callback URL not reachable
- **Fix**: Use manual approval or ngrok

### "Payment not found" error
- **Cause**: Payment record not created in database
- **Fix**: Check server logs, verify database connection

### Session not created after approval
- **Cause**: No active routers in database
- **Fix**: Add a router via admin panel first

### M-Pesa STK push not received on phone
- **Cause**: Invalid phone number or sandbox issues
- **Fix**: Use format 254XXXXXXXXX, check M-Pesa sandbox status

---

## 📝 Testing Checklist

- [ ] Database is connected and running
- [ ] At least one router is created and active
- [ ] At least one package is created and active
- [ ] User is logged in
- [ ] Phone number is in correct format (254XXXXXXXXX)
- [ ] M-Pesa credentials are valid
- [ ] For local testing: Use manual approval endpoint
- [ ] For production: Callback URL is publicly accessible

---

## 🚀 Quick Test Flow

1. **Create Router** (Admin Panel)
   - Name: "Main Router"
   - IP: "192.168.1.1"
   - Mark as active

2. **Create Package** (Admin Panel)
   - Name: "1 Hour"
   - Duration: 60 minutes
   - Price: 10 KES
   - Mark as active

3. **User Login/Register**
   - Go to packages page
   - Select package
   - Login or register

4. **Initiate Payment**
   - Enter phone: 254712345678
   - Click "Pay with M-Pesa"
   - Wait for STK push

5. **Approve Payment** (For Testing)
   - Use manual approval endpoint
   - Or wait for callback (if using ngrok)

6. **Verify Session**
   - User should see active session
   - Check admin panel for session details

---

## 📞 Support

If you continue having issues:
1. Check server logs for errors
2. Verify database connection
3. Ensure M-Pesa credentials are correct
4. Test with manual approval first
5. Use ngrok for callback testing

**Remember**: In sandbox mode, M-Pesa callbacks won't work with localhost. Always use manual approval or ngrok for local testing.
