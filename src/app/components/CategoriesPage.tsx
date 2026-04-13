"use client";

import { useState, useEffect } from "react";
import type { CategoryItem } from "@/lib/types";
import { t, type Lang } from "@/lib/i18n";
import {
  color,
  sectionCard,
  formInputStyle,
  primaryButtonStyle,
  dangerButtonStyle,
  ghostOutlineBtn,
  spinnerStyle,
} from "@/lib/theme";

export function CategoriesPage({ lang }: { lang: Lang }) {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [newSlug, setNewSlug] = useState("");
  const [newLabelEn, setNewLabelEn] = useState("");
  const [newLabelFr, setNewLabelFr] = useState("");

  const [editId, setEditId] = useState<number | null>(null);
  const [editSlug, setEditSlug] = useState("");
  const [editLabelEn, setEditLabelEn] = useState("");
  const [editLabelFr, setEditLabelFr] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/categories", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setCategories(await res.json());
      setError(null);
    } catch {
      setError("Failed to load categories");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!newSlug.trim() || !newLabelEn.trim() || !newLabelFr.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: newSlug.trim(), labelEn: newLabelEn.trim(), labelFr: newLabelFr.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error || "Failed");
      }
      setNewSlug("");
      setNewLabelEn("");
      setNewLabelFr("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: number) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: editSlug, labelEn: editLabelEn, labelFr: editLabelFr }),
      });
      if (!res.ok) throw new Error("Failed");
      setEditId(null);
      await load();
    } catch {
      setError("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm(t("confirmDelete", lang))) return;
    try {
      await fetch(`/api/categories/${id}`, { method: "DELETE" });
      await load();
    } catch {
      setError("Failed to delete");
    }
  }

  function startEdit(c: CategoryItem) {
    setEditId(c.id);
    setEditSlug(c.slug);
    setEditLabelEn(c.labelEn);
    setEditLabelFr(c.labelFr);
  }

  const labelStyle = { color: color.textMuted, fontSize: 11, fontWeight: 600 as const, textTransform: "uppercase" as const, letterSpacing: "0.05em" };

  return (
    <div>
      <h2 style={{ color: color.gold, fontSize: 20, fontWeight: 600, marginBottom: 20, marginTop: 0 }}>
        {t("categoriesTitle", lang)}
      </h2>

      {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center" }}>
          <span style={spinnerStyle(24)} />
        </div>
      ) : (
        <div style={sectionCard}>
          <table className="tp-tb">
            <thead>
              <tr>
                <th>#</th>
                <th>{t("categoriesSlug", lang)}</th>
                <th>{t("labelEn", lang)}</th>
                <th>{t("labelFr", lang)}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c, i) => (
                <tr key={c.id}>
                  <td style={{ color: color.textDim, fontSize: 11 }}>{i + 1}</td>
                  {editId === c.id ? (
                    <>
                      <td><input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} style={{ ...formInputStyle, fontSize: 12 }} /></td>
                      <td><input value={editLabelEn} onChange={(e) => setEditLabelEn(e.target.value)} style={{ ...formInputStyle, fontSize: 12 }} /></td>
                      <td><input value={editLabelFr} onChange={(e) => setEditLabelFr(e.target.value)} style={{ ...formInputStyle, fontSize: 12 }} /></td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button type="button" onClick={() => handleUpdate(c.id)} disabled={saving} style={{ ...ghostOutlineBtn, fontSize: 11, padding: "3px 8px" }}>
                          {t("saveBtn", lang)}
                        </button>
                        <button type="button" onClick={() => setEditId(null)} style={{ ...ghostOutlineBtn, fontSize: 11, padding: "3px 8px", marginLeft: 4 }}>
                          {t("cancelBtn", lang)}
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ color: color.textMuted, fontSize: 12 }}>{c.slug}</td>
                      <td style={{ fontSize: 13 }}>{c.labelEn}</td>
                      <td style={{ fontSize: 13 }}>{c.labelFr}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button type="button" onClick={() => startEdit(c)} style={{ ...ghostOutlineBtn, fontSize: 11, padding: "3px 8px" }}>
                          {t("editBtn", lang)}
                        </button>
                        <button type="button" onClick={() => handleDelete(c.id)} style={{ ...dangerButtonStyle, fontSize: 11, padding: "3px 8px", marginLeft: 4 }}>
                          {t("deleteBtn", lang)}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={sectionCard}>
        <h4 style={{ color: color.gold, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, marginTop: 0 }}>
          {t("categoriesAddNew", lang)}
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>{t("categoriesSlug", lang)}</label>
            <input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="my-category" style={formInputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t("labelEn", lang)}</label>
            <input value={newLabelEn} onChange={(e) => setNewLabelEn(e.target.value)} placeholder="Label EN" style={formInputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t("labelFr", lang)}</label>
            <input value={newLabelFr} onChange={(e) => setNewLabelFr(e.target.value)} placeholder="Label FR" style={formInputStyle} />
          </div>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving || !newSlug.trim() || !newLabelEn.trim() || !newLabelFr.trim()}
          style={{ ...primaryButtonStyle, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "..." : t("createBtn", lang)}
        </button>
      </div>
    </div>
  );
}
