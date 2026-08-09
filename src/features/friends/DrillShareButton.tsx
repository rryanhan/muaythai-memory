"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { Check } from "@phosphor-icons/react/Check";
import { ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getDrillShareFriendPage,
  updateDrillShare,
  type DrillShareFriendPage,
} from "@/data/sharing";
import { useDrawerFocus } from "@/features/media/use-drawer-focus";
import { ProfileAvatar } from "@/features/profile/ProfileAvatar";
import styles from "./DrillShare.module.css";

export function DrillShareButton({ drillId }: { drillId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const contentRef = useDrawerFocus(open);
  const queryKey = ["drill-shares", drillId];
  const recipientsQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) => getDrillShareFriendPage(
      drillId,
      pageParam,
      { requestInit: { signal } },
    ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: open,
    staleTime: 30 * 1000,
  });
  const mutation = useMutation({
    mutationFn: ({
      recipientUserId,
      shared,
    }: {
      recipientUserId: string;
      shared: boolean;
    }) => updateDrillShare(drillId, { recipientUserId, shared }),
    onMutate: async ({ recipientUserId, shared }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<InfiniteData<DrillShareFriendPage>>(queryKey);
      queryClient.setQueryData<InfiniteData<DrillShareFriendPage>>(queryKey, (current) => (
        current
          ? {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                items: page.items.map((item) => (
                  item.profile.id === recipientUserId ? { ...item, shared } : item
                )),
              })),
            }
          : current
      ));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["shared-drills"] });
    },
  });
  const recipients = recipientsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <button
        className={styles.trigger}
        type="button"
        aria-label="Share drill with connections"
        title="Share drill"
        onClick={() => setOpen(true)}
      >
        <ShareNetwork size={19} weight="bold" aria-hidden="true" />
      </button>
      <Drawer.Root
        open={open}
        onOpenChange={(nextOpen) => !nextOpen && !mutation.isPending && setOpen(false)}
        direction="bottom"
        modal
        dismissible={!mutation.isPending}
        autoFocus={false}
      >
        <Drawer.Portal>
          <Drawer.Overlay className={styles.backdrop} />
          <Drawer.Content
            ref={contentRef}
            className={styles.sheet}
            aria-label="Share drill"
          >
            <Drawer.Handle className="sheet-handle" />
            <div className={styles.heading}>
              <div>
                <Drawer.Title asChild><h2>Share Drill</h2></Drawer.Title>
                <Drawer.Description asChild>
                  <p>Choose fighters you follow each other with.</p>
                </Drawer.Description>
              </div>
              <button
                type="button"
                data-drawer-initial-focus
                disabled={mutation.isPending}
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </div>

            <div className={styles.list}>
              {recipientsQuery.isPending ? (
                <p className={styles.state} role="status">Loading connections…</p>
              ) : recipientsQuery.isError ? (
                <button className={styles.retry} type="button" onClick={() => void recipientsQuery.refetch()}>
                  Connections couldn’t be loaded. Retry
                </button>
              ) : recipients.length === 0 ? (
                <p className={styles.state}>Follow each other before sharing a drill.</p>
              ) : recipients.map((item) => {
                const pendingThisRecipient = mutation.isPending
                  && mutation.variables.recipientUserId === item.profile.id;
                return (
                  <button
                    key={item.profile.id}
                    className={styles.friend}
                    type="button"
                    aria-label={item.shared
                      ? `Stop sharing drill with @${item.profile.username}`
                      : `Share drill with @${item.profile.username}`}
                    aria-pressed={item.shared}
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({
                      recipientUserId: item.profile.id,
                      shared: !item.shared,
                    })}
                  >
                    <ProfileAvatar
                      profile={{
                        displayName: item.profile.username,
                        avatarUrl: item.profile.avatarUrl,
                      }}
                      className={styles.avatar}
                      imageClassName={styles.avatarImage}
                    />
                    <strong>@{item.profile.username}</strong>
                    <span data-shared={item.shared} data-pending={pendingThisRecipient}>
                      {item.shared && <Check size={17} weight="bold" aria-hidden="true" />}
                    </span>
                  </button>
                );
              })}
              {recipientsQuery.hasNextPage && (
                <button
                  className={styles.loadMore}
                  type="button"
                  disabled={recipientsQuery.isFetchingNextPage || mutation.isPending}
                  onClick={() => void recipientsQuery.fetchNextPage()}
                >
                  {recipientsQuery.isFetchingNextPage ? "Loading…" : "Load More"}
                </button>
              )}
            </div>
            {mutation.isError && (
              <p className={styles.error} role="alert">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : "Sharing could not be updated."}
              </p>
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
