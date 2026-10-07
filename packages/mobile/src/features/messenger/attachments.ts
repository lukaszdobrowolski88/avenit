import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { supabase, tenantWebBase } from "../../lib/supabase";
import type { MessageAttachment } from "./api";

// Ta sama nazwa co web i serwer (storage/routes.js BUCKETS) — z podkreśleniem serwer odrzucał zdjęcia.
const BUCKET = "messenger-attachments";

// Limit jak w webie (MessageInput: 10 MB na plik).
const MAX_BYTES = 10 * 1024 * 1024;

// Wysyłka pliku: w React Native FormData przenosi plik WYŁĄCZNIE jako {uri, name, type} —
// ArrayBuffer po drodze przepadał (na serwer szedł pusty plik; zweryfikowane przy załącznikach
// zadań). Adres pliku — na hoście kościoła (jak w webie): api.* bez nagłówka X-Tenant nie wie,
// czyj to plik, więc zdjęcie z telefonu nie wyświetlało się nikomu.
const uploadFile = async (path: string, uri: string, name: string, mime: string): Promise<string> => {
  const file = { uri, name, type: mime };
  const { error } = await supabase.storage.from(BUCKET).upload(path, file as never, { contentType: mime, upsert: false });
  if (error) throw error;
  const base = tenantWebBase();
  return base ? `${base}/storage/${BUCKET}/${path}` : supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
};

const guessExt = (uri: string, fallback = "jpg"): string => {
  const m = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return (m?.[1] ?? fallback).toLowerCase();
};

const guessMime = (ext: string): string => {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "gif":
      return "image/gif";
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "txt":
      return "text/plain";
    case "m4a":
      return "audio/mp4";
    default:
      return "application/octet-stream";
  }
};

export const pickImageFromLibrary = async (): Promise<ImagePicker.ImagePickerAsset | null> => {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.85,
    exif: false,
  });
  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  return result.assets[0];
};

export const takePhoto = async (): Promise<ImagePicker.ImagePickerAsset | null> => {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchCameraAsync({
    quality: 0.85,
    exif: false,
  });
  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  return result.assets[0];
};

export const uploadAttachment = async (
  conversationId: string,
  asset: ImagePicker.ImagePickerAsset,
): Promise<MessageAttachment> => {
  const ext = guessExt(asset.uri, asset.mimeType?.split("/")[1] ?? "jpg");
  const mime = asset.mimeType ?? guessMime(ext);
  if (asset.fileSize && asset.fileSize > MAX_BYTES) throw new Error("Zdjęcie przekracza limit 10 MB.");
  const fileName = asset.fileName || `zdjecie-${Date.now()}.${ext}`;
  const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const url = await uploadFile(path, asset.uri, fileName, mime);
  return { url, name: fileName, type: mime, size: asset.fileSize };
};

// Plik (PDF, dokument, arkusz…) — jak „Zdjęcie lub plik” w webie.
export const pickDocument = async (): Promise<DocumentPicker.DocumentPickerAsset | null> => {
  const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  return result.assets[0];
};

export const uploadDocument = async (
  conversationId: string,
  asset: DocumentPicker.DocumentPickerAsset,
): Promise<MessageAttachment> => {
  const name = asset.name || `plik-${Date.now()}`;
  const ext = guessExt(name, "bin");
  const mime = asset.mimeType || guessMime(ext);
  if (asset.size && asset.size > MAX_BYTES) throw new Error(`Plik „${name}” przekracza limit 10 MB.`);
  const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const url = await uploadFile(path, asset.uri, name, mime);
  return { url, name, type: mime, size: asset.size ?? undefined };
};

/**
 * Upload nagrania głosowego (z expo-av Recording.getURI()) do bucketu i zwróć załącznik
 * w tym samym kształcie co web (MessageInput.handleSendVoiceMessage): nazwa „Wiadomość głosowa”,
 * size = rozmiar pliku w bajtach, duration = długość w sekundach, isVoiceMessage = true.
 * (Starsze nagrania z telefonu niosły długość w ms w polu size — czyta je voiceDurationMs.)
 */
export const uploadVoiceMessage = async (
  conversationId: string,
  uri: string,
  mime: string,
  durationMs: number,
): Promise<MessageAttachment> => {
  // .m4a (iOS) lub .3gp/.aac (Android) — wybierz na podstawie mime, fallback na m4a.
  let ext = "m4a";
  if (mime.includes("aac")) ext = "aac";
  else if (mime.includes("3gpp")) ext = "3gp";
  else if (mime.includes("webm")) ext = "webm";
  else {
    const fromUri = guessExt(uri, "m4a");
    if (fromUri && fromUri !== "tmp") ext = fromUri;
  }
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  const fileName = `voice-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}-${seconds}s.${ext}`;
  const path = `${conversationId}/${fileName}`;
  const url = await uploadFile(path, uri, fileName, mime);
  return {
    url,
    name: "Wiadomość głosowa",
    type: mime,
    duration: seconds,
    isVoiceMessage: true,
  };
};

/** Głosówka — wspólna reguła z webem (logic.ts ↔ chatLogic.js). */
export { isVoiceAttachment, voiceDurationMs } from "./logic";
