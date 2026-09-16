export interface CompressionTarget {
  maxSizeMB: number;
  maxWidthOrHeight: number;
}

export const INCIDENT_PHOTO_TARGET: CompressionTarget = { maxSizeMB: 0.3, maxWidthOrHeight: 1_600 };
// Identity documents must stay legible for the official who checks them.
export const DOCUMENT_PHOTO_TARGET: CompressionTarget = { maxSizeMB: 1, maxWidthOrHeight: 2_400 };

// Loaded on first use so the SOS screen never downloads the compressor. The library's web worker imports its
// own script from a public CDN, which fails or stalls on the networks this app is built for, so compression
// runs on the main thread instead.
export async function compressImage(file: File, target: CompressionTarget): Promise<File> {
  const { default: imageCompression } = await import('browser-image-compression');
  return imageCompression(file, {
    maxSizeMB: target.maxSizeMB,
    maxWidthOrHeight: target.maxWidthOrHeight,
    useWebWorker: false,
    fileType: 'image/jpeg',
    initialQuality: 0.8,
  });
}
