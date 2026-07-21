import { resolvePublicMediaUri } from '@/src/utils/resolvePublicMediaUri';

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

/**
 * Prefer framed profile portrait (Uber-style), then face / face URL.
 * Face-first made many trip UIs show crop-heavy verification selfies or nothing
 * when only `driver_face_image_url` was present.
 */
export function pickDriverPhotoRaw(info: Record<string, unknown> | null | undefined): {
  face: string | null;
  profile: string | null;
} {
  if (!info) return { face: null, profile: null };
  const nested =
    info.driver && typeof info.driver === 'object'
      ? (info.driver as Record<string, unknown>)
      : info.driver_info && typeof info.driver_info === 'object'
        ? (info.driver_info as Record<string, unknown>)
        : null;

  return {
    profile: firstNonEmptyString(
      info.profile_image,
      info.driver_profile_image,
      info.avatar,
      info.photo,
      info.image_url,
      nested?.profile_image,
      nested?.avatar,
      nested?.photo,
      nested?.image_url,
    ),
    face: firstNonEmptyString(
      info.face_image,
      info.driver_face_image,
      info.driver_face_image_url,
      nested?.face_image,
      nested?.driver_face_image,
      nested?.driver_face_image_url,
    ),
  };
}

/** Profile first (display), face second (identity fallback). */
export function resolveDriverPhotoUri(info: Record<string, unknown> | null | undefined): string | null {
  const { face, profile } = pickDriverPhotoRaw(info);
  return resolvePublicMediaUri(profile) || resolvePublicMediaUri(face);
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
    source.rider_profile_image,
    source.rider_photo,
    source.rider_avatar,
    source.rider_face_image,
    source.profile_image,
    source.photo,
    source.face_image,
    rider?.profile_image,
    rider?.photo,
    rider?.face_image,
    rider?.avatar,
  );
}

export function resolveRiderPhotoUri(source: Record<string, unknown> | null | undefined): string | null {
  return resolvePublicMediaUri(pickRiderPhotoRaw(source));
}
