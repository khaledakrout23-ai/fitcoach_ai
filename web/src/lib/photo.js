// Réduit une photo (1024 px max, JPEG) avant l'envoi : plus rapide sur le réseau d'une salle,
// et la photo ré-encodée par le navigateur ne garde aucune métadonnée (position GPS, appareil).
export function shrinkPhoto(file, max = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type || 'image/jpeg')) {
      reject(new Error('PHOTO_INVALID'));
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('PHOTO_INVALID'));
    };
    img.src = url;
  });
}
