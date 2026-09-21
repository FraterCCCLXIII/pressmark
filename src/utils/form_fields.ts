import type { ExportedLabelTemplate } from "$/types";
import { listTemplateKeys, templateSourceText } from "$/utils/canvas_preprocess";
import { getBoundText } from "$/utils/csv_preview";
import type * as fabric from "fabric";

export type FormField = {
  key: string;
  label: string;
};

export const sanitizeFieldKey = (raw: string): string =>
  raw.replace(/[{}|]/g, "").replace(/\s+/g, " ").trim();

export const fieldLabel = (key: string): string =>
  sanitizeFieldKey(key)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const collectFields = (sources: string[]): FormField[] => {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    for (const key of listTemplateKeys(source)) {
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      keys.push(key);
    }
  }
  return keys.map((key) => ({ key, label: fieldLabel(key) || key }));
};

export const extractFormFields = (label?: ExportedLabelTemplate | null): FormField[] => {
  if (!label?.canvas?.objects) {
    return [];
  }
  return collectFields(label.canvas.objects.map((obj) => templateSourceText(obj as { csvSource?: unknown; text?: unknown })));
};

export const extractFormFieldsFromCanvas = (canvas?: fabric.Canvas): FormField[] => {
  if (!canvas) {
    return [];
  }
  const sources: string[] = [];
  canvas.forEachObject((obj) => {
    sources.push(getBoundText(obj) || templateSourceText(obj));
  });
  return collectFields(sources);
};

export const valuesForFields = (
  fields: FormField[],
  previous?: Record<string, string>,
): Record<string, string> => {
  const next: Record<string, string> = {};
  for (const field of fields) {
    next[field.key] = previous?.[field.key] ?? "";
  }
  return next;
};

export const filledFormValues = (fields: FormField[], values: Record<string, string>): Record<string, string> =>
  valuesForFields(fields, values);
