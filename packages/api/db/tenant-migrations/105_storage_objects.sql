-- 105: Rejestr wgranych plików (audyt uprawnień 2026-10-11, runda 4 — storage).
-- Do teraz każdy zalogowany mógł usunąć albo nadpisać (x-upsert) dowolny plik w bucketach
-- niewrażliwych (materiały, programy, grafiki, sprzęt, formularze). Teraz zmiana/usunięcie
-- pliku: administrator, obsługa bucketu (uprawnienie modułu) albo osoba, która go wgrała —
-- tę wiedzę daje ta tabela (wpis przy każdym uploadzie przez /api/storage). Pliki sprzed
-- migracji nie mają wpisu — zmienia je tylko administrator / obsługa bucketu.
CREATE TABLE IF NOT EXISTS storage_objects (
  bucket      text NOT NULL,
  path        text NOT NULL,
  uploaded_by text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, path)
);
