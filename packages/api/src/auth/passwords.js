// Hasła: bcrypt (bcryptjs — czysty JS, bez natywnych zależności).
// Hasze zmigrowane z Supabase GoTrue (auth.users.encrypted_password) to również
// bcrypt ($2a$10$...), więc zmigrowani użytkownicy logują się starym hasłem.
import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export async function hashPassword(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain, hash) {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
