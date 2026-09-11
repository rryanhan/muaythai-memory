import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  drillStatusTags,
  drills,
  drillTrainingMethods,
  statusTags,
  trainingMethods,
} from "@/db/schema";
import type { ProfileOverview } from "./contracts";

type ProfileOverviewRow = {
  drillCount: number;
  favouriteCount: number;
  drillBackInCount: number;
  methodId: string | null;
  methodName: string | null;
  methodSlug: string | null;
  methodIconKey: string | null;
  methodCount: number | null;
};

export async function getProfileOverview(userId: string): Promise<ProfileOverview> {
  const rows = await db.execute<ProfileOverviewRow>(sql`
    with drill_counts as (
      select
        count(distinct ${drills.id})::integer as "drillCount",
        count(distinct ${drills.id}) filter (
          where ${statusTags.active} = true
            and ${statusTags.slug} = 'starred'
        )::integer as "favouriteCount",
        count(distinct ${drills.id}) filter (
          where ${statusTags.active} = true
            and ${statusTags.slug} = 'drill-back-in'
        )::integer as "drillBackInCount"
      from ${drills}
      left join ${drillStatusTags}
        on ${drillStatusTags.drillId} = ${drills.id}
      left join ${statusTags}
        on ${statusTags.id} = ${drillStatusTags.statusTagId}
      where ${drills.userId} = ${userId}
    ),
    method_counts as (
      select
        ${trainingMethods.id} as "methodId",
        ${trainingMethods.name} as "methodName",
        ${trainingMethods.slug} as "methodSlug",
        ${trainingMethods.iconKey} as "methodIconKey",
        ${trainingMethods.sortOrder} as "methodSortOrder",
        count(distinct ${drills.id})::integer as "methodCount"
      from ${drills}
      inner join ${drillTrainingMethods}
        on ${drillTrainingMethods.drillId} = ${drills.id}
      inner join ${trainingMethods}
        on ${trainingMethods.id} = ${drillTrainingMethods.trainingMethodId}
      where ${drills.userId} = ${userId}
        and ${trainingMethods.active} = true
      group by
        ${trainingMethods.id},
        ${trainingMethods.name},
        ${trainingMethods.slug},
        ${trainingMethods.iconKey},
        ${trainingMethods.sortOrder}
    )
    select
      drill_counts."drillCount",
      drill_counts."favouriteCount",
      drill_counts."drillBackInCount",
      method_counts."methodId",
      method_counts."methodName",
      method_counts."methodSlug",
      method_counts."methodIconKey",
      method_counts."methodCount"
    from drill_counts
    left join method_counts on true
    order by method_counts."methodSortOrder", method_counts."methodName"
  `);

  const firstRow = rows[0];
  if (!firstRow) throw new Error("Profile overview could not be loaded.");

  return {
    drillCount: firstRow.drillCount,
    favouriteCount: firstRow.favouriteCount,
    drillBackInCount: firstRow.drillBackInCount,
    trainingMethods: rows.flatMap((row) => {
      if (row.methodId === null) return [];
      if (
        row.methodName === null
        || row.methodSlug === null
        || row.methodIconKey === null
        || row.methodCount === null
      ) {
        throw new Error("Profile Training Method counts were incomplete.");
      }
      return [{
        id: row.methodId,
        name: row.methodName,
        slug: row.methodSlug,
        iconKey: row.methodIconKey,
        count: row.methodCount,
      }];
    }),
  };
}
