# NEXRYDE - NEW FEATURES IMPLEMENTATION GUIDE

## 🎉 Three Major Features Added

This document describes the three new systems implemented in NEXRYDE:
1. **Performance Rewards Automation**
2. **Trial Abuse Prevention**
3. **Driver Report System**

---

## 1. PERFORMANCE REWARDS AUTOMATION

### Overview
Automatically rewards top 10 drivers monthly with 1 free month of subscription.

### How It Works
- System calculates driver performance based on:
  - Total trips completed
  - Average rating
  - Total earnings
  - Performance score (weighted algorithm)
- Top 10 drivers each month receive 1 free month automatically
- Drivers receive in-app notification
- Admin can manually grant rewards

### API Endpoints

#### GET `/api/admin/rewards/top-drivers`
Get current top performing drivers
```bash
curl http://localhost:8001/api/admin/rewards/top-drivers?period=monthly&limit=10
```

Response:
```json
{
  "period": "monthly",
  "top_drivers": [
    {
      "driver_id": "...",
      "driver_name": "...",
      "total_trips": 150,
      "total_earnings": 250000,
      "avg_rating": 4.8,
      "performance_score": 2540
    }
  ],
  "total_qualified": 10
}
```

#### POST `/api/admin/rewards/grant-free-month`
Manually grant free month to a driver
```bash
curl -X POST http://localhost:8001/api/admin/rewards/grant-free-month \
  -H "Content-Type: application/json" \
  -d '{"driver_id": "driver_123", "reason": "excellent_service"}'
```

#### POST `/api/admin/rewards/process-monthly`
Process monthly rewards (run on 1st of each month)
```bash
curl -X POST http://localhost:8001/api/admin/rewards/process-monthly
```

#### GET `/api/drivers/{driver_id}/rewards`
Get driver's reward history
```bash
curl http://localhost:8001/api/drivers/driver_123/rewards
```

### Automation Setup
To run automatically each month, set up a cron job:
```bash
# Run on 1st of each month at 00:00
0 0 1 * * curl -X POST http://localhost:8001/api/admin/rewards/process-monthly
```

---

## 2. TRIAL ABUSE PREVENTION

### Overview
Prevents drivers from creating multiple trial accounts using:
- Phone number tracking
- NIN (National Identity Number) duplicate detection
- Driver's license duplicate detection
- Device fingerprinting
- IP address tracking

### How It Works
1. When driver signs up for trial, system checks:
   - Has this phone number used trial before?
   - Has this NIN been registered?
   - Has this driver's license been used?
   - Too many trials from this device/IP?

2. If abuse detected:
   - Trial request rejected
   - Abuse logged for security monitoring
   - Phone number blacklisted

3. After trial expires:
   - Phone automatically blacklisted
   - Cannot request trial again

### API Endpoints

#### POST `/api/auth/validate-trial-eligibility`
Check if user is eligible for trial
```bash
curl -X POST http://localhost:8001/api/auth/validate-trial-eligibility \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+2348012345678",
    "nin": "12345678901",
    "license_number": "ABC123XYZ",
    "device_id": "device_xyz",
    "ip_address": "192.168.1.1"
  }'
```

Response:
```json
{
  "eligible": true,
  "reason": "Trial eligible",
  "checks": {
    "phone_check": {"passed": true, "message": "Phone number eligible"},
    "nin_check": {"passed": true, "message": "NIN eligible"},
    "license_check": {"passed": true, "message": "License eligible"},
    "device_check": {"passed": true, "message": "Device eligible"}
  }
}
```

#### GET `/api/admin/abuse-prevention/stats`
Get abuse prevention statistics
```bash
curl http://localhost:8001/api/admin/abuse-prevention/stats
```

Response:
```json
{
  "total_abuse_attempts_30d": 45,
  "abuse_by_type": [
    {"_id": "nin_duplicate", "count": 20},
    {"_id": "phone_duplicate", "count": 15},
    {"_id": "device_abuse", "count": 10}
  ],
  "total_blacklisted": 150,
  "prevention_rate": "76.2%"
}
```

#### POST `/api/admin/abuse-prevention/blacklist`
Manually blacklist a phone number
```bash
curl -X POST http://localhost:8001/api/admin/abuse-prevention/blacklist \
  -H "Content-Type: application/json" \
  -d '{"phone": "+2348012345678", "reason": "fraud_detected"}'
```

#### GET `/api/admin/abuse-prevention/blacklist`
View blacklisted numbers
```bash
curl http://localhost:8001/api/admin/abuse-prevention/blacklist?limit=100
```

### Integration Example
```python
# In trial start endpoint
from trial_abuse_prevention import validate_trial_eligibility

# Before creating trial
is_eligible, reason = await validate_trial_eligibility(
    phone=user_phone,
    nin=driver_nin,
    license_number=driver_license,
    device_id=device_id,
    ip_address=request.client.host,
    db=db
)

if not is_eligible:
    raise HTTPException(status_code=403, detail=reason)

# Proceed with trial creation...
```

---

## 3. DRIVER REPORT SYSTEM

### Overview
Riders can report drivers for abusive or offensive behavior. System automatically suspends drivers based on report severity.

### Report Categories
1. **Abusive Behavior** (High - 5 points)
2. **Offensive Language** (Medium - 3 points)
3. **Reckless Driving** (Critical - 10 points)
4. **Harassment** (Critical - 10 points)
5. **Inappropriate Conduct** (High - 5 points)
6. **Route Manipulation** (Low - 1 point)
7. **Safety Concern** (High - 5 points)
8. **Other** (Low - 1 point)

### Automatic Actions
- **3 points**: Warning sent to driver
- **10 points**: 7-day temporary suspension
- **20 points**: Permanent suspension

### API Endpoints

#### POST `/api/reports/submit`
Submit a report against a driver
```bash
curl -X POST http://localhost:8001/api/reports/submit \
  -H "Content-Type: application/json" \
  -d '{
    "rider_id": "rider_123",
    "driver_id": "driver_456",
    "trip_id": "trip_789",
    "category": "abusive_behavior",
    "description": "Driver was rude and used offensive language",
    "evidence_urls": ["https://..."]
  }'
```

Response:
```json
{
  "success": true,
  "message": "Report submitted successfully. Our team will review it.",
  "report_id": "RPT-1234567890",
  "severity": "high",
  "action_taken": "warning_sent"
}
```

#### GET `/api/reports/driver/{driver_id}`
Get all reports for a driver
```bash
curl http://localhost:8001/api/reports/driver/driver_456?include_resolved=false
```

#### GET `/api/reports/driver/{driver_id}/statistics`
Get driver report statistics
```bash
curl http://localhost:8001/api/reports/driver/driver_456/statistics
```

Response:
```json
{
  "total_reports": 2,
  "pending_reports": 2,
  "resolved_reports": 0,
  "current_report_points": 8,
  "category_breakdown": {
    "abusive_behavior": 1,
    "offensive_language": 1
  },
  "thresholds": {
    "warning": 3,
    "temporary_suspension": 10,
    "permanent_suspension": 20
  }
}
```

#### GET `/api/admin/reports/all`
Get all reports (admin)
```bash
curl "http://localhost:8001/api/admin/reports/all?status=pending&limit=100"
```

#### POST `/api/admin/reports/{report_id}/resolve`
Resolve a report (admin)
```bash
curl -X POST http://localhost:8001/api/admin/reports/RPT-123/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "resolution_notes": "Reviewed and took appropriate action",
    "action_taken": "driver_warned"
  }'
```

#### GET `/api/admin/reports/categories`
Get available report categories
```bash
curl http://localhost:8001/api/admin/reports/categories
```

#### GET `/api/drivers/{driver_id}/suspension-status`
Check if driver is suspended
```bash
curl http://localhost:8001/api/drivers/driver_456/suspension-status
```

### Frontend Integration Example

```typescript
// Report driver screen
async function submitReport() {
  const response = await fetch(`${BACKEND_URL}/api/reports/submit`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      rider_id: currentUser.id,
      driver_id: trip.driver_id,
      trip_id: trip.id,
      category: selectedCategory,
      description: reportDescription
    })
  });
  
  const result = await response.json();
  
  if (result.success) {
    Alert.alert('Report Submitted', result.message);
  }
}
```

---

## 🔒 SECURITY FEATURES

### Trial Abuse Prevention
- Phone numbers hashed and encrypted
- NIN and license numbers hashed (SHA-256)
- Device IDs tracked without storing personal data
- IP tracking for pattern detection
- Automatic blacklisting after trial usage

### Driver Report System
- Riders can only report trips they were on
- One report per trip per rider
- Automatic suspension based on points
- Admin review for critical reports
- Notification system for all parties

### Performance Rewards
- Duplicate prevention (one reward per month per driver)
- Activity logging for audit trail
- Automated notifications
- Manual override by admin

---

## 📊 DATABASE COLLECTIONS CREATED

1. **rewards_log** - Stores all reward grants
2. **trial_blacklist** - Blacklisted phone numbers
3. **trial_attempts** - Trial signup attempts tracking
4. **abuse_logs** - Security abuse detection logs
5. **driver_reports** - All driver reports
6. **driver_suspensions** - Active suspensions
7. **admin_alerts** - Critical alerts for admin

---

## 🚀 DEPLOYMENT CHECKLIST

- [x] Backend code deployed
- [x] API endpoints tested
- [ ] Frontend UI for report submission
- [ ] Frontend UI for driver rewards history
- [ ] Cron job for monthly rewards
- [ ] Admin panel integration
- [ ] Mobile app testing

---

## 📞 SUPPORT

For issues or questions, contact the development team.

Last Updated: January 31, 2026
Version: 1.0.0
