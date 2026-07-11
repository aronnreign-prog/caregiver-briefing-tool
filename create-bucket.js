require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function createBucket() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase.storage.createBucket('medical_records', {
    public: false,
    allowedMimeTypes: ['application/pdf'],
    fileSizeLimit: 10485760 // 10MB
  });

  if (error) {
    if (error.message.includes('already exists')) {
      console.log('Bucket already exists.');
    } else {
      console.error('Error creating bucket:', error);
    }
  } else {
    console.log('Created bucket medical_records:', data);
  }
}

createBucket();
