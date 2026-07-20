import { config } from "dotenv";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  PROFILE_AVATAR_BUCKET,
  PROFILE_AVATAR_MAX_BYTES,
  PROFILE_AVATAR_MIME_TYPES,
} from "@/modules/profile/avatar";
import {
  JOURNAL_MEDIA_BUCKET,
  JOURNAL_POSTER_MIME_TYPES,
  JOURNAL_VIDEO_MAX_BYTES,
  JOURNAL_VIDEO_MIME_TYPES,
} from "@/modules/journal/constants";

config({ path: ".env.local" });

async function main() {
  const supabase = createSupabaseAdminClient();
  const { data: buckets, error: lookupError } = await supabase.storage.listBuckets();
  if (lookupError) throw lookupError;

  const bucketDefinitions = [
    {
      id: PROFILE_AVATAR_BUCKET,
      options: {
        public: true,
        fileSizeLimit: PROFILE_AVATAR_MAX_BYTES,
        allowedMimeTypes: [...PROFILE_AVATAR_MIME_TYPES],
      },
    },
    {
      id: JOURNAL_MEDIA_BUCKET,
      options: {
        public: false,
        fileSizeLimit: JOURNAL_VIDEO_MAX_BYTES,
        allowedMimeTypes: [...JOURNAL_VIDEO_MIME_TYPES, ...JOURNAL_POSTER_MIME_TYPES],
      },
    },
  ];

  for (const definition of bucketDefinitions) {
    const existingBucket = buckets.find((bucket) => bucket.id === definition.id);
    if (existingBucket) {
      const { error } = await supabase.storage.updateBucket(definition.id, definition.options);
      if (error) throw error;
      console.log(`Updated ${definition.id} storage settings.`);
      continue;
    }

    const { error } = await supabase.storage.createBucket(definition.id, definition.options);
    if (error) throw error;
    console.log(`Created ${definition.id} storage bucket.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
