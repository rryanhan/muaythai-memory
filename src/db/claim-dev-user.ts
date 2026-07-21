import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { getEnvironmentFilePath } from "@/config/environment-file";
import { db, postgresClient } from "./client";
import { drills, tags, users } from "./schema";

config({ path: getEnvironmentFilePath() });

const DEV_USER_DISPLAY_NAME = "Dev Fighter";

async function main() {
  const { email, displayName } = parseArguments(process.argv.slice(2));
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const authUser = await findAuthUserByEmail(supabase, email);

  if (!authUser) {
    throw new Error(`No Supabase Auth user exists for ${email}. Sign in once before claiming data.`);
  }

  const [devUser] = await db
    .select()
    .from(users)
    .where(eq(users.displayName, DEV_USER_DISPLAY_NAME))
    .limit(1);

  if (!devUser) {
    const [targetUser] = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
    if (targetUser) {
      console.log("Dev Fighter data has already been claimed.");
      return;
    }
    throw new Error("Dev Fighter was not found and no target app user exists.");
  }

  if (devUser.id === authUser.id) {
    console.log("Dev Fighter already uses the authenticated user id.");
    return;
  }

  const [devCustomTags, targetCustomTags] = await Promise.all([
    db.select({ slug: tags.slug }).from(tags).where(and(eq(tags.userId, devUser.id), eq(tags.kind, "custom"))),
    db.select({ slug: tags.slug }).from(tags).where(and(eq(tags.userId, authUser.id), eq(tags.kind, "custom"))),
  ]);
  const targetSlugs = new Set(targetCustomTags.map((tag) => tag.slug));
  const conflicts = devCustomTags.map((tag) => tag.slug).filter((slug) => targetSlugs.has(slug));

  if (conflicts.length > 0) {
    throw new Error(`Custom tag conflicts must be resolved before claiming: ${conflicts.join(", ")}`);
  }

  const result = await db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({ id: authUser.id, displayName })
      .onConflictDoUpdate({ target: users.id, set: { displayName, updatedAt: new Date() } });

    const movedDrills = await tx
      .update(drills)
      .set({ userId: authUser.id, updatedAt: new Date() })
      .where(eq(drills.userId, devUser.id))
      .returning({ id: drills.id });
    const movedTags = await tx
      .update(tags)
      .set({ userId: authUser.id, updatedAt: new Date() })
      .where(and(eq(tags.userId, devUser.id), eq(tags.kind, "custom")))
      .returning({ id: tags.id });

    const [remainingDrill] = await tx.select({ id: drills.id }).from(drills).where(eq(drills.userId, devUser.id)).limit(1);
    const [remainingTag] = await tx.select({ id: tags.id }).from(tags).where(eq(tags.userId, devUser.id)).limit(1);
    if (remainingDrill || remainingTag) throw new Error("Dev Fighter still owns data; claim was rolled back.");

    await tx.delete(users).where(eq(users.id, devUser.id));
    return { drillCount: movedDrills.length, customTagCount: movedTags.length };
  });

  console.log(`Claim complete: ${result.drillCount} drills and ${result.customTagCount} custom tags moved.`);
}

function parseArguments(args: string[]): { email: string; displayName: string } {
  const email = getArgument(args, "--email")?.trim().toLowerCase();
  const displayName = getArgument(args, "--display-name")?.trim();
  if (!email) throw new Error("Usage: npm run db:claim-dev-user -- --email <email> --display-name <name>");
  return { email, displayName: displayName || email.split("@")[0] || "Fighter" };
}

function getArgument(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function findAuthUserByEmail(
  supabase: SupabaseClient,
  email: string,
) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  return null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await postgresClient.end();
  });
