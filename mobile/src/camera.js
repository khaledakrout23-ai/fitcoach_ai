import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Prend une photo (ou la choisit dans la galerie) et la renvoie réduite (max 1024 px, JPEG) en « data URL ».
 * @returns {Promise<string|null>} null si l'utilisateur annule
 * @throws {{ code: 'CAMERA_DENIED' }} si l'accès est refusé
 */
export async function takePhoto({ fromLibrary = false } = {}) {
  const perm = fromLibrary ? await ImagePicker.requestMediaLibraryPermissionsAsync() : await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw Object.assign(new Error('Accès refusé'), { code: 'CAMERA_DENIED' });
  const options = { mediaTypes: ['images'], quality: 1 };
  const shot = fromLibrary ? await ImagePicker.launchImageLibraryAsync(options) : await ImagePicker.launchCameraAsync(options);
  if (shot.canceled) return null;
  const { uri, width, height } = shot.assets[0];
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > 1024) ctx.resize(width >= height ? { width: 1024 } : { height: 1024 });
  const out = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  return `data:image/jpeg;base64,${out.base64}`;
}
