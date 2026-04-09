-- Run once in Supabase SQL Editor if `changelog` has no row for 1.81.
-- If you already inserted 1.81, skip or run: DELETE FROM changelog WHERE version = '1.81';

INSERT INTO changelog (version, title_en, title_fr, body_en, body_fr, created_at) VALUES
  (
    '1.81',
    'v1.81: Member vs owner roles for admin screens',
    'v1.81 : rôles member et owner pour les écrans admin',
    'user_type in Supabase user_metadata: member (default at sign-up) or owner. Only owner can open Topics and Feed management; members stay on the same public areas as guests. Admin APIs use requireOwnerSession(): 401 if not signed in, 403 if member. Promote to owner in Supabase Dashboard → Authentication → Users → User metadata (user_type = owner); user must sign in again to refresh the JWT. src/lib/user-type.ts.',
    'user_type dans les métadonnées utilisateur Supabase : member (défaut à l''inscription) ou owner. Seul owner accède à Topics et à la gestion des flux ; les members gardent les mêmes zones publiques que les invités. Les API admin utilisent requireOwnerSession() : 401 si non connecté, 403 si member. Passer en owner dans le dashboard Supabase → Authentication → Users → métadonnées (user_type = owner) ; nouvelle connexion pour rafraîchir le JWT. Fichier src/lib/user-type.ts.',
    '2026-04-16T12:00:00Z'
  );
