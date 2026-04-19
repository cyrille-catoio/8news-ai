"use client";

import { useState, useEffect } from "react";
import type { TopicItem, TopicDetail, CategoryItem } from "@/lib/types";
import { t, type Lang } from "@/lib/i18n";
import { TopicsPageListView } from "./TopicsPageListView";
import { TopicsPageCreateView } from "./TopicsPageCreateView";
import { TopicsPageDetailView } from "./TopicsPageDetailView";

export function TopicsPage({
  lang,
  canManage = true,
  startInCreate = false,
  onExit,
  onMemberCreatedTopic,
}: {
  lang: Lang;
  canManage?: boolean;
  startInCreate?: boolean;
  onExit?: () => void;
  onMemberCreatedTopic?: (message: string) => void;
}) {
  const [view, setView] = useState<"list" | "detail" | "create">(startInCreate ? "create" : "list");
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [topicDetail, setTopicDetail] = useState<TopicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [formCategoryId, setFormCategoryId] = useState<number>(1);

  const [formId, setFormId] = useState("");
  const [formLabelEn, setFormLabelEn] = useState("");
  const [formLabelFr, setFormLabelFr] = useState("");
  const [formDomain, setFormDomain] = useState("");
  const [formT1, setFormT1] = useState("");
  const [formT2, setFormT2] = useState("");
  const [formT3, setFormT3] = useState("");
  const [formT4, setFormT4] = useState("");
  const [formT5, setFormT5] = useState("");

  const [feedName, setFeedName] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [addingFeed, setAddingFeed] = useState(false);

  const [editCategoryId, setEditCategoryId] = useState<number>(1);
  const [editingTopic, setEditingTopic] = useState(false);
  const [editLabelEn, setEditLabelEn] = useState("");
  const [editLabelFr, setEditLabelFr] = useState("");
  const [editDomain, setEditDomain] = useState("");
  const [editT1, setEditT1] = useState("");
  const [editT2, setEditT2] = useState("");
  const [editT3, setEditT3] = useState("");
  const [editT4, setEditT4] = useState("");
  const [editT5, setEditT5] = useState("");

  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptLang, setPromptLang] = useState<"en" | "fr">("en");
  const [editPromptEn, setEditPromptEn] = useState("");
  const [editPromptFr, setEditPromptFr] = useState("");

  const [formPromptEn, setFormPromptEn] = useState("");
  const [formPromptFr, setFormPromptFr] = useState("");
  const [formPromptLang, setFormPromptLang] = useState<"en" | "fr">("en");
  const [generatingScoring, setGeneratingScoring] = useState(false);
  const [generatingLabels, setGeneratingLabels] = useState(false);
  const [discoveringFeeds, setDiscoveringFeeds] = useState(false);
  const [draftTopicId, setDraftTopicId] = useState<string | null>(null);
  const [createFeedName, setCreateFeedName] = useState("");
  const [createFeedUrl, setCreateFeedUrl] = useState("");
  const [addingCreateFeed, setAddingCreateFeed] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<{
    added: { name: string; url: string }[];
    rejected: { name: string; url: string; reason: string }[];
  } | null>(null);
  const [listNotice, setListNotice] = useState<string | null>(null);
  const [savingCategoryTopicId, setSavingCategoryTopicId] = useState<string | null>(null);

  function clearCreateForm() {
    setFormId("");
    setFormLabelEn("");
    setFormLabelFr("");
    setFormDomain("");
    setFormT1("");
    setFormT2("");
    setFormT3("");
    setFormT4("");
    setFormT5("");
    setFormPromptEn("");
    setFormPromptFr("");
    setFormCategoryId(1);
    setCreateFeedName("");
    setCreateFeedUrl("");
    setDiscoverResult(null);
    setDraftTopicId(null);
  }

  function validateCreateTopicForm(): string | null {
    if (!formId.trim() || !formLabelEn.trim() || !formLabelFr.trim() || !formDomain.trim()) {
      return t("topicFieldsRequiredForDraft", lang);
    }
    if (!formT1.trim() || !formT2.trim() || !formT3.trim() || !formT4.trim() || !formT5.trim()) {
      return t("topicScoringRequiredForDraft", lang);
    }
    return null;
  }

  async function createTopicRecord(): Promise<{ id: string; isActive: boolean } | null> {
    const res = await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: formId,
        labelEn: formLabelEn,
        labelFr: formLabelFr,
        scoringDomain: formDomain,
        scoringTier1: formT1,
        scoringTier2: formT2,
        scoringTier3: formT3,
        scoringTier4: formT4,
        scoringTier5: formT5,
        promptEn: formPromptEn || undefined,
        promptFr: formPromptFr || undefined,
        categoryId: formCategoryId,
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error((e as { error?: string }).error || "Failed");
    }
    const created = await res.json();
    return {
      id: String(created.id),
      isActive: typeof created.is_active === "boolean" ? created.is_active : false,
    };
  }

  async function ensureDraftTopic(): Promise<string | null> {
    if (draftTopicId) return draftTopicId;
    const validationError = validateCreateTopicForm();
    if (validationError) {
      setError(validationError);
      return null;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await createTopicRecord();
      if (!created) return null;
      setDraftTopicId(created.id);
      return created.id;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function loadTopics() {
    setLoading(true);
    try {
      const res = await fetch("/api/topics?all=1", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      setTopics(await res.json());
      setError(null);
    } catch {
      setError("Failed to load topics");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/topics/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const d: TopicDetail = await res.json();
      setTopicDetail(d);
      setEditLabelEn(d.labelEn);
      setEditLabelFr(d.labelFr);
      setEditDomain(d.scoringDomain);
      setEditT1(d.scoringTier1);
      setEditT2(d.scoringTier2);
      setEditT3(d.scoringTier3);
      setEditT4(d.scoringTier4);
      setEditT5(d.scoringTier5);
      setEditPromptEn(d.promptEn);
      setEditPromptFr(d.promptFr);
      setEditCategoryId(d.categoryId ?? 1);
      setEditingTopic(false);
      setEditingPrompt(false);
      setView("detail");
      setError(null);
    } catch {
      setError("Failed to load topic");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(): Promise<string | null> {
    const topicId = await ensureDraftTopic();
    if (!topicId) return null;
    clearCreateForm();
    if (canManage) {
      setView("list");
      await loadTopics();
      setListNotice(t("topicPendingValidationList", lang));
      setTimeout(() => setListNotice(null), 5000);
    } else {
      onMemberCreatedTopic?.(t("topicPendingValidationList", lang));
      onExit?.();
    }
    return topicId;
  }

  async function handleCreateDiscoverFeeds() {
    const createdId = await ensureDraftTopic();
    if (!createdId) return;
    setDiscoveringFeeds(true);
    setDiscoverResult(null);
    setError(null);
    try {
      const dr = await fetch(`/api/topics/${createdId}/discover-feeds`, { method: "POST" });
      if (dr.ok) {
        setDiscoverResult(await dr.json());
      } else {
        const e = await dr.json().catch(() => ({}));
        setError((e as { error?: string }).error || t("discoverFeedsFailed", lang));
      }
    } catch {
      setError(t("discoverFeedsFailed", lang));
    } finally {
      setDiscoveringFeeds(false);
    }
  }

  async function handleAddCreateFeed() {
    const createdId = await ensureDraftTopic();
    if (!createdId || !createFeedName.trim() || !createFeedUrl.trim()) return;
    setAddingCreateFeed(true);
    setError(null);
    try {
      const res = await fetch(`/api/topics/${createdId}/feeds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createFeedName.trim(), url: createFeedUrl.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error || "Failed");
      }
      setCreateFeedName("");
      setCreateFeedUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("manualFeedAddFailed", lang));
    } finally {
      setAddingCreateFeed(false);
    }
  }

  async function handleDeleteTopic(id: string) {
    if (!confirm(t("confirmDelete", lang))) return;
    try {
      await fetch(`/api/topics/${id}`, { method: "DELETE" });
      setView("list");
      await loadTopics();
    } catch {
      setError("Failed to delete");
    }
  }

  async function handleSaveTopic() {
    if (!topicDetail) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/topics/${topicDetail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labelEn: editLabelEn,
          labelFr: editLabelFr,
          scoringDomain: editDomain,
          scoringTier1: editT1,
          scoringTier2: editT2,
          scoringTier3: editT3,
          scoringTier4: editT4,
          scoringTier5: editT5,
          categoryId: editCategoryId,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      await loadDetail(topicDetail.id);
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePrompt() {
    if (!topicDetail) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/topics/${topicDetail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptEn: editPromptEn, promptFr: editPromptFr }),
      });
      if (!res.ok) throw new Error("Failed");
      await loadDetail(topicDetail.id);
    } catch {
      setError("Failed to save prompt");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!topicDetail) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/topics/${topicDetail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !topicDetail.isActive }),
      });
      if (!res.ok) throw new Error("Failed");
      await loadDetail(topicDetail.id);
    } catch {
      setError("Failed to toggle status");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateScoring() {
    if (!formDomain.trim()) return;
    setGeneratingScoring(true);
    setError(null);
    try {
      const res = await fetch("/api/topics/generate-scoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: formDomain.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error || "Failed");
      }
      const data = await res.json();
      setFormT1(data.tier1);
      setFormT2(data.tier2);
      setFormT3(data.tier3);
      setFormT4(data.tier4);
      setFormT5(data.tier5);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setGeneratingScoring(false);
    }
  }

  async function handleGenerateLabels() {
    if (!formLabelEn.trim()) return;
    setGeneratingLabels(true);
    setError(null);
    try {
      const res = await fetch("/api/topics/generate-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelEn: formLabelEn.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error || "Failed");
      }
      const data = await res.json();
      if (data.slug) setFormId(data.slug);
      if (data.labelFr) setFormLabelFr(data.labelFr);
      if (data.domain) setFormDomain(data.domain);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setGeneratingLabels(false);
    }
  }

  function handleGeneratePrompts() {
    const label = formLabelEn.trim() || "this topic";
    const domain = formDomain.trim() || label;
    const labelLower = label.toLowerCase();
    setFormPromptEn(`You are a news analyst specializing in ${domain}. Your task:

1. FILTER: From the article list below, identify ONLY articles about ${labelLower}. Exclude unrelated news.

2. SUMMARIZE EACH: For every relevant article, write a factual 2–3 sentence summary in English. Cover the key facts: who, what, where, when, and why. Include specific details: names, numbers, dates.

3. GLOBAL SUMMARY: Write up to 8 bullet points summarizing the latest developments based on the relevant articles. 8 is a maximum target — if fewer noteworthy points exist, only write those. Each bullet point must start with "• " and be on its own line. Include specific numbers and figures. Never write vague bullets.

IMPORTANT: Try to select approximately {{max}} relevant articles. If fewer are truly relevant, return only those. If more are relevant, pick the {{max}} most important and diverse ones.

Respond with valid JSON:
{
  "relevant": [{ "index": 0, "snippet": "Factual 2–3 sentence summary" }],
  "globalSummary": [
    { "text": "First bullet point with facts", "refs": [0, 3] },
    { "text": "Second bullet point with facts", "refs": [1] }
  ]
}

"index" values are 0-based positions in the article list. "refs" in globalSummary are the indices of articles that support each bullet point. Only include truly relevant articles.`);

    const labelFr = formLabelFr.trim() || labelLower;
    setFormPromptFr(`Tu es un analyste de presse spécialisé en ${domain}. Ta tâche :

1. FILTRER : Dans la liste d'articles ci-dessous, identifie UNIQUEMENT ceux qui concernent ${labelFr.toLowerCase()}. Exclus les news non liées.

2. RÉSUMER CHAQUE ARTICLE : Pour chaque article pertinent :
   - Traduis le titre en français (champ "title").
   - Rédige un résumé factuel de 2 à 3 phrases en français (champ "snippet"). Couvre les faits essentiels : qui, quoi, où, quand, pourquoi. Inclus des détails précis : noms, chiffres, dates.

3. RÉSUMÉ GLOBAL : Rédige jusqu'à 8 bullet points résumant les dernières actualités basé sur les articles pertinents. 8 est un objectif maximum — s'il y a moins de points importants, n'en écris que le nombre justifié. Chaque bullet point doit commencer par "• " et être sur sa propre ligne. Inclus les chiffres et données précises. Ne rédige jamais de bullet vague.

IMPORTANT : Essaie de sélectionner environ {{max}} articles pertinents. S'il y en a moins de {{max}} qui sont vraiment pertinents, retourne uniquement ceux-là. S'il y en a plus de {{max}}, choisis les {{max}} plus importants et variés.

Réponds en JSON valide :
{
  "relevant": [{ "index": 0, "title": "Titre traduit en français", "snippet": "Résumé factuel de 2-3 phrases" }],
  "globalSummary": [
    { "text": "Premier point avec des faits", "refs": [0, 3] },
    { "text": "Deuxième point avec des faits", "refs": [1] }
  ]
}

Les valeurs "index" correspondent aux positions (à partir de 0) dans la liste. "refs" dans globalSummary sont les indices des articles qui soutiennent chaque bullet point. N'inclus que les articles vraiment pertinents.`);
  }

  async function handleAddFeed() {
    if (!topicDetail || !feedName.trim() || !feedUrl.trim()) return;
    setAddingFeed(true);
    setError(null);
    try {
      const res = await fetch(`/api/topics/${topicDetail.id}/feeds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: feedName.trim(), url: feedUrl.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error || "Failed");
      }
      setFeedName("");
      setFeedUrl("");
      await loadDetail(topicDetail.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setAddingFeed(false);
    }
  }

  async function handleDiscoverFeeds() {
    if (!topicDetail) return;
    setDiscoveringFeeds(true);
    setDiscoverResult(null);
    setError(null);
    try {
      const dr = await fetch(`/api/topics/${topicDetail.id}/discover-feeds`, { method: "POST" });
      if (dr.ok) setDiscoverResult(await dr.json());
      else {
        const e = await dr.json().catch(() => ({}));
        setError((e as { error?: string }).error || "Failed");
      }
    } catch {
      setError("Failed to discover feeds");
    } finally {
      await loadDetail(topicDetail.id);
      setDiscoveringFeeds(false);
    }
  }

  async function handleDeleteFeed(feedId: number) {
    if (!topicDetail) return;
    try {
      await fetch(`/api/topics/${topicDetail.id}/feeds/${feedId}`, { method: "DELETE" });
      await loadDetail(topicDetail.id);
    } catch {
      setError("Failed to delete feed");
    }
  }

  async function handleToggleDisplay(id: string, value: boolean) {
    setTopics((prev) => prev.map((tp) => (tp.id === id ? { ...tp, isDisplayed: value } : tp)));
    try {
      const res = await fetch(`/api/topics/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDisplayed: value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      loadTopics();
    }
  }

  async function handleListCategoryChange(topicId: string, categoryId: number) {
    const topic = topics.find((tp) => tp.id === topicId);
    if (!topic || topic.categoryId === categoryId) return;
    const cat = categories.find((c) => c.id === categoryId);
    const label = cat ? (lang === "fr" ? cat.labelFr : cat.labelEn) : topic.categoryLabel;
    const snapshot = { ...topic };
    setSavingCategoryTopicId(topicId);
    setError(null);
    setTopics((prev) =>
      prev.map((tp) =>
        tp.id === topicId ? { ...tp, categoryId, categoryLabel: label ?? tp.categoryLabel } : tp,
      ),
    );
    try {
      const res = await fetch(`/api/topics/${topicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setError(t("topicCategorySaveError", lang));
      setTopics((prev) => prev.map((tp) => (tp.id === topicId ? snapshot : tp)));
    } finally {
      setSavingCategoryTopicId(null);
    }
  }

  async function handleReorder(idA: string, idB: string) {
    const newTopics = [...topics];
    const iA = newTopics.findIndex((tp) => tp.id === idA);
    const iB = newTopics.findIndex((tp) => tp.id === idB);
    if (iA === -1 || iB === -1) return;
    [newTopics[iA], newTopics[iB]] = [newTopics[iB], newTopics[iA]];
    setTopics(newTopics);
    try {
      const res = await fetch("/api/topics/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicA: idA, topicB: idB }),
      });
      if (!res.ok) throw new Error();
    } catch {
      loadTopics();
    }
  }

  useEffect(() => {
    fetch("/api/categories", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : [])
      .then((list: CategoryItem[]) => setCategories(list))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    loadTopics();
  }, [canManage]);

  if (view === "create") {
    return (
      <TopicsPageCreateView
        lang={lang}
        error={error}
        onBack={() => {
          if (canManage) setView("list");
          else onExit?.();
        }}
        backLabel={!canManage ? t("backToHomePage", lang) : undefined}
        formId={formId}
        setFormId={setFormId}
        formLabelEn={formLabelEn}
        setFormLabelEn={setFormLabelEn}
        formLabelFr={formLabelFr}
        setFormLabelFr={setFormLabelFr}
        formDomain={formDomain}
        setFormDomain={setFormDomain}
        formT1={formT1}
        setFormT1={setFormT1}
        formT2={formT2}
        setFormT2={setFormT2}
        formT3={formT3}
        setFormT3={setFormT3}
        formT4={formT4}
        setFormT4={setFormT4}
        formT5={formT5}
        setFormT5={setFormT5}
        formPromptEn={formPromptEn}
        setFormPromptEn={setFormPromptEn}
        formPromptFr={formPromptFr}
        setFormPromptFr={setFormPromptFr}
        formPromptLang={formPromptLang}
        setFormPromptLang={setFormPromptLang}
        generatingScoring={generatingScoring}
        generatingLabels={generatingLabels}
        categories={categories}
        formCategoryId={formCategoryId}
        setFormCategoryId={setFormCategoryId}
        saving={saving}
        discoveringFeeds={discoveringFeeds}
        addingCreateFeed={addingCreateFeed}
        draftTopicId={draftTopicId}
        createFeedName={createFeedName}
        setCreateFeedName={setCreateFeedName}
        createFeedUrl={createFeedUrl}
        setCreateFeedUrl={setCreateFeedUrl}
        discoverResult={discoverResult}
        onGenerateScoring={handleGenerateScoring}
        onGenerateLabels={handleGenerateLabels}
        onGeneratePrompts={handleGeneratePrompts}
        onCreate={handleCreate}
        onDiscoverFeeds={handleCreateDiscoverFeeds}
        onAddManualFeed={handleAddCreateFeed}
      />
    );
  }

  if (!canManage) return null;

  if (view === "detail" && topicDetail) {
    return (
      <TopicsPageDetailView
        lang={lang}
        d={topicDetail}
        error={error}
        onBack={() => {
          setView("list");
          loadTopics();
          setDiscoverResult(null);
        }}
        saving={saving}
        editingTopic={editingTopic}
        setEditingTopic={setEditingTopic}
        editLabelEn={editLabelEn}
        setEditLabelEn={setEditLabelEn}
        editLabelFr={editLabelFr}
        setEditLabelFr={setEditLabelFr}
        editDomain={editDomain}
        setEditDomain={setEditDomain}
        editT1={editT1}
        setEditT1={setEditT1}
        editT2={editT2}
        setEditT2={setEditT2}
        editT3={editT3}
        setEditT3={setEditT3}
        editT4={editT4}
        setEditT4={setEditT4}
        editT5={editT5}
        setEditT5={setEditT5}
        categories={categories}
        editCategoryId={editCategoryId}
        setEditCategoryId={setEditCategoryId}
        editingPrompt={editingPrompt}
        setEditingPrompt={setEditingPrompt}
        promptLang={promptLang}
        setPromptLang={setPromptLang}
        editPromptEn={editPromptEn}
        setEditPromptEn={setEditPromptEn}
        editPromptFr={editPromptFr}
        setEditPromptFr={setEditPromptFr}
        feedName={feedName}
        setFeedName={setFeedName}
        feedUrl={feedUrl}
        setFeedUrl={setFeedUrl}
        addingFeed={addingFeed}
        discoveringFeeds={discoveringFeeds}
        discoverResult={discoverResult}
        onToggleActive={handleToggleActive}
        onSaveTopic={handleSaveTopic}
        onDeleteTopic={handleDeleteTopic}
        onSavePrompt={handleSavePrompt}
        onAddFeed={handleAddFeed}
        onDiscoverFeeds={handleDiscoverFeeds}
        onDeleteFeed={handleDeleteFeed}
      />
    );
  }

  return (
    <TopicsPageListView
      lang={lang}
      topics={topics}
      categories={categories}
      loading={loading}
      error={error}
      notice={listNotice}
      savingCategoryTopicId={savingCategoryTopicId}
      onNewTopic={() => setView("create")}
      onLoadDetail={loadDetail}
      onReorder={handleReorder}
      onToggleDisplay={handleToggleDisplay}
      onCategoryChange={handleListCategoryChange}
    />
  );
}
