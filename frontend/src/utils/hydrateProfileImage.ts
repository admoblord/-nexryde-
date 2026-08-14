import { getProfilePicture } from '@/src/services/api';
import type { User } from '@/src/store/appStore';

/**
 * Load the avatar data-URI from GET /users/:id/profile-picture when the lean
 * GET /users payload omits profile_image (has_profile_image=true).
 */
export async function hydrateProfileImageUri(
  userId: string,
  user: Pick<User, 'profile_image' | 'has_profile_image'> | null | undefined,
): Promise<string | null> {
  const cached = typeof user?.profile_image === 'string' ? user.profile_image.trim() : '';
  if (cached.startsWith('data:image/') || cached.startsWith('http')) {
    return cached;
  }
  if (user?.has_profile_image === false) {
    return null;
  }
  try {
    const res = await getProfilePicture(userId);
    const img = res.data?.profile_image;
    if (typeof img === 'string' && img.trim()) return img;
  } catch {
    /* non-critical — keep initials fallback */
  }
  return null;
}
