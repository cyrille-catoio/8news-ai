"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { TopicItem } from "@/lib/types";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useUserTopics(isAuthenticated: boolean) {
  // Committed state: applied to the feed and grid outside edit mode.
  // null  = no row in DB → onboarding needed
  // []    = row exists, no filter (onboarding done, user wants everything)
  // [...] = filtered topics
  const [preferredTopicIds, setPreferredTopicIds] = useState<string[] | null>(null);

  // Draft: live state during personalization mode editing.
  // Diverges from preferredTopicIds while in edit mode.
  const [draftTopicIds, setDraftTopicIds] = useState<string[] | null>(null);

  const [loadingPrefs, setLoadingPrefs] = useState(false);
  const [onboardingNeeded, setOnboardingNeeded] = useState(false);
  const [isPersonalizationMode, setIsPersonalizationMode] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch preferences on mount / when auth state changes
  useEffect(() => {
    if (!isAuthenticated) {
      setPreferredTopicIds(null);
      setDraftTopicIds(null);
      setOnboardingNeeded(false);
      setIsPersonalizationMode(false);
      return;
    }

    setLoadingPrefs(true);
    fetch("/api/user/topics", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((json: { topicIds: string[] | null }) => {
        setPreferredTopicIds(json.topicIds);
        setDraftTopicIds(json.topicIds);
        // null = no row → user has never set preferences → show onboarding
        setOnboardingNeeded(json.topicIds === null);
      })
      .catch(() => {
        setPreferredTopicIds(null);
        setDraftTopicIds(null);
        setOnboardingNeeded(false);
      })
      .finally(() => setLoadingPrefs(false));
  }, [isAuthenticated]);

  // Debounced save to server (saves draft, does not commit to feed)
  const savePreferences = useCallback((ids: string[]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaveStatus("saving");
    saveTimeoutRef.current = setTimeout(() => {
      fetch("/api/user/topics", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicIds: ids }),
      })
        .then((r) => {
          if (!r.ok) throw new Error();
        })
        .then(() => {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        })
        .catch(() => {
          setSaveStatus("error");
          setTimeout(() => setSaveStatus("idle"), 3000);
        });
    }, 300);
  }, []);

  // Toggle a single topic in/out of the DRAFT (live during edit mode).
  // Saves to DB immediately but does NOT update preferredTopicIds → no feed refresh.
  const toggleTopicPreference = useCallback(
    (topicId: string, allTopics: TopicItem[]) => {
      setDraftTopicIds((prev) => {
        // If no draft yet, start from all topics selected
        const current = prev ?? allTopics.map((t) => t.id);
        const next = current.includes(topicId)
          ? current.filter((id) => id !== topicId)
          : [...current, topicId];
        savePreferences(next);
        return next;
      });
    },
    [savePreferences],
  );

  // Enter edit mode: snapshot committed → draft so toggles start from current state
  const enterPersonalizationMode = useCallback(() => {
    setIsPersonalizationMode(true);
  }, []);

  // Exit edit mode: commit the draft to preferredTopicIds → triggers feed refresh once
  const exitPersonalizationMode = useCallback(() => {
    setIsPersonalizationMode(false);
    setDraftTopicIds((draft) => {
      setPreferredTopicIds(draft);
      return draft;
    });
  }, []);

  // Complete onboarding: save selected topics and dismiss the onboarding modal.
  // topicIds may be empty [] (user wants everything) or a subset.
  const completeOnboarding = useCallback((topicIds: string[]) => {
    setPreferredTopicIds(topicIds);
    setDraftTopicIds(topicIds);
    setOnboardingNeeded(false);
    // Save to DB immediately (no debounce — user explicitly confirmed)
    fetch("/api/user/topics", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicIds }),
    }).catch(() => {/* silent — user can re-set later */});
  }, []);

  return {
    preferredTopicIds,
    draftTopicIds,
    loadingPrefs,
    onboardingNeeded,
    isPersonalizationMode,
    saveStatus,
    enterPersonalizationMode,
    exitPersonalizationMode,
    toggleTopicPreference,
    completeOnboarding,
  };
}
