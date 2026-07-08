-- Allow ProPresenter (.pro / .pro6 / .pro6pl / .pro7) and other binary
-- attachments on bucket `public-assets`. Browsers send `application/octet-stream`
-- as Content-Type for these extensions (no registered IANA MIME type), so the
-- bucket's allowed_mime_types whitelist must include it; otherwise upload fails
-- with: "mime type application/octet-stream is not supported".

DO $$
DECLARE
    current_types TEXT[];
BEGIN
    SELECT allowed_mime_types INTO current_types
      FROM storage.buckets
     WHERE id = 'public-assets';

    -- If bucket already has no restriction (NULL), nothing to do.
    IF current_types IS NULL THEN
        RAISE NOTICE 'public-assets has no MIME restriction — skipping.';
        RETURN;
    END IF;

    -- Append application/octet-stream if not already present.
    IF NOT ('application/octet-stream' = ANY(current_types)) THEN
        UPDATE storage.buckets
           SET allowed_mime_types = array_append(current_types, 'application/octet-stream')
         WHERE id = 'public-assets';
    END IF;
END $$;
