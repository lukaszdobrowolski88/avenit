-- Create storage bucket for finance documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('finance', 'finance', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS for the finance bucket
CREATE POLICY "Allow authenticated users to upload finance documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'finance');

CREATE POLICY "Allow authenticated users to view finance documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'finance');

CREATE POLICY "Allow authenticated users to delete finance documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'finance');

CREATE POLICY "Allow public access to finance documents"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'finance');
