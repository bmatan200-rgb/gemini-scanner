/**
 * Compresses an image to a maximum dimension and quality
 * Uses createImageBitmap when available for better memory efficiency on mobile
 */
export async function compressImage(source: string | File | Blob, maxWidth = 800, quality = 0.55): Promise<string> {
  // Try using createImageBitmap if supported (better memory handling)
  if (typeof window !== 'undefined' && 'createImageBitmap' in window && source instanceof Blob) {
    try {
      const bitmap = await createImageBitmap(source);
      const canvas = document.createElement('canvas');
      let { width, height } = bitmap;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width *= maxWidth / height;
          height = maxWidth;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        return canvas.toDataURL('image/jpeg', quality);
      }
    } catch (e) {
      console.warn("createImageBitmap failed, falling back to legacy Image", e);
    }
  }

  // Fallback to legacy Image-based compression
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    let url: string;
    if (typeof source === 'string') {
      url = source;
    } else {
      url = URL.createObjectURL(source);
    }

    img.onload = () => {
      if (typeof source !== 'string') {
        URL.revokeObjectURL(url);
      }
      
      try {
        const canvas = document.createElement('canvas');
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width === 0 || height === 0) {
          reject(new Error('Image has zero dimensions'));
          return;
        }

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width *= maxWidth / height;
            height = maxWidth;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          reject(new Error('Could not get 2D context'));
          return;
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      if (typeof source !== 'string') {
        URL.revokeObjectURL(url);
      }
      reject(new Error('Failed to load image for compression'));
    };
    img.src = url;
  });
}
