import { DEFAULT_PIN, DEFAULT_SECRET_PIN } from "./config.js";

const MAIN_PIN_KEY = "vaultx.main.pin.hash";
const SECRET_PIN_KEY = "vaultx.secret.pin.hash";

let mainSessionPin = "";
let secretSessionPin = "";

const enc = new TextEncoder();
const dec = new TextDecoder();

async function sha256(input) {
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

async function ensurePins() {
  if (!localStorage.getItem(MAIN_PIN_KEY)) {
    localStorage.setItem(MAIN_PIN_KEY, await sha256(DEFAULT_PIN));
  }
  if (!localStorage.getItem(SECRET_PIN_KEY)) {
    localStorage.setItem(SECRET_PIN_KEY, await sha256(DEFAULT_SECRET_PIN));
  }
}

export async function verifyPin(pin, secret = false) {
  await ensurePins();
  const expected = localStorage.getItem(secret ? SECRET_PIN_KEY : MAIN_PIN_KEY);
  return (await sha256(pin)) === expected;
}

export async function setPin(pin, secret = false) {
  localStorage.setItem(secret ? SECRET_PIN_KEY : MAIN_PIN_KEY, await sha256(pin));
}

export function setSessionPin(pin, secret = false) {
  if (secret) secretSessionPin = pin;
  else mainSessionPin = pin;
}

export function clearSessionPins() {
  mainSessionPin = "";
  secretSessionPin = "";
}

function toB64(uint8) {
  return btoa(String.fromCharCode(...uint8));
}

function fromB64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function deriveKey(pin, salt) {
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptPayload(payload, secret = false) {
  const pin = secret ? secretSessionPin : mainSessionPin;
  if (!pin) return payload;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pin, salt);
  const data = enc.encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return {
    v: 1,
    iv: toB64(iv),
    salt: toB64(salt),
    cipher: toB64(new Uint8Array(encrypted)),
  };
}

export async function decryptPayload(payload, secret = false) {
  if (!payload || !payload.v) return payload;
  const pin = secret ? secretSessionPin : mainSessionPin;
  if (!pin) return null;

  try {
    const key = await deriveKey(pin, fromB64(payload.salt));
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(payload.iv) },
      key,
      fromB64(payload.cipher),
    );
    return JSON.parse(dec.decode(plain));
  } catch {
    return null;
  }
}
