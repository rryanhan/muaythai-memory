export type FriendPair = {
  userOneId: string;
  userTwoId: string;
};

export function canonicalFriendPair(firstUserId: string, secondUserId: string): FriendPair {
  if (firstUserId === secondUserId) {
    throw new Error("A friendship requires two different users.");
  }

  return firstUserId < secondUserId
    ? { userOneId: firstUserId, userTwoId: secondUserId }
    : { userOneId: secondUserId, userTwoId: firstUserId };
}

export function otherFriendId(
  pair: FriendPair,
  currentUserId: string,
): string | null {
  if (pair.userOneId === currentUserId) return pair.userTwoId;
  if (pair.userTwoId === currentUserId) return pair.userOneId;
  return null;
}
