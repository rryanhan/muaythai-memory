import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

const DEV_USER_DISPLAY_NAME = "Dev Fighter";

// Temporary write owner until Supabase Auth is wired into the app.
export async function getCurrentUserForWrite() {
  const [existingUser] = await db.select().from(users).where(eq(users.displayName, DEV_USER_DISPLAY_NAME)).limit(1);

  if (existingUser) return existingUser;

  const [user] = await db.insert(users).values({ displayName: DEV_USER_DISPLAY_NAME }).returning();
  if (!user) throw new Error("Failed to create write user.");
  return user;
}
