import { config } from "dotenv";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { verifyDeploymentEnvironment } from "@/config/deployment-environment";
import { getEnvironmentFilePath } from "@/config/environment-file";
import { db, postgresClient } from "@/db/client";
import { users } from "@/db/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { profileUsernameSchema } from "@/modules/profile/contracts";

config({ path: getEnvironmentFilePath() });
verifyDeploymentEnvironment("staging");

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

async function main() {
  const input = parseArguments(process.argv.slice(2), process.env);
  const supabase = createSupabaseAdminClient();
  const existingAuthUser = await findAuthUserByEmail(input.email);

  const [usernameOwner] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      existingAuthUser
        ? and(eq(users.username, input.username), ne(users.id, existingAuthUser.id))
        : eq(users.username, input.username),
    )
    .limit(1);

  if (usernameOwner) {
    throw new Error(`Username @${input.username} is already in use.`);
  }

  let authUserId = existingAuthUser?.id;
  let createdAuthUser = false;

  if (existingAuthUser) {
    const { data, error } = await supabase.auth.admin.updateUserById(existingAuthUser.id, {
      email_confirm: true,
      password: input.password,
      user_metadata: {
        ...existingAuthUser.user_metadata,
        username: input.username,
      },
    });
    if (error) throw error;
    authUserId = data.user.id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: input.email,
      email_confirm: true,
      password: input.password,
      user_metadata: { username: input.username },
    });
    if (error) throw error;
    authUserId = data.user.id;
    createdAuthUser = true;
  }

  if (!authUserId) throw new Error("Supabase did not return a user id.");

  try {
    const now = new Date();
    await db
      .insert(users)
      .values({
        id: authUserId,
        displayName: input.username,
        username: input.username,
        profileOnboardedAt: now,
        firstDrillGuideCompletedAt: null,
        firstDrillGuideSkippedAt: now,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          displayName: input.username,
          username: input.username,
          profileOnboardedAt: now,
          firstDrillGuideCompletedAt: null,
          firstDrillGuideSkippedAt: now,
          updatedAt: now,
        },
      });
  } catch (error) {
    if (createdAuthUser) {
      await supabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
    }
    throw error;
  }

  console.log(
    `${existingAuthUser ? "Updated" : "Created"} staging test account ${input.email} as @${input.username}.`,
  );
  console.log("The password was accepted but was not printed.");

  async function findAuthUserByEmail(email: string) {
    for (let page = 1; page <= 100; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) throw error;
      const match = data.users.find((user) => user.email?.toLowerCase() === email);
      if (match || data.users.length < 1000) return match ?? null;
    }
    return null;
  }
}

function parseArguments(
  args: string[],
  environment: Record<string, string | undefined>,
): { email: string; password: string; username: string } {
  const email = emailSchema.parse(getArgument(args, "--email"));
  const username = profileUsernameSchema.parse(getArgument(args, "--username"));
  const password = environment.TEST_USER_PASSWORD;

  if (!password || password.length < 8) {
    throw new Error(
      "Set TEST_USER_PASSWORD to a staging-only password with at least 8 characters.",
    );
  }

  return { email, password, username };
}

function getArgument(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await postgresClient.end();
  });
