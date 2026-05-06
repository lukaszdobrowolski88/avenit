import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../lib/supabase";
import type { MessageAttachment } from "./api";

const BUCKET = "messenger_attachments";

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
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${conversationId}/${fileName}`;

  // React Native: upload przez fetch → blob → arrayBuffer (najbardziej niezawodne).
  const response = await fetch(asset.uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, { contentType: mime, upsert: false });
  if (uploadErr) throw uploadErr;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return {
    url: data.publicUrl,
    name: fileName,
    type: mime,
    size: asset.fileSize,
  };
};

/**
 * Upload nagrania głosowego (z expo-av Recording.getURI()) do bucketu i zwróć attachment.
 * `durationMs` jest dopisywany do nazwy pliku — jest też sourcem dla MessageAttachment.size,
 * ale przede wszystkim trzymamy go w name aby player mógł rozpoznać voice w razie braku metadanych.
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

  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, { contentType: mime, upsert: false });
  if (uploadErr) throw uploadErr;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return {
    url: data.publicUrl,
    name: fileName,
    type: mime,
    size: durationMs, // używamy size jako nośnika długości w ms (analog web — "isVoiceMessage")
  };
};

/** Heurystyka — wiadomość głosowa rozpoznawana po mime audio/* lub prefiksie nazwy. */
export const isVoiceAttachment = (att: { type?: string; name?: string }): boolean => {
  if (att.type?.startsWith("audio/")) return true;
  if (att.name?.startsWith("voice-")) return true;
  return false;
};
