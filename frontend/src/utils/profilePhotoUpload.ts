import { saveUserSession } from '@/utils/authStorage';
import type { User } from '@/src/store/appStore';
import {
  assertProfilePhotoAuth,
  uploadProfilePhotoToServer,
  type ProfilePhotoPickerMeta,
  profilePhotoErrorMessage,
  ProfilePhotoUploadError,
} from '@/src/services/profilePhotoService';
import { logProfilePhoto } from '@/src/utils/profilePhotoLogger';

export type { ProfilePhotoPickerMeta } from '@/src/services/profilePhotoService';
export { profilePhotoErrorMessage, ProfilePhotoUploadError };

type PersistProfilePhotoArgs = {
  userId: string;
  localUri: string;
  user: User | null;
  setUser: (user: User) => void;
  setProfileImage: (uri: string | null) => void;
  token?: string | null;
  pickerMeta?: ProfilePhotoPickerMeta;
};

/** Pick → compress → upload → persist to store + SecureStore. */
export async function persistProfilePhoto({
  userId,
  localUri,
  user,
  setUser,
  setProfileImage,
  pickerMeta,
}: Omit<PersistProfilePhotoArgs, 'token'>): Promise<string> {
  const { getValidToken } = await import('@/src/lib/tokenStore');
  const sessionToken = await getValidToken();

  assertProfilePhotoAuth(userId, sessionToken);

  setProfileImage(localUri);

  const savedUri = await uploadProfilePhotoToServer(userId, localUri, pickerMeta);

  setProfileImage(savedUri);

  if (user) {
    const next = { ...user, profile_image: savedUri };
    setUser(next);
    await saveUserSession({ ...next, ...(sessionToken ? { token: sessionToken } : {}) });
    logProfilePhoto('PROFILE_UPDATED', {
      userId,
      field: 'users.profile_image',
      bytes: savedUri.length,
    });
  }

  logProfilePhoto('UI_REFRESH', { userId, immediate: true });
  return savedUri;
}
