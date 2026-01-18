-- Storage RLS Policies for item-images bucket
-- Run this in Supabase SQL Editor AFTER creating the bucket

-- Allow anyone to view/download images (public read)
CREATE POLICY "Anyone can view item images"
ON storage.objects FOR SELECT
USING (bucket_id = 'item-images');

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload item images"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'item-images' 
    AND auth.role() = 'authenticated'
);

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update item images"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'item-images' 
    AND auth.role() = 'authenticated'
);

-- Allow authenticated users to delete images
CREATE POLICY "Authenticated users can delete item images"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'item-images' 
    AND auth.role() = 'authenticated'
);
