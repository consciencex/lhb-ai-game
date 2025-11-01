/**
 * Image processing utilities for resizing and compressing images
 * to fit within Redis size limits while maintaining image completeness
 */

/**
 * Resize and compress base64 image to fit within size limit
 * @param base64Image - Base64 encoded image string
 * @param maxSizeBytes - Maximum size in bytes (default 450KB for Redis safety)
 * @param targetWidth - Target width in pixels (default 1000 for portrait, higher resolution)
 * @param quality - JPEG quality 1-100 (default 90 for better quality)
 * @returns Resized base64 image string
 */
export async function resizeBase64Image(
  base64Image: string,
  maxSizeBytes: number = 450_000, // 450KB for safety (Redis limit is 512KB)
  targetWidth: number = 1000, // Increased from 800 to 1000 for higher resolution
  quality: number = 90, // Increased from 85 to 90 for better quality
): Promise<string> {
  try {
    // Dynamic import sharp for serverless compatibility
    let sharp: any;
    try {
      const sharpModule = await import("sharp");
      sharp = sharpModule.default || sharpModule;
      if (!sharp || typeof sharp !== "function") {
        throw new Error("Sharp not properly loaded");
      }
    } catch (importError) {
      // Fallback if sharp cannot be imported
      console.warn("Sharp not available, using fallback resize:", importError);
      return fallbackResize(base64Image, maxSizeBytes);
    }

    // Remove data URL prefix if present
    const base64Data = base64Image.includes(",") ? base64Image.split(",")[1] : base64Image;
    
    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, "base64");
    
    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    
    // Calculate target height maintaining aspect ratio
    const aspectRatio = metadata.height! / metadata.width!;
    const targetHeight = Math.round(targetWidth * aspectRatio);
    
    // Resize image
    let resizedBuffer = await sharp(buffer)
      .resize(targetWidth, targetHeight, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    
    // Check size and reduce quality if needed
    let currentQuality = quality;
    while (resizedBuffer.length > maxSizeBytes && currentQuality > 20) {
      currentQuality -= 10;
      resizedBuffer = await sharp(buffer)
        .resize(targetWidth, targetHeight, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: currentQuality, mozjpeg: true })
        .toBuffer();
    }
    
    // If still too large, reduce dimensions
    if (resizedBuffer.length > maxSizeBytes) {
      let currentWidth = targetWidth;
      while (resizedBuffer.length > maxSizeBytes && currentWidth > 400) {
        currentWidth -= 100;
        const currentHeight = Math.round(currentWidth * aspectRatio);
        resizedBuffer = await sharp(buffer)
          .resize(currentWidth, currentHeight, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 70, mozjpeg: true })
          .toBuffer();
      }
    }
    
    // Convert back to base64
    return resizedBuffer.toString("base64");
  } catch (error) {
    console.error("Failed to resize image with sharp:", error);
    // Fallback resize method
    return fallbackResize(base64Image, maxSizeBytes);
  }
}

/**
 * Fallback resize method when sharp is not available
 * This is a simple approach that may not preserve full image quality
 */
function fallbackResize(base64Image: string, maxSizeBytes: number): string {
  // Calculate max base64 length (base64 is ~33% larger than binary)
  const maxBase64Length = Math.floor(maxSizeBytes * 1.33);
  
  if (base64Image.length <= maxBase64Length) {
    return base64Image;
  }
  
  // If image is too large, we need to keep it but this should not happen often
  // Log warning for monitoring
  console.warn(
    `Image size (${base64Image.length}) exceeds limit (${maxBase64Length}). ` +
    `Keeping original - may cause Redis issues if session too large.`
  );
  
  // Return original - Redis may reject if total session too large
  // This is better than truncating which destroys the image
  return base64Image;
}

