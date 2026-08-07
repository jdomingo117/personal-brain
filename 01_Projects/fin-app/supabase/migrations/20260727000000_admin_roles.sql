-- Add RLS policy to allow users with the 'admin' app_metadata claim to view all profiles

CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (
  (auth.jwt() -> 'app_metadata' ->> 'admin') = 'true'
);

-- Note: RLS policies are OR'ed together by Supabase. 
-- Since "Users can manage their own profile" already exists for ALL, 
-- adding this SELECT policy just grants additional read access to admins.
