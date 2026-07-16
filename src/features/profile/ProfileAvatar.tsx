import type { CurrentAppUser } from "@/modules/auth";

type ProfileAvatarProps = {
  profile: Pick<CurrentAppUser, "displayName" | "avatarUrl">;
  className?: string;
  imageClassName?: string;
};

export function ProfileAvatar({ profile, className, imageClassName }: ProfileAvatarProps) {
  return (
    <span className={className} aria-label={`${profile.displayName} profile photo`}>
      {profile.avatarUrl ? (
        <img className={imageClassName} src={profile.avatarUrl} alt="" />
      ) : (
        <span aria-hidden="true">{getInitials(profile.displayName)}</span>
      )}
    </span>
  );
}

export function getInitials(displayName: string): string {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "F";
}
