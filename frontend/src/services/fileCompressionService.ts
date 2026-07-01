import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

/** Aggressive driver-document limits (matches backend). */
export const IMAGE_MAX_BYTES = 500 * 1024; // 500KB
/** Rider/driver avatar uploads — smaller than driver documents. */
export const PROFILE_IMAGE_MAX_BYTES = 300 * 1024; // 300KB
export const PDF_MAX_BYTES = 2 * 1024 * 1024; // 2MB (future PDF uploads)
export const DRIVER_DOCS_TOTAL_MAX_BYTES = 20 * 1024 * 1024; // 20MB combined

export type CompressionStats = {
  originalBytes: number;
  compressedBytes: number;
  reductionPct: number;
};

export type CompressedImageResult = {
  uri: string;
  mimeType: 'image/jpeg';
  stats: CompressionStats;
};

async function fileSizeBytes(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return 0;
    return typeof (info as { size?: number }).size === 'number' ? (info as { size: number }).size : 0;
  } catch {
    return 0;
  }
}

function statsFrom(originalBytes: number, compressedBytes: number): CompressionStats {
  const reductionPct =
    originalBytes > 0 ? Math.max(0, Math.round((1 - compressedBytes / originalBytes) * 1000) / 10) : 0;
  return { originalBytes, compressedBytes, reductionPct };
}

/** One JPEG pass at a given quality + max edge length. */
async function jpegPass(uri: string, maxEdge: number, quality: number): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxEdge } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

/**
 * Aggressively compress a local image URI for driver document upload.
 * Target: ≤500KB JPEG at ≤1024px edge (fallback 800px / lower quality).
 */
export async function compressDriverDocumentUri(uri: string): Promise<CompressedImageResult> {
  const originalBytes = await fileSizeBytes(uri);
  let workingUri = uri;

  const passes: Array<{ maxEdge: number; quality: number }> = [
    { maxEdge: 1024, quality: 0.6 },
    { maxEdge: 1024, quality: 0.5 },
    { maxEdge: 800, quality: 0.5 },
    { maxEdge: 800, quality: 0.4 },
    { maxEdge: 640, quality: 0.4 },
  ];

  let bestUri = uri;
  let bestSize = originalBytes || Number.MAX_SAFE_INTEGER;

  for (const pass of passes) {
    workingUri = await jpegPass(workingUri, pass.maxEdge, pass.quality);
    const size = await fileSizeBytes(workingUri);
    if (size > 0 && size < bestSize) {
      bestSize = size;
      bestUri = workingUri;
    }
    if (size > 0 && size <= IMAGE_MAX_BYTES) {
      return {
        uri: workingUri,
        mimeType: 'image/jpeg',
        stats: statsFrom(originalBytes || size, size),
      };
    }
  }

  if (bestSize <= IMAGE_MAX_BYTES) {
    return {
      uri: bestUri,
      mimeType: 'image/jpeg',
      stats: statsFrom(originalBytes || bestSize, bestSize),
    };
  }

  throw new Error(
    `Image still too large after compression (${Math.round(bestSize / 1024)}KB). Retake closer with good lighting.`,
  );
}

/**
 * Compress a profile portrait (rider or driver) — square crop friendly, ≤300KB.
 */
export async function compressProfilePhotoUri(uri: string): Promise<CompressedImageResult> {
  const originalBytes = await fileSizeBytes(uri);
  let workingUri = uri;

  const passes: Array<{ maxEdge: number; quality: number }> = [
    { maxEdge: 512, quality: 0.72 },
    { maxEdge: 512, quality: 0.6 },
    { maxEdge: 384, quality: 0.55 },
    { maxEdge: 320, quality: 0.48 },
    { maxEdge: 256, quality: 0.4 },
  ];

  let bestUri = uri;
  let bestSize = originalBytes || Number.MAX_SAFE_INTEGER;

  for (const pass of passes) {
    workingUri = await jpegPass(workingUri, pass.maxEdge, pass.quality);
    const size = await fileSizeBytes(workingUri);
    if (size > 0 && size < bestSize) {
      bestSize = size;
      bestUri = workingUri;
    }
    if (size > 0 && size <= PROFILE_IMAGE_MAX_BYTES) {
      return {
        uri: workingUri,
        mimeType: 'image/jpeg',
        stats: statsFrom(originalBytes || size, size),
      };
    }
  }

  if (bestSize <= PROFILE_IMAGE_MAX_BYTES) {
    return {
      uri: bestUri,
      mimeType: 'image/jpeg',
      stats: statsFrom(originalBytes || bestSize, bestSize),
    };
  }

  throw new Error(
    `Profile photo is still too large (${Math.round(bestSize / 1024)}KB). Try a closer photo or different image.`,
  );
}

export function validateImageSizeBytes(sizeBytes: number): {
  valid: boolean;
  maxBytes: number;
  currentBytes: number;
} {
  return {
    valid: sizeBytes <= IMAGE_MAX_BYTES,
    maxBytes: IMAGE_MAX_BYTES,
    currentBytes: sizeBytes,
  };
}

export function formatBytesShort(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function formatCompressionLine(stats: CompressionStats): string {
  return `Compressed ${formatBytesShort(stats.originalBytes)} → ${formatBytesShort(stats.compressedBytes)} (${stats.reductionPct}% smaller)`;
}
