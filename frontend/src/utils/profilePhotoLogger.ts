/**
 * Structured profile-photo upload logs — grep device logs for [profile-photo].
 */
export type ProfilePhotoLogStage =
  | 'PHOTO_SELECTED'
  | 'AUTH_CHECK'
  | 'COMPRESS_STARTED'
  | 'COMPRESS_SUCCESS'
  | 'UPLOAD_STARTED'
  | 'UPLOAD_PROGRESS'
  | 'UPLOAD_SUCCESS'
  | 'UPLOAD_FAILED'
  | 'PROFILE_UPDATED'
  | 'UI_REFRESH';

export function logProfilePhoto(
  stage: ProfilePhotoLogStage,
  detail: Record<string, unknown> = {},
): void {
  if (__DEV__) {
    console.log(`[profile-photo] ${stage}`, detail);
  } else {
    // Production: keep failures + milestones for support tickets.
    if (
      stage === 'UPLOAD_FAILED' ||
      stage === 'UPLOAD_SUCCESS' ||
      stage === 'PROFILE_UPDATED'
    ) {
      console.log(`[profile-photo] ${stage}`, detail);
    }
  }
}
