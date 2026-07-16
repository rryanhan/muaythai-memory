import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import editStyles from "@/features/profile/ProfileEdit.module.css";
import routeStyles from "@/features/profile/ProfileRouteShell.module.css";

export default function EditProfileLoading() {
  return (
    <main className={`${routeStyles.page} ${editStyles.page}`} aria-label="Loading profile editor">
      <div className="notebook-grid" aria-hidden="true" />
      <header className={routeStyles.header}>
        <span className={routeStyles.back} aria-hidden="true">←</span>
        <p className="eyebrow">Edit Profile</p>
      </header>
      <section className={routeStyles.heading}>
        <h1>Edit Profile</h1>
        <p>Loading profile</p>
      </section>
      <div className={editStyles.loading} aria-hidden="true">
        <span className={editStyles.loadingPhoto} />
        <span className={editStyles.loadingField} />
        <span className={editStyles.loadingField} />
        <span className={editStyles.loadingButton} />
      </div>
      <RoutedBottomNav activeView="profile" />
    </main>
  );
}
