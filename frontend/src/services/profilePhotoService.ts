import * as FileSystem from 'expo-file-system/legacy';
import { compressProfilePhotoUri } from '@/src/services/fileCompressionService';
import api from '@/src/services/api';
import { apiErrorMessage } from '@/src/utils/apiErrorMessage';
import { logProfilePhoto } from '@/src/utils/profilePhotoLogger';

const SUPPORTED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const SUPPORTED_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

export type ProfilePhotoPickerMeta = {
  fileName?: string | null;
  mimeType?: string | null;
  width?: number;
  height?: number;
  fileSize?: number;
};

export class ProfilePhotoUploadError extends Error {
  constructor(
    message: string,
    public readonly stage: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProfilePhotoUploadError';
  }
}

function assertSupportedFormat(localUri: string, meta?: ProfilePhotoPickerMeta): void {
  const mime = (meta?.mimeType || '').toLowerCase();
  if (mime && !SUPPORTED_MIME.has(mime)) {
    throw new ProfilePhotoUploadError(
      `Unsupported image format (${mime}). Use JPG, PNG, or WebP.`,
      'PHOTO_SELECTED',
    );
  }
  const name = meta?.fileName || localUri;
  if (!mime && name && !SUPPORTED_EXT.test(name.split('?')[0])) {
    throw new ProfilePhotoUploadError(
      'Unsupported image format. Use JPG, PNG, or WebP.',
      'PHOTO_SELECTED',
    );
  }
}

export function assertProfilePhotoAuth(
  userId: string | undefined,
  token: string | null | undefined,
): void {
  if (!userId?.trim()) {
    throw new ProfilePhotoUploadError('No user session. Please log in again.', 'AUTH_CHECK');
  }
  if (!token?.trim()) {
    throw new ProfilePhotoUploadError(
      'Authentication expired. Please log in again before uploading.',
      'AUTH_CHECK',
    );
  }
  logProfilePhoto('AUTH_CHECK', { userId, hasToken: true });
}

/**
 * Compress local image → base64 data URI → POST /users/:id/profile-picture.
 * Storage: MongoDB `users.profile_image` (data URI). No external bucket.
 */
export async function uploadProfilePhotoToServer(
  userId: string,
  localUri: string,
  meta?: ProfilePhotoPickerMeta,
): Promise<string> {
  assertSupportedFormat(localUri, meta);

  logProfilePhoto('PHOTO_SELECTED', {
    userId,
    uri: localUri.slice(0, 80),
    fileName: meta?.fileName ?? null,
    mimeType: meta?.mimeType ?? null,
    width: meta?.width ?? null,
    height: meta?.height ?? null,
    fileSize: meta?.fileSize ?? null,
  });

  logProfilePhoto('COMPRESS_STARTED', { userId });
  let compressed;
  try {
    compressed = await compressProfilePhotoUri(localUri);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Image compression failed';
    logProfilePhoto('UPLOAD_FAILED', { stage: 'COMPRESS', error: msg });
    throw new ProfilePhotoUploadError(msg, 'COMPRESS', err);
  }

  logProfilePhoto('COMPRESS_SUCCESS', {
    userId,
    originalBytes: compressed.stats.originalBytes,
    compressedBytes: compressed.stats.compressedBytes,
    reductionPct: compressed.stats.reductionPct,
  });

  let base64: string;
  try {
    base64 = await FileSystem.readAsStringAsync(compressed.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : 'Could not read compressed image from device storage';
    logProfilePhoto('UPLOAD_FAILED', { stage: 'READ_FILE', error: msg });
    throw new ProfilePhotoUploadError(
      `Failed to read image file: ${msg}`,
      'READ_FILE',
      err,
    );
  }

  if (!base64?.length) {
    throw new ProfilePhotoUploadError(
      'Compressed image file was empty. Try another photo.',
      'READ_FILE',
    );
  }

  const dataUri = `data:image/jpeg;base64,${base64}`;
  const payloadBytes = Math.round((dataUri.length * 3) / 4);

  logProfilePhoto('UPLOAD_STARTED', {
    userId,
    payloadBytes,
    compressedBytes: compressed.stats.compressedBytes,
    endpoint: `/users/${userId}/profile-picture`,
  });

  try {
    const res = await api.post(
      `/users/${userId}/profile-picture`,
      { image: dataUri },
      { timeout: 45000 },
    );

    const saved = res.data?.profile_image as string | undefined;
    if (!saved?.startsWith('data:image/')) {
      logProfilePhoto('UPLOAD_FAILED', {
        stage: 'RESPONSE',
        error: 'Backend did not return profile_image data URI',
        response: res.data,
      });
      throw new ProfilePhotoUploadError(
        'Server saved the photo but returned an invalid image URL.',
        'RESPONSE',
      );
    }

    logProfilePhoto('UPLOAD_SUCCESS', {
      userId,
      returnedBytes: saved.length,
      storage: 'mongodb_users_profile_image',
    });

    return saved;
  } catch (err) {
    const msg = apiErrorMessage(err, 'Profile photo upload failed');
    logProfilePhoto('UPLOAD_FAILED', {
      userId,
      error: msg,
      httpStatus: (err as { response?: { status?: number } })?.response?.status ?? null,
      backendDetail: (err as { response?: { data?: unknown } })?.response?.data ?? null,
    });
    throw new ProfilePhotoUploadError(msg, 'UPLOAD', err);
  }
}

export function profilePhotoErrorMessage(err: unknown): string {
  if (err instanceof ProfilePhotoUploadError) return err.message;
  return apiErrorMessage(err, 'Could not save your profile photo. Please try again.');
}
