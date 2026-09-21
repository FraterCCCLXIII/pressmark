import {
  AutomationPropsSchema,
  ExportedLabelTemplateSchema,
  FabricJsonSchema,
  LabelPresetSchema,
  LabelPropsSchema,
  PreviewPropsSchema,
  PrintCountMapSchema,
  PrintHistoryEntrySchema,
  RecentLabelEntrySchema,
  WorkspaceSessionSchema,
  type AutomationProps,
  type ConnectionType,
  type ExportedLabelTemplate,
  type LabelPreset,
  type LabelProps,
  type PreviewProps,
  type PrintCountMap,
  type PrintHistoryEntry,
  type RecentLabelEntry,
  type WorkspaceSession,
} from "$/types";
import { z } from "zod";
import { FileUtils } from "$/utils/file_utils";
import { get, writable, type Updater, type Writable } from "svelte/store";

/** Writable store, value is persisted to localStorage */
export function writablePersisted<T>(
  key: string,
  schema: z.ZodType<T>,
  initialValue: T,
): Writable<T> {
  const wr = writable<T>(initialValue);

  try {
    const val = LocalStoragePersistence.loadAndValidateObject(key, schema);
    if (val === null) {
      wr.set(initialValue);
    } else {
      wr.set(val);
    }
  } catch {
    wr.set(initialValue);
  }

  return {
    subscribe: wr.subscribe,

    set: (value: T) => {
      LocalStoragePersistence.validateAndSaveObject(key, value, schema);
      wr.set(value);
    },

    update: (updater: Updater<T>) => {
      const newValue: T = updater(get(wr));
      LocalStoragePersistence.validateAndSaveObject(key, newValue, schema);
      wr.set(newValue);
    },
  };
}

export class LocalStoragePersistence {
  /** Result in kilobytes */
  static usedSpace(): number {
    let total = 0;
    Object.keys(localStorage).forEach((key) => {
      total += (localStorage[key].length + key.length) * 2;
    });
    return Math.floor(total / 1024);
  }

  static saveObject(key: string, data: any) {
    if (data === null || data === undefined) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(data));
  }
  static loadObject(key: string): any {
    const data = localStorage.getItem(key);
    if (data !== null) {
      try {
        return JSON.parse(data);
      } catch (e) {
        console.log(e);
      }
    }
    return null;
  }

  /**
   * @throws {z.ZodError}
   */
  static loadAndValidateObject<T>(key: string, schema: z.ZodType<T>) {
    const data = this.loadObject(key);

    if (data === null) {
      return null;
    }

    return schema.parse(data);
  }

  static validateAndSaveObject<T>(
    key: string,
    data: any,
    schema: z.ZodType<T>,
  ): void {
    if (data === null || data === undefined) {
      this.saveObject(key, data);
      return;
    }

    const obj = schema.parse(data);
    this.saveObject(key, obj);
  }

  /**
   * @throws {z.ZodError}
   */
  static loadLastLabelProps(): LabelProps | null {
    return this.loadAndValidateObject("last_label_props", LabelPropsSchema);
  }

  /**
   * @throws {z.ZodError}
   */
  static saveLastLabelProps(labelData: LabelProps) {
    this.validateAndSaveObject("last_label_props", labelData, LabelPropsSchema);
  }

  static createUidForLabel(label: ExportedLabelTemplate): string {
    const basename = `saved_label_${label.timestamp}`;
    let counter = 0;

    while (`${basename}_${counter}` in localStorage) {
      counter++;
    }

    return `${basename}_${counter}`;
  }

  static saveLabels(labels: ExportedLabelTemplate[]): {
    zodErrors: z.ZodError[];
    otherErrors: Error[];
  } {
    const zodErrors: z.ZodError[] = [];
    const otherErrors: Error[] = [];
    const keep = new Set<string>();

    labels.forEach((label) => {
      try {
        if (label.timestamp === undefined) {
          label.timestamp = FileUtils.timestamp();
        }

        const id =
          label.id && label.id.startsWith("saved_label") ? label.id : this.createUidForLabel(label);
        keep.add(id);
        label.id = id;
        this.validateAndSaveObject(id, label, ExportedLabelTemplateSchema.omit({ id: true }));
      } catch (e) {
        if (e instanceof z.ZodError) {
          zodErrors.push(e);
        }
        if (e instanceof Error) {
          otherErrors.push(e);
        }
      }
    });

    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("saved_label") && !keep.has(key)) {
        localStorage.removeItem(key);
      }
    });
    return { zodErrors, otherErrors };
  }

  static renameLabel(id: string, title: string): boolean {
    const nextTitle = title.trim();
    if (!id || !nextTitle) {
      return false;
    }

    const labels = this.loadLabels();
    const current = labels.find((item) => item.id === id);
    if (!current) {
      return false;
    }

    try {
      this.validateAndSaveObject(id, { ...current, title: nextTitle }, ExportedLabelTemplateSchema.omit({ id: true }));
      this.savePrintHistory(
        this.loadPrintHistory().map((entry) => (entry.sourceId === id ? { ...entry, title: nextTitle } : entry)),
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * @throws {z.ZodError}
   */
  static loadLabels(): ExportedLabelTemplate[] {
    const legacyLabel = this.loadAndValidateObject(
      "saved_canvas_props",
      LabelPropsSchema,
    );
    const legacyCanvas = this.loadAndValidateObject(
      "saved_canvas_data",
      FabricJsonSchema,
    );
    const items: ExportedLabelTemplate[] = [];

    if (legacyLabel !== null && legacyCanvas !== null) {
      localStorage.removeItem("saved_canvas_props");
      localStorage.removeItem("saved_canvas_data");
      const item: ExportedLabelTemplate = {
        label: legacyLabel,
        canvas: legacyCanvas,
        timestamp: FileUtils.timestamp(),
      };
      this.validateAndSaveObject(
        `saved_label_${item.timestamp}`,
        item,
        ExportedLabelTemplateSchema,
      );
    }

    Object.keys(localStorage)
      .sort()
      .forEach((key) => {
        if (key.startsWith("saved_label")) {
          try {
            const item = this.loadAndValidateObject(
              key,
              ExportedLabelTemplateSchema,
            );
            if (item != null) {
              item.id = key;
              items.push(item);
            }
          } catch (e) {
            console.error(e);
          }
        }
      });

    return items;
  }

  /**
   * @throws {z.ZodError}
   */
  static savePreviewProps(props: PreviewProps) {
    this.validateAndSaveObject(
      "saved_preview_props",
      props,
      PreviewPropsSchema,
    );
  }

  /**
   * @throws {z.ZodError}
   */
  static loadSavedPreviewProps(): PreviewProps | null {
    return this.loadAndValidateObject(
      "saved_preview_props",
      PreviewPropsSchema,
    );
  }

  /**
   * @throws {z.ZodError}
   */
  static saveLabelPresets(presets: LabelPreset[]) {
    this.validateAndSaveObject(
      "label_presets",
      presets,
      z.array(LabelPresetSchema),
    );
  }

  /**
   * @throws {z.ZodError}
   */
  static loadLabelPresets(): LabelPreset[] | null {
    const presets = this.loadAndValidateObject(
      "label_presets",
      z.array(LabelPresetSchema),
    );
    return presets === null || presets.length === 0 ? null : presets;
  }

  static loadLastConnectionType(): ConnectionType | null {
    const value = localStorage.getItem("connection_type");
    if (value === null || !["bluetooth", "serial"].includes(value)) {
      return null;
    }
    return value as ConnectionType;
  }

  static saveLastConnectionType(value: ConnectionType) {
    localStorage.setItem("connection_type", value);
  }

  /**
   * @throws {z.ZodError}
   */
  static saveAutomation(value?: AutomationProps) {
    this.validateAndSaveObject("automation", value, AutomationPropsSchema);
  }

  /**
   * @throws {z.ZodError}
   */
  static loadAutomation(): AutomationProps | null {
    return this.loadAndValidateObject("automation", AutomationPropsSchema);
  }

  /**
   * @throws {z.ZodError}
   */
  static saveDefaultTemplate(value?: ExportedLabelTemplate) {
    this.validateAndSaveObject(
      "default_template",
      value,
      ExportedLabelTemplateSchema.omit({ id: true }),
    );
  }

  /**
   * @throws {z.ZodError}
   */
  static loadDefaultTemplate(): ExportedLabelTemplate | null {
    return this.loadAndValidateObject(
      "default_template",
      ExportedLabelTemplateSchema,
    );
  }

  static hasCustomDefaultTemplate(): boolean {
    return "default_template" in localStorage;
  }

  /**
   * @throws {z.ZodError}
   */
  static saveCachedFonts(fonts: string[]) {
    this.validateAndSaveObject("font_cache", fonts, z.array(z.string()));
  }

  /**
   * @throws {z.ZodError}
   */
  static loadCachedFonts(): string[] {
    return this.loadAndValidateObject("font_cache", z.array(z.string())) ?? [];
  }

  static loadPrintHistory(): PrintHistoryEntry[] {
    return this.loadAndValidateObject("print_history", z.array(PrintHistoryEntrySchema)) ?? [];
  }

  static savePrintHistory(entries: PrintHistoryEntry[]) {
    this.validateAndSaveObject("print_history", entries.slice(0, 50), z.array(PrintHistoryEntrySchema));
  }

  static addPrintHistory(entry: PrintHistoryEntry) {
    const next = [entry, ...this.loadPrintHistory().filter((item) => item.id !== entry.id)];
    this.savePrintHistory(next);
  }

  static loadRecentLabels(): RecentLabelEntry[] {
    return this.loadAndValidateObject("recent_labels", z.array(RecentLabelEntrySchema)) ?? [];
  }

  static touchRecentLabel(id: string) {
    const next = [{ id, openedAt: FileUtils.timestamp() }, ...this.loadRecentLabels().filter((item) => item.id !== id)];
    this.validateAndSaveObject("recent_labels", next.slice(0, 30), z.array(RecentLabelEntrySchema));
  }

  static loadPrintCounts(): PrintCountMap {
    return this.loadAndValidateObject("print_counts", PrintCountMapSchema) ?? {};
  }

  static incrementPrintCount(id: string, by = 1): number {
    const counts = this.loadPrintCounts();
    counts[id] = (counts[id] ?? 0) + by;
    this.validateAndSaveObject("print_counts", counts, PrintCountMapSchema);
    return counts[id];
  }

  static loadWorkspaceSession(): WorkspaceSession | null {
    try {
      const raw = sessionStorage.getItem("workspace_session");
      if (!raw) {
        return null;
      }
      return WorkspaceSessionSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  static saveWorkspaceSession(session: WorkspaceSession) {
    try {
      const compact = JSON.parse(
        JSON.stringify({
          ...session,
          tabs: session.tabs.map((tab) => ({
            ...tab,
            snapshot: { ...tab.snapshot, thumbnailBase64: undefined },
          })),
        }),
      ) as WorkspaceSession;
      sessionStorage.setItem("workspace_session", JSON.stringify(compact));
    } catch (error) {
      console.warn("Workspace session was not saved:", error);
    }
  }
}
