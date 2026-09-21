import { FileUtils } from "$/utils/file_utils";
import { LIBRARY_CHANGED_EVENT } from "$/utils/library_host";
import { LocalStoragePersistence } from "$/utils/persistence";
import { z } from "zod";

const INDEX_KEY = "label_forms";
const DRAFTS_KEY = "form_drafts";

const FormIndexSchema = z.object({
  sourceIds: z.array(z.string()),
});

const FormDraftSchema = z.object({
  values: z.record(z.string(), z.string()),
  copies: z.number().int().min(1).max(999),
  updatedAt: z.number().positive(),
});

const FormDraftMapSchema = z.record(z.string(), FormDraftSchema);

export type FormDraft = z.infer<typeof FormDraftSchema>;

const emptyIndex = () => ({ sourceIds: [] as string[] });

const loadIndex = () => {
  try {
    return LocalStoragePersistence.loadAndValidateObject(INDEX_KEY, FormIndexSchema) ?? emptyIndex();
  } catch {
    return emptyIndex();
  }
};

const saveIndex = (sourceIds: string[]) => {
  const unique = [...new Set(sourceIds.filter(Boolean))];
  LocalStoragePersistence.validateAndSaveObject(INDEX_KEY, { sourceIds: unique }, FormIndexSchema);
  return unique;
};

const notifyLibrary = () => {
  window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT));
};

export const listFormSourceIds = (): string[] => loadIndex().sourceIds;

export const isPublishedForm = (sourceId?: string): boolean => !!sourceId && loadIndex().sourceIds.includes(sourceId);

export const publishForm = (sourceId: string): string[] => {
  const next = saveIndex([...loadIndex().sourceIds, sourceId]);
  notifyLibrary();
  return next;
};

export const unpublishForm = (sourceId: string): string[] => {
  const next = saveIndex(loadIndex().sourceIds.filter((id) => id !== sourceId));
  notifyLibrary();
  return next;
};

export const pruneMissingForms = (existingIds: string[]): string[] => {
  const keep = new Set(existingIds);
  const current = loadIndex().sourceIds;
  const next = current.filter((id) => keep.has(id));
  if (next.length !== current.length) {
    saveIndex(next);
  }
  return next;
};

const loadDrafts = (): Record<string, FormDraft> => {
  try {
    return LocalStoragePersistence.loadAndValidateObject(DRAFTS_KEY, FormDraftMapSchema) ?? {};
  } catch {
    return {};
  }
};

export const loadFormDraft = (sourceId: string): FormDraft | undefined => loadDrafts()[sourceId];

export const saveFormDraft = (sourceId: string, draft: { values: Record<string, string>; copies: number }) => {
  const drafts = loadDrafts();
  drafts[sourceId] = {
    values: draft.values,
    copies: Math.min(999, Math.max(1, Math.round(draft.copies) || 1)),
    updatedAt: FileUtils.timestamp(),
  };
  LocalStoragePersistence.validateAndSaveObject(DRAFTS_KEY, drafts, FormDraftMapSchema);
};

export const clearFormDraft = (sourceId: string) => {
  const drafts = loadDrafts();
  delete drafts[sourceId];
  LocalStoragePersistence.validateAndSaveObject(DRAFTS_KEY, drafts, FormDraftMapSchema);
};
