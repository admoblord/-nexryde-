# NEXRYDE Admin Panel Access Guide

## Admin Panel URL

The admin panel is served by the backend API server, NOT through the Expo frontend app.

### Local Development Access

**Correct URL:** `http://localhost:8001/admin/`

**❌ Wrong URL:** `http://localhost:3000/admin` (This will show "Unmatched Route" error)

### Production/Deployed Access

The admin panel should be accessed through the backend API URL with the `/admin` path.

For example:
- If your backend is at: `https://api.nexryde.com`
- Then admin panel is at: `https://api.nexryde.com/admin/`

## Admin Login Credentials

Based on the test results, the admin credentials are:

- **Email:** `admin@nexryde.com`
- **Password:** `nexryde2025`

## Technical Details

The admin panel is:
1. A static HTML/CSS/JavaScript application located in `/app/admin/`
2. Served by FastAPI using `StaticFiles` middleware
3. Mounted at the `/admin` route in `server.py`
4. Separate from the React Native Expo app

## Why the Confusion?

The Expo app (running on port 3000) is a React Native mobile application and doesn't include the admin panel in its routing. The admin panel is a separate web application served by the backend API server (running on port 8001).

## Code Reference

In `/app/backend/server.py`, you can find:

```python
# Mount admin static files
app.mount("/admin", StaticFiles(directory=str(ADMIN_DIR), html=True), name="admin")
```

This means the admin panel is accessible at the backend server's `/admin` route.
