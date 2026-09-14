-- Powiązanie grupy domowej z jej folderem w Materiałach (Pliki). Materiały grupy = pliki
-- w tym folderze (materials_files), a folder jest udostępniony całej grupie domowej
-- (materials_shares target_type='home_group') → członkowie widzą je w „Udostępnione mi".
ALTER TABLE home_groups ADD COLUMN IF NOT EXISTS materials_folder_id uuid;
