async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// sourceUri here is already a data: URL from the browser file input.
export async function savePhotoLocally(sourceUri, photoId) {
  const checksum = await sha256(sourceUri.slice(0, 2000) + photoId);
  return { localUri: sourceUri, checksum };
}

export async function deletePhotoLocally() { /* no-op on web */ }