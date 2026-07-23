import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// Supabase Auth owns identity; this matching-ID row owns the profile data the
// product needs to render and relate to domain records.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayName: text("display_name").notNull(),
    username: varchar("username", { length: 30 }),
    firstName: varchar("first_name", { length: 80 }),
    lastName: varchar("last_name", { length: 80 }),
    location: varchar("location", { length: 120 }),
    avatarUrl: text("avatar_url"),
    profileOnboardedAt: timestamp("profile_onboarded_at", { withTimezone: true }),
    firstDrillGuideCompletedAt: timestamp("first_drill_guide_completed_at", { withTimezone: true }),
    firstDrillGuideSkippedAt: timestamp("first_drill_guide_skipped_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    displayNameIdx: index("users_display_name_idx").on(table.displayName),
    usernameUnique: uniqueIndex("users_username_unique").on(table.username),
    firstDrillGuideStateCheck: check(
      "users_first_drill_guide_state_check",
      sql`${table.firstDrillGuideCompletedAt} is null or ${table.firstDrillGuideSkippedAt} is null`,
    ),
  }),
);

// Recovery grants are short-lived server-only capabilities. The database stores
// only keyed hashes/fingerprints; the signed browser grant carries the random
// jti. State and attempt counters bridge the non-atomic boundary between
// Postgres and Supabase Auth without allowing a retry to choose a new password.
export const authRecoveryGrants = pgTable(
  "auth_recovery_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    jtiHash: varchar("jti_hash", { length: 64 }).notNull(),
    sessionHash: varchar("session_hash", { length: 64 }).notNull(),
    state: varchar("state", { length: 16 }).notNull().default("issued"),
    passwordFingerprint: varchar("password_fingerprint", { length: 64 }),
    activeAttempts: integer("active_attempts").notNull().default(0),
    outcomeUncertain: boolean("outcome_uncertain").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    pendingAt: timestamp("pending_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    jtiHashUnique: uniqueIndex("auth_recovery_grants_jti_hash_unique").on(table.jtiHash),
    userIdx: index("auth_recovery_grants_user_id_idx").on(table.userId),
    expiresIdx: index("auth_recovery_grants_expires_at_idx").on(table.expiresAt),
    stateCheck: check(
      "auth_recovery_grants_state_check",
      sql`${table.state} in ('issued', 'pending', 'consumed', 'failed')`,
    ),
    attemptsCheck: check(
      "auth_recovery_grants_active_attempts_check",
      sql`${table.activeAttempts} >= 0`,
    ),
    lifecycleCheck: check(
      "auth_recovery_grants_lifecycle_check",
      sql`(
        (${table.state} = 'issued'
          and ${table.passwordFingerprint} is null
          and ${table.activeAttempts} = 0
          and ${table.outcomeUncertain} = false
          and ${table.pendingAt} is null
          and ${table.consumedAt} is null
          and ${table.failedAt} is null)
        or
        (${table.state} = 'failed'
          and ${table.passwordFingerprint} is null
          and ${table.activeAttempts} = 0
          and ${table.outcomeUncertain} = false
          and ${table.pendingAt} is null
          and ${table.consumedAt} is null
          and ${table.failedAt} is not null)
        or
        (${table.state} = 'pending'
          and ${table.passwordFingerprint} is not null
          and (${table.activeAttempts} > 0 or ${table.outcomeUncertain} = true)
          and ${table.pendingAt} is not null
          and ${table.consumedAt} is null
          and ${table.failedAt} is null)
        or
        (${table.state} = 'consumed'
          and ${table.passwordFingerprint} is not null
          and ${table.activeAttempts} = 0
          and ${table.outcomeUncertain} = false
          and ${table.pendingAt} is not null
          and ${table.consumedAt} is not null
          and ${table.failedAt} is null)
      )`,
    ),
  }),
);

// Training Methods are the graph anchors: Pad Work, Bag Work, Partner Drill,
// Clinch, and Technical Work. They describe where/how a drill is practiced.
export const trainingMethods = pgTable(
  "training_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 96 }).notNull(),
    iconKey: varchar("icon_key", { length: 96 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => ({
    slugUnique: uniqueIndex("training_methods_slug_unique").on(table.slug),
  }),
);

// Tag categories are browse groups only. They are not stored on drills because
// categories such as Boxing and Kicking overlap with more precise leaf tags.
export const tagCategories = pgTable(
  "tag_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 96 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => ({
    slugUnique: uniqueIndex("tag_categories_slug_unique").on(table.slug),
  }),
);

// Tags hold both standard taxonomy tags and user-created custom tags. Custom
// tags are scoped to a user; standard tags have no user_id.
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => tagCategories.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 96 }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull().default("standard"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => ({
    categoryIdx: index("tags_category_id_idx").on(table.categoryId),
    userIdx: index("tags_user_id_idx").on(table.userId),
    systemSlugUnique: uniqueIndex("tags_system_slug_unique")
      .on(table.slug)
      .where(sql`${table.userId} is null`),
    userSlugUnique: uniqueIndex("tags_user_slug_unique")
      .on(table.userId, table.slug)
      .where(sql`${table.userId} is not null`),
  }),
);

// Saved Lists are separate from normal tags because Favourite and Drill Back In
// drive persistent collection views rather than technique taxonomy.
export const statusTags = pgTable(
  "status_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 96 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => ({
    slugUnique: uniqueIndex("status_tags_slug_unique").on(table.slug),
  }),
);

// Drills are the saved Muay Thai memory objects. Relationships below attach
// methods, tags, status markers, and ordered steps without hardcoded columns.
export const drills = pgTable(
  "drills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    notes: text("notes"),
    sourceTranscript: text("source_transcript"),
    creationKey: varchar("creation_key", { length: 36 }),
    creationPayloadHash: varchar("creation_payload_hash", { length: 64 }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    userIdx: index("drills_user_id_idx").on(table.userId),
    titleIdx: index("drills_title_idx").on(table.title),
    archivedIdx: index("drills_archived_at_idx").on(table.archivedAt),
    userCreationKeyUnique: uniqueIndex("drills_user_creation_key_unique").on(
      table.userId,
      table.creationKey,
    ),
    creationIdempotencyCheck: check(
      "drills_creation_idempotency_check",
      sql`(${table.creationKey} is null and ${table.creationPayloadHash} is null) or (${table.creationKey} is not null and ${table.creationPayloadHash} is not null)`,
    ),
  }),
);

export const drillSteps = pgTable(
  "drill_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drillId: uuid("drill_id").notNull().references(() => drills.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    body: text("body").notNull(),
    ...timestamps,
  },
  (table) => ({
    drillPositionUnique: uniqueIndex("drill_steps_drill_position_unique").on(table.drillId, table.position),
    drillIdx: index("drill_steps_drill_id_idx").on(table.drillId),
  }),
);

export const drillTrainingMethods = pgTable(
  "drill_training_methods",
  {
    drillId: uuid("drill_id").notNull().references(() => drills.id, { onDelete: "cascade" }),
    trainingMethodId: uuid("training_method_id").notNull().references(() => trainingMethods.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.drillId, table.trainingMethodId] }),
    methodIdx: index("drill_training_methods_method_id_idx").on(table.trainingMethodId),
  }),
);

export const drillTags = pgTable(
  "drill_tags",
  {
    drillId: uuid("drill_id").notNull().references(() => drills.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.drillId, table.tagId] }),
    tagIdx: index("drill_tags_tag_id_idx").on(table.tagId),
  }),
);

export const drillStatusTags = pgTable(
  "drill_status_tags",
  {
    drillId: uuid("drill_id").notNull().references(() => drills.id, { onDelete: "cascade" }),
    statusTagId: uuid("status_tag_id").notNull().references(() => statusTags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.drillId, table.statusTagId] }),
    statusIdx: index("drill_status_tags_status_tag_id_idx").on(table.statusTagId),
  }),
);

// Journal entries are private training records. Uploads begin in a staging
// state and become visible only after their Storage object is confirmed.
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    drillId: uuid("drill_id").references(() => drills.id, { onDelete: "set null" }),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    caption: text("caption"),
    status: varchar("status", { length: 32 }).notNull().default("uploading"),
    ...timestamps,
  },
  (table) => ({
    userOccurredIdx: index("journal_entries_user_occurred_idx").on(table.userId, table.occurredOn),
    userStatusIdx: index("journal_entries_user_status_idx").on(table.userId, table.status),
    drillIdx: index("journal_entries_drill_id_idx").on(table.drillId),
  }),
);

// Media is separate from journal metadata so future media processing or
// additional media kinds do not force journal-entry columns to proliferate.
// v1 enforces one video per entry through the unique journal_entry_id index.
export const journalMedia = pgTable(
  "journal_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    journalEntryId: uuid("journal_entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    mediaKind: varchar("media_kind", { length: 32 }).notNull().default("video"),
    mimeType: varchar("mime_type", { length: 96 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    durationMs: integer("duration_ms"),
    posterPath: text("poster_path"),
    ...timestamps,
  },
  (table) => ({
    entryUnique: uniqueIndex("journal_media_entry_unique").on(table.journalEntryId),
    storagePathUnique: uniqueIndex("journal_media_storage_path_unique").on(table.storagePath),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AuthRecoveryGrant = typeof authRecoveryGrants.$inferSelect;
export type NewAuthRecoveryGrant = typeof authRecoveryGrants.$inferInsert;
export type Drill = typeof drills.$inferSelect;
export type NewDrill = typeof drills.$inferInsert;
export type TrainingMethod = typeof trainingMethods.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type StatusTag = typeof statusTags.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;
export type JournalMedia = typeof journalMedia.$inferSelect;
export type NewJournalMedia = typeof journalMedia.$inferInsert;
