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
}: {
  lang: Lang;
  canManage?: boolean;
  startInCreate?: boolean;
  onExit?: () => void;
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
  const [autoFeeds, setAutoFeeds] = useState(true);
  const [discoveringFeeds, setDiscoveringFeeds] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<{
    added: { name: string; url: string }[];
    rejected: { name: string; url: string; reason: string }[];
  } | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);

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

  async function handleCreate() {
    setSaving(true);
    setError(null);
    setCreateNotice(null);
    const wantFeeds = autoFeeds && !!formDomain.trim();
    try {
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
      const createdId = created.id;
      const showPendingApproval =
        typeof created.is_active === "boolean" ? !created.is_active : true;
      const pendingMessage = t("topicPendingValidation", lang);
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
      setAutoFeeds(true);
      setSaving(false);

      if (showPendingApproval) {
        setCreateNotice(pendingMessage);
        setTimeout(() => setCreateNotice(null), 5000);
      }

      if (wantFeeds && canManage) {
        setDiscoveringFeeds(true);
        setDiscoverResult(null);
        try {
          const dr = await fetch(`/api/topics/${createdId}/discover-feeds`, { method: "POST" });
          if (dr.ok) {
            const data = await dr.json();
            setDiscoverResult(data);
          }
          await loadDetail(createdId);
        } catch {
          /* optional */
        } finally {
          setDiscoveringFeeds(false);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setSaving(false);
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
        autoFeeds={autoFeeds}
        setAutoFeeds={setAutoFeeds}
        categories={categories}
        formCategoryId={formCategoryId}
        setFormCategoryId={setFormCategoryId}
        createNotice={createNotice}
        saving={saving}
        onGenerateScoring={handleGenerateScoring}
        onGenerateLabels={handleGenerateLabels}
        onCreate={handleCreate}
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
      loading={loading}
      error={error}
      onNewTopic={() => setView("create")}
      onLoadDetail={loadDetail}
      onReorder={handleReorder}
      onToggleDisplay={handleToggleDisplay}
    />
  );
}
