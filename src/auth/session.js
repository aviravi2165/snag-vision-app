import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Hermes doesn't guarantee atob/Buffer, so this decodes base64url by hand —
// good enough for a JWT payload, which is always plain-ASCII JSON (ids,
// numbers, role strings).
function base64UrlDecode(input) {
  const str = input.replace(/-/g, '+').replace(/_/g, '/');
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < str.length; i++) {
    const idx = BASE64_CHARS.indexOf(str[i]);
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

// Reads the `exp` claim straight off the token. This never verifies the
// signature — the server does that on every request — it only lets the app
// warn before a request fails, and clean up gracefully after one already has.
export function decodeTokenExpiryMs(token) {
  try {
    const payload = JSON.parse(base64UrlDecode(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// A missing/undecodable expiry is treated as "not known to be expired"
// rather than forcing a logout — safe default for sessions stored before
// this check existed.
export function isExpiredAt(expMs) {
  return !!expMs && Date.now() >= expMs;
}

// Clears only auth identity — never touches the photos/spots tables, so a
// captured-but-not-yet-synced queue survives a forced sign-out untouched.
export async function clearSession() {
  await AsyncStorage.multiRemove(['sv_token', 'sv_token_exp', 'sv_role', 'sv_name', 'sv_email']);
}
