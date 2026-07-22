import { initials } from "@/lib/format";
import type { Profile } from "@/lib/database.types";

export default function AuthorBadge({
  authorId,
  profiles,
}: {
  authorId: string | null;
  profiles: Profile[];
}) {
  const profile = profiles.find((p) => p.id === authorId);
  if (!profile) return null;
  return (
    <span className="author-badge">
      <span className="author-avatar">{initials(profile.full_name)}</span>
      {profile.full_name}
    </span>
  );
}
