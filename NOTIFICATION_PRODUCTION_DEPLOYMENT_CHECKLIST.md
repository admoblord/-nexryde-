# NexRyde Engagement Notifications Production Checklist

## Firebase Console

1. Open Firebase Console and select the NexRyde production project.
2. Add an Android app with package name `com.nexryde.app`.
3. Register the Play upload/release SHA-1 fingerprint used for production builds.
4. Download `google-services.json`.
5. Put `google-services.json` in one of these locations:
   - `frontend/google-services.json` for Expo/EAS builds.
   - `frontend/android/app/google-services.json` for direct native Gradle builds.
   - Or provide it as an EAS file environment variable named `GOOGLE_SERVICES_FILE`.
6. Confirm Cloud Messaging is enabled for the Firebase project.

## Android Build

1. Run `cd frontend && npm run verify:firebase-android`.
2. Expected result after adding the Firebase file:
   - `PASS google-services.json available`
   - `PASS root Gradle has Google Services classpath`
   - `PASS app Gradle applies Google Services plugin`
   - `PASS app Gradle enforces release Firebase config`
3. Build a release APK/AAB. Release builds intentionally fail if `google-services.json` is missing.
4. Install the release/internal-test build on a physical Android device.
5. Log in, grant notification permission, and check backend logs for `/users/{user_id}/push-token`.

## Firebase Admin Service Account

1. In Firebase Console, go to Project Settings -> Service accounts.
2. Generate a new private key for Firebase Admin.
3. Store it in Google Secret Manager:

   ```bash
   gcloud secrets create FIREBASE_SERVICE_ACCOUNT_JSON --replication-policy=automatic
   gcloud secrets versions add FIREBASE_SERVICE_ACCOUNT_JSON --data-file=/path/to/firebase-service-account.json
   ```

4. Grant Cloud Run service account access:

   ```bash
   PROJECT_ID=$(gcloud config get-value project)
   SA=$(gcloud run services describe nexryde-backend --region us-central1 --format='value(spec.template.spec.serviceAccountName)')
   gcloud secrets add-iam-policy-binding FIREBASE_SERVICE_ACCOUNT_JSON \
     --member="serviceAccount:${SA}" \
     --role="roles/secretmanager.secretAccessor"
   ```

## Cloud Run

Production `backend/cloudrun.service.yaml` now sets:

- `ENGAGEMENT_LOOP_ENABLED=true`
- `GOOGLE_APPLICATION_CREDENTIALS=/secrets/firebase/firebase-service-account.json`
- `ENGAGEMENT_MAX_PER_DAY=2`
- `ENGAGEMENT_MIN_HOURS_BETWEEN=6`
- `ENGAGEMENT_QUIET_HOURS_START=22`
- `ENGAGEMENT_QUIET_HOURS_END=7`

It also mounts Secret Manager secret `FIREBASE_SERVICE_ACCOUNT_JSON` at `/secrets/firebase/firebase-service-account.json`.

Deploy:

```bash
gcloud run services replace backend/cloudrun.service.yaml --region us-central1
```

If the Firebase secret is missing or unreadable, startup aborts when `ENGAGEMENT_LOOP_ENABLED=true`.

## Backend Validation

Run locally or in a secured deployment shell:

```bash
python backend/scripts/verify_fcm_push.py
FCM_TEST_TOKEN=<android-device-fcm-token> python backend/scripts/verify_fcm_push.py
```

Expected:

- `PASS Firebase Admin initialized: True`
- `PASS FCM send succeeded via fcm` when `FCM_TEST_TOKEN` is provided.

## End-To-End Test Flow

1. Driver installs NexRyde release/internal-test build.
2. Driver logs in.
3. Driver grants notification permission.
4. App registers Expo push token.
5. Android app registers native FCM token with `getDevicePushTokenAsync()`.
6. App calls `/api/users/{user_id}/push-token` with provider `fcm`.
7. Backend stores token in `users.push_token` and `users.push_devices`.
8. Engagement scheduler scans eligible users every 5 minutes.
9. Scheduler applies quiet hours, daily cap, min interval, preferences, and real demand/availability checks.
10. Scheduler selects a non-repeating/A-B variant.
11. Backend sends through Firebase Admin SDK.
12. Driver receives notification.
13. Notification open/action is reported back to `/api/users/{user_id}/notification-opened`.
14. Backend attributes opens, trips after notification, and driver went-online events.

## Troubleshooting

- No FCM token: confirm `google-services.json` is in the build and package name is `com.nexryde.app`.
- Release build fails: add `google-services.json` and `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`.
- Backend startup aborts: confirm Secret Manager secret `FIREBASE_SERVICE_ACCOUNT_JSON` exists and Cloud Run service account can read it.
- Push sends fail: run `backend/scripts/verify_fcm_push.py` with a real device token.
- Engagement notifications not sent: check `ENGAGEMENT_LOOP_ENABLED=true`, user push preferences, quiet hours, daily cap, recent trip suppression, and real demand/availability thresholds.
- Demand notifications not sent: this is expected unless real pending trips and online-driver metrics satisfy thresholds.
