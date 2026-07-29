import type { CurrentAppUser } from "@/modules/auth";
import { DecodedImage } from "@/components/shared/DecodedImage";
import styles from "./ProfileAvatar.module.css";

type ProfileAvatarProps = {
  profile: Pick<CurrentAppUser, "displayName" | "avatarUrl">;
  className?: string;
  imageClassName?: string;
};

export function ProfileAvatar({ profile, className, imageClassName }: ProfileAvatarProps) {
  const rootClassName = [styles.root, className].filter(Boolean).join(" ");
  const avatarImageClassName = [styles.image, imageClassName].filter(Boolean).join(" ");

  return (
    <span className={rootClassName} aria-label={`${profile.displayName} profile photo`}>
      <span className={styles.fallback} aria-hidden="true">
        {getInitials(profile.displayName)}
      </span>
      {profile.avatarUrl && (
        <DecodedImage
          className={avatarImageClassName}
          src={profile.avatarUrl}
          alt=""
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
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
