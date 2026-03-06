/**
 * Image utilities — compress, crop, and get dimensions
 * All operations use expo-image-manipulator (already in deps)
 */

import * as ImageManipulator from 'expo-image-manipulator';

export async function compressImage(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1920 } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

export async function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  const result = await ImageManipulator.manipulateAsync(uri, [], {});
  return { width: result.width, height: result.height };
}

/**
 * Crop a region from an image.
 * originX/Y, width, height are pixel coordinates in the original image.
 */
export async function cropImage(
  uri: string,
  originX: number,
  originY: number,
  width: number,
  height: number,
): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop: { originX, originY, width, height } }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

export async function rotateImage(uri: string, degrees: 90 | -90 | 180): Promise<string> {
  const r = await ImageManipulator.manipulateAsync(
    uri,
    [{ rotate: degrees }],
    { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG },
  );
  return r.uri;
}

/**
 * Auto-crop a book from a bounding box returned by AI.
 * bbox: normalized 0-1 values { x, y, width, height }.
 * Adds 30% padding around the bounding box and clamps to image edges.
 */
export async function cropBookFromBBox(
  uri: string,
  bbox: { x: number; y: number; width: number; height: number },
): Promise<string> {
  const { width: imgW, height: imgH } = await getImageDimensions(uri);

  const PAD = 0.30; // 30% padding
  const padX = bbox.width  * PAD;
  const padY = bbox.height * PAD;

  const x0 = Math.max(0, bbox.x - padX);
  const y0 = Math.max(0, bbox.y - padY);
  const x1 = Math.min(1, bbox.x + bbox.width  + padX);
  const y1 = Math.min(1, bbox.y + bbox.height + padY);

  return cropImage(
    uri,
    Math.round(x0 * imgW),
    Math.round(y0 * imgH),
    Math.round((x1 - x0) * imgW),
    Math.round((y1 - y0) * imgH),
  );
}
