#!/bin/bash

# A simple script to grant admin privileges to a user by email in the local Supabase DB

if [ -z "$1" ]; then
  echo "Usage: ./scripts/make-admin.sh <email>"
  echo "Example: ./scripts/make-admin.sh user@example.com"
  exit 1
fi

EMAIL=$1

echo "Granting admin privileges to $EMAIL..."

# We use SUPABASE_TELEMETRY_OPT_OUT to avoid sandbox/permission issues when running locally
SUPABASE_TELEMETRY_OPT_OUT=true SUPABASE_DISABLE_TELEMETRY=true npx supabase db query "
  UPDATE auth.users 
  SET raw_app_meta_data = raw_app_meta_data || '{\"admin\": true}'::jsonb 
  WHERE email = '$EMAIL';
"

echo "Done! If the email existed, they are now an admin."
echo "You may need to log out and log back in for the new JWT token to be issued."
