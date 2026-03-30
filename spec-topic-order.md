# spec-topic-order.md — Réorganisation de l'ordre des topics

> Version: 1.0 — Mars 2026
> Status: SPEC (not implemented)

---

## 1. Objectif

Permettre à l'utilisateur de **modifier l'ordre d'affichage des topics** sur la page d'accueil, directement depuis la **page Topics** (liste des topics). L'ordre se reflète partout : homepage (boutons), stats (onglets), et crons (priorité).

---

## 2. État actuel

- Chaque topic a une colonne `sort_order` (integer) dans la table `topics`.
- L'API `PATCH /api/topics/[id]` accepte déjà `sortOrder` comme champ modifiable.
- La liste affichée est triée par `sort_order ASC, created_at ASC`.
- Il n'existe **aucune interface** pour modifier le `sort_order`. Il est assigné automatiquement à la création (max existant + 1).

---

## 3. Design UX

### 3.1 Vue liste des topics (TopicsPage, vue par défaut)

Ajout de **boutons flèches ↑ / ↓** dans chaque ligne du tableau, à gauche du numéro d'ordre, pour déplacer un topic d'une position vers le haut ou vers le bas.

```
┌──────────────────────────────────────────────────────────────┐
│  Topics                                      [+ New Topic]  │
├──────────────────────────────────────────────────────────────┤
│  ↕   #   Topic           Feeds   Status   Actions           │
│  ↓   1   Iran War          20   ● Actif   Edit              │
│  ↑↓  2   AI                20   ● Actif   Edit              │
│  ↑↓  3   AI Eng.           20   ● Actif   Edit              │
│  ↑↓  4   Robotics          19   ● Actif   Edit              │
│  ↑↓  5   Crypto            20   ● Actif   Edit              │
│  ↑↓  6   Bitcoin           20   ● Actif   Edit              │
│  ↑↓  7   Video Games       20   ● Actif   Edit              │
│  ↑↓  8   Elon Musk         20   ● Actif   Edit              │
│  ↑   9   Anthropic         20   ● Actif   Edit              │
└──────────────────────────────────────────────────────────────┘
```

**Règles visuelles** :
- Le **premier** topic n'a que le bouton ↓ (pas de ↑).
- Le **dernier** topic n'a que le bouton ↑ (pas de ↓).
- Les topics intermédiaires ont les deux boutons ↑ et ↓.
- Les boutons sont compacts (padding minimal, couleur `color.textMuted`, hover `color.gold`).

### 3.2 Comportement au clic

1. L'utilisateur clique sur ↑ (ou ↓) pour un topic.
2. Le topic échange sa position (`sort_order`) avec le topic immédiatement au-dessus (ou en-dessous).
3. Un appel API est envoyé pour persister les deux `sort_order` modifiés.
4. La liste se recharge et reflète le nouvel ordre.
5. L'opération est **instantanée côté UI** (optimistic update) : les deux lignes échangent leur position visuellement avant la réponse API.

---

## 4. Nouvelle API Route

### 4.1 `POST /api/topics/reorder`

**Rôle** : Échange l'ordre de deux topics.

**Body** :
```json
{
  "topicA": "ai",
  "topicB": "conflict"
}
```

L'API :
1. Lit le `sort_order` actuel de `topicA` et `topicB`.
2. Échange les deux valeurs.
3. Met à jour les deux lignes dans la table `topics`.
4. Retourne `200 OK`.

**Validation** :
- `topicA` et `topicB` doivent exister.
- `topicA !== topicB`.

**Réponse (200)** :
```json
{ "ok": true }
```

**Erreurs** :
| Code | Cas |
|------|-----|
| 400 | Paramètres manquants ou identiques |
| 404 | Topic introuvable |
| 500 | Erreur DB |

### 4.2 Implémentation backend

```typescript
// src/app/api/topics/reorder/route.ts
export async function POST(req: Request) {
  const { topicA, topicB } = await req.json();
  
  // Validation
  if (!topicA || !topicB || topicA === topicB) → 400
  
  // Lire les sort_order actuels
  const rowA = SELECT sort_order FROM topics WHERE id = topicA;
  const rowB = SELECT sort_order FROM topics WHERE id = topicB;
  if (!rowA || !rowB) → 404
  
  // Échanger
  UPDATE topics SET sort_order = rowB.sort_order WHERE id = topicA;
  UPDATE topics SET sort_order = rowA.sort_order WHERE id = topicB;
  
  return { ok: true };
}
```

---

## 5. Modifications Frontend

### 5.1 Nouvelles clés i18n

```typescript
moveUp: {
  en: "Move up",
  fr: "Monter",
},
moveDown: {
  en: "Move down",
  fr: "Descendre",
},
```

### 5.2 Fonction `handleReorder` dans TopicsPage

```typescript
async function handleReorder(idA: string, idB: string) {
  // Optimistic update : échanger localement
  const newTopics = [...topics];
  const iA = newTopics.findIndex(t => t.id === idA);
  const iB = newTopics.findIndex(t => t.id === idB);
  [newTopics[iA], newTopics[iB]] = [newTopics[iB], newTopics[iA]];
  setTopics(newTopics);

  // Appel API
  try {
    const res = await fetch("/api/topics/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicA: idA, topicB: idB }),
    });
    if (!res.ok) throw new Error();
  } catch {
    // Rollback en cas d'erreur
    loadTopics();
  }
}
```

### 5.3 Boutons ↑↓ dans le tableau

Dans chaque `<tr>` de la liste, ajouter une cellule avec les flèches :

```tsx
<td style={{ whiteSpace: "nowrap" }}>
  {i > 0 && (
    <button
      onClick={() => handleReorder(tp.id, topics[i - 1].id)}
      title={t("moveUp", lang)}
      style={arrowBtn}
    >
      ↑
    </button>
  )}
  {i < topics.length - 1 && (
    <button
      onClick={() => handleReorder(tp.id, topics[i + 1].id)}
      title={t("moveDown", lang)}
      style={arrowBtn}
    >
      ↓
    </button>
  )}
</td>
```

### 5.4 Style des boutons flèches

```typescript
const arrowBtn: CSSProperties = {
  background: "none",
  border: "none",
  color: color.textMuted,
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  padding: "2px 6px",
  borderRadius: 4,
  transition: "color 0.15s",
};
// hover → color: color.gold (via onMouseEnter/onMouseLeave ou CSS class)
```

---

## 6. Fichiers à créer

| Fichier | Description |
|---------|-------------|
| `src/app/api/topics/reorder/route.ts` | Endpoint d'échange de `sort_order` entre deux topics |

---

## 7. Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `src/app/page.tsx` | Ajouter `handleReorder`, boutons ↑↓ dans la liste, style `arrowBtn` |
| `src/lib/i18n.ts` | Ajouter clés `moveUp`, `moveDown` |

---

## 8. Contraintes et edge cases

| Cas | Comportement |
|-----|-------------|
| Premier topic → clic ↑ | Bouton ↑ absent (pas affiché) |
| Dernier topic → clic ↓ | Bouton ↓ absent (pas affiché) |
| Un seul topic dans la liste | Aucun bouton flèche affiché |
| Deux topics avec le même `sort_order` | L'échange fonctionne quand même (valeurs identiques échangées) |
| Erreur réseau pendant le reorder | Rollback : la liste revient à l'état précédent via `loadTopics()` |
| Clics rapides multiples | Chaque clic est un appel séparé. L'optimistic update garantit une UI réactive. En cas de conflit, le `loadTopics()` de rollback resynchronise. |
| Topics inactifs dans la liste | Les boutons ↑↓ fonctionnent aussi pour les topics inactifs (on peut réorganiser même un topic désactivé) |

---

## 9. Impact sur les autres pages

| Page | Effet |
|------|-------|
| **Homepage** | Les boutons de topics reflètent le nouvel ordre (chargés via `/api/topics` qui trie par `sort_order`) |
| **Stats** | Les onglets de topics reflètent le nouvel ordre |
| **Crons** | Pas d'impact direct (le round-robin utilise `last_fetched_at` / `last_scored_at`, pas `sort_order`) |

---

## 10. Plan d'implémentation

1. Créer `src/app/api/topics/reorder/route.ts`
2. Ajouter les 2 clés i18n (`moveUp`, `moveDown`)
3. Ajouter `handleReorder` dans TopicsPage
4. Ajouter les boutons ↑↓ dans le tableau de la liste
5. Tester avec 2+ topics, vérifier le reflet sur la homepage
