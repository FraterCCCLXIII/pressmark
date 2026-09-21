import * as fabric from "fabric";
import QRCode from "$/fabric-object/qrcode";
import Barcode from "$/fabric-object/barcode";
import dayjs from "dayjs";
import { TextboxExt } from "$/fabric-object/textbox-ext";

const VARIABLE_TEMPLATE_RX = /{\s*([^{}|]+?)\s*(?:\|\s*([^}]*?)\s*)?}/g;
const AUTOMATIC_KEYS = new Set(["dt"]);

type TemplatedObject = fabric.FabricObject & { csvSource?: string; text?: string };

export const templateSourceText = (obj: fabric.FabricObject | { csvSource?: unknown; text?: unknown }): string => {
  const bound = obj as { csvSource?: unknown; text?: unknown };
  if (typeof bound.csvSource === "string" && bound.csvSource.length > 0) {
    return bound.csvSource;
  }
  return typeof bound.text === "string" ? bound.text : "";
};

export const listTemplateKeys = (input: string): string[] => {
  const keys: string[] = [];
  const seen = new Set<string>();
  const matches = String(input ?? "").matchAll(new RegExp(VARIABLE_TEMPLATE_RX.source, "g"));
  for (const match of matches) {
    const key = String(match[1] ?? "").trim();
    if (!key || AUTOMATIC_KEYS.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    keys.push(key);
  }
  return keys;
};

const preprocessDateTime = (format?: string) => {
  const dt = dayjs();
  if (format) {
    return dt.format(format);
  }
  return dt.format("YYYY-MM-DD HH:mm:ss");
};

const lookupVariable = (key: string, variables?: { [v: string]: string }): string | undefined => {
  if (!variables) {
    return undefined;
  }
  const trimmed = key.trim();
  if (trimmed in variables) {
    return variables[trimmed];
  }
  if (key in variables) {
    return variables[key];
  }
  const match = Object.keys(variables).find((name) => name.trim() === trimmed);
  return match != null ? variables[match] : undefined;
};

export const hasVariableTemplate = (input: string): boolean => {
  VARIABLE_TEMPLATE_RX.lastIndex = 0;
  return VARIABLE_TEMPLATE_RX.test(input);
};

export const resolveTemplate = (input: string, variables?: { [v: string]: string }): string => {
  VARIABLE_TEMPLATE_RX.lastIndex = 0;
  return input.replace(VARIABLE_TEMPLATE_RX, (src, rawKey, filter) => {
    const key = String(rawKey ?? "").trim();
    const value = lookupVariable(key, variables);
    if (value !== undefined) {
      return value;
    }
    if (key === "dt") {
      return preprocessDateTime(filter);
    }
    return src;
  });
};

/** Replace text templates in some canvas objects */
export const canvasPreprocess = (canvas: fabric.Canvas, variables?: { [key: string]: string }) => {
  canvas.forEachObject((obj: fabric.FabricObject) => {
    const source = templateSourceText(obj as TemplatedObject);
    if (obj instanceof fabric.IText) {
      const text = resolveTemplate(source, variables);

      if (obj instanceof TextboxExt && obj.fontAutoSize) {
        obj.setAndShrinkText(text, obj.width);
      } else {
        obj.set({ text });
      }
    } else if (obj instanceof QRCode || obj instanceof Barcode) {
      obj.set({ text: resolveTemplate(source, variables) });
    }
  });
};
