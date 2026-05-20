import { resolvePublicMediaUri } from '@/src/utils/resolvePublicMediaUri';

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

/** Prefer face (pickup verification) then profile portrait. */
export function pickDriverPhotoRaw(info: Record<string, unknown> | null | undefined): {
  face: string | null;
  profile: string | null;
} {
  if (!info) return { face: null, profile: null };
  return {
    face: firstNonEmptyString(info.face_image, info.driver_face_image),
    profile: firstNonEmptyString(
      info.profile_image,
      info.driver_profile_image,
      info.avatar,
      info.photo,
    ),
  };
}

export function resolveDriverPhotoUri(info: Record<string, unknown> | null | undefined): string | null {
  const { face, profile } = pickDriverPhotoRaw(info);
  return resolvePublicMediaUri(face) || resolvePublicMediaUri(profile);
}

/** Prefer face portrait for pickup verification, then profile. */
export function driverAvatarSources(
  info: Record<string, unknown> | null | undefined,
): { face: string | null; profile: string | null } {
  return pickDriverPhotoRaw(info);
}

export function pickRiderPhotoRaw(source: Record<string, unknown> | null | undefined): string | null {
  if (!source) return null;
  const rider =
    source.rider && typeof source.rider === 'object'
      ? (source.rider as Record<string, unknown>)
      : null;
  return firstNonEmptyString(
    source.rider_photo,
    source.rider_profile_image,
    source.rider_avatar,
    rider?.profile_image,
    rider?.photo,
    rider?.face_image,
  );
}

export function resolveRiderPhotoUri(source: Record<string, unknown> | null | undefined): string | null {
  return resolvePublicMediaUri(pickRiderPhotoRaw(source));
}
