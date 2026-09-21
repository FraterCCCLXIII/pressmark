<script lang="ts">
  import type { LabelProps, LabelShape } from "$/types";
  import type { FormField } from "$/utils/form_fields";
  import { Button } from "$/components/ui";
  import { DEFAULT_LABEL_PRESETS } from "$/defaults";
  import { applyLabelDimensions, DEFAULT_DPMM, formatPresetSize, labelSizeMm } from "$/utils/label_geometry";
  import { normalizeLabelPrintDirection } from "$/utils/label_template";
  import { LocalStoragePersistence } from "$/utils/persistence";
  import { appConfig } from "$/stores";
  import { tr } from "$/utils/i18n";
  import type { PrintDirection } from "@mmote/niimbluelib";

  interface Props {
    labelProps: LabelProps;
    title: string;
    onChange: (next: LabelProps) => void;
    onTitleChange: (title: string) => void;
    formFields?: FormField[];
    onSaveAsForm?: () => void;
  }

  let { labelProps, title = $bindable(), onChange, onTitleChange, formFields = [], onSaveAsForm }: Props = $props();

  let dpmm = $state(DEFAULT_DPMM);
  let presets = $state(DEFAULT_LABEL_PRESETS);
  let widthMm = $state(40);
  let heightMm = $state(20);

  const syncFromProps = () => {
    const size = labelSizeMm(labelProps, dpmm);
    widthMm = size.width;
    heightMm = size.height;
    presets = LocalStoragePersistence.loadLabelPresets() ?? DEFAULT_LABEL_PRESETS;
  };

  $effect(() => {
    void labelProps.size.width;
    void labelProps.size.height;
    syncFromProps();
  });

  const applySize = (width = widthMm, height = heightMm) => {
    onChange(
      normalizeLabelPrintDirection(
        applyLabelDimensions({
          width,
          height,
          unit: "mm",
          dpmm,
          printDirection: labelProps.printDirection,
          shape: labelProps.shape,
          split: labelProps.split,
          splitParts: labelProps.splitParts,
          tailPos: labelProps.tailPos,
          tailLength: labelProps.tailLength,
          mirror: labelProps.mirror,
        }),
      ),
    );
  };

  const presetMatches = (preset: (typeof presets)[number]) => {
    if (preset.unit === "mm") {
      const size = labelSizeMm(labelProps, preset.dpmm);
      return size.width === preset.width && size.height === preset.height;
    }
    return labelProps.size.width === preset.width && labelProps.size.height === preset.height;
  };

  const selectedPresetIndex = $derived.by(() => {
    const exact = presets.findIndex(
      (preset) => presetMatches(preset) && preset.printDirection === labelProps.printDirection,
    );
    return exact >= 0 ? exact : presets.findIndex(presetMatches);
  });

  const applyPreset = (index: number) => {
    const preset = presets[index];
    if (!preset) {
      return;
    }
    dpmm = preset.dpmm;
    onChange(
      normalizeLabelPrintDirection(
        applyLabelDimensions({
          width: preset.width,
          height: preset.height,
          unit: preset.unit,
          dpmm: preset.dpmm,
          printDirection: preset.printDirection,
          shape: preset.shape,
          split: preset.split,
          splitParts: preset.splitParts,
          tailPos: preset.tailPos,
          tailLength: preset.tailLength,
          mirror: preset.mirror,
        }),
      ),
    );
  };

  const toggleGrid = () => {
    appConfig.update((cfg) => ({ ...cfg, gridEnabled: !cfg.gridEnabled }));
  };
</script>

<section class="insp-section">
  <h3 class="insp-heading">{$tr("editor.label_settings.title")}</h3>
  <input
    id="label-title"
    class="insp-field"
    type="text"
    bind:value={title}
    oninput={() => onTitleChange(title)} />
</section>

<section class="insp-section">
  <h3 class="insp-heading">{$tr("editor.label_settings.paper")}</h3>
  <select
    id="label-paper"
    class="insp-field insp-select"
    value={selectedPresetIndex >= 0 ? String(selectedPresetIndex) : ""}
    onchange={(e) => applyPreset(Number(e.currentTarget.value))}>
    <option value="" disabled>{$tr("editor.label_settings.custom_paper")}</option>
    {#each presets as preset, index (preset.title ?? `${preset.width}x${preset.height}-${index}`)}
      <option value={String(index)}>{preset.title ?? formatPresetSize(preset)}</option>
    {/each}
  </select>
</section>

<div class="insp-row">
  <label class="insp-row__label" for="label-width">{$tr("editor.label_settings.width")}</label>
  <div class="insp-unit">
    <input
      id="label-width"
      class="insp-field"
      type="number"
      min="8"
      bind:value={widthMm}
      onchange={() => applySize()} />
    <span>mm</span>
  </div>
</div>

<div class="insp-row">
  <label class="insp-row__label" for="label-height">{$tr("editor.label_settings.height")}</label>
  <div class="insp-unit">
    <input
      id="label-height"
      class="insp-field"
      type="number"
      min="8"
      bind:value={heightMm}
      onchange={() => applySize()} />
    <span>mm</span>
  </div>
</div>

<section class="insp-section">
  <h3 class="insp-heading">{$tr("params.label.direction")}</h3>
  <div class="insp-segment">
    <button
      type="button"
      class:is-active={labelProps.printDirection === "left"}
      onclick={() => onChange({ ...labelProps, printDirection: "left" as PrintDirection })}>
      {$tr("params.label.direction.left")}
    </button>
    <button
      type="button"
      class:is-active={labelProps.printDirection === "top"}
      onclick={() => onChange({ ...labelProps, printDirection: "top" as PrintDirection })}>
      {$tr("params.label.direction.top")}
    </button>
  </div>
</section>

<section class="insp-section">
  <h3 class="insp-heading">{$tr("params.label.shape")}</h3>
  <div class="insp-segment">
    <button
      type="button"
      class:is-active={(labelProps.shape ?? "rect") === "rect"}
      onclick={() => onChange({ ...labelProps, shape: "rect" as LabelShape })}>
      {$tr("editor.label_settings.shape.rect")}
    </button>
    <button
      type="button"
      class:is-active={labelProps.shape === "rounded_rect"}
      onclick={() => onChange({ ...labelProps, shape: "rounded_rect" as LabelShape })}>
      {$tr("editor.label_settings.shape.rounded")}
    </button>
    <button
      type="button"
      class:is-active={labelProps.shape === "circle"}
      onclick={() => onChange({ ...labelProps, shape: "circle" as LabelShape })}>
      {$tr("editor.label_settings.shape.circle")}
    </button>
  </div>
</section>

<label class="insp-check">
  <input id="print-range" type="checkbox" checked={!!$appConfig.gridEnabled} onclick={toggleGrid} />
  <span>{$tr("editor.label_settings.grid")}</span>
</label>

{#if formFields.length > 0}
  <section class="insp-section">
    <h3 class="insp-heading">{$tr("forms.fields")}</h3>
    <p class="insp-help">{$tr("forms.fields.designer_help")}</p>
    <ul class="form-field-list">
      {#each formFields as field (field.key)}
        <li>{field.label}</li>
      {/each}
    </ul>
    {#if onSaveAsForm}
      <Button class="mt-2 w-full justify-center" onclick={onSaveAsForm}>
        {$tr("forms.save")}
      </Button>
    {/if}
  </section>
{/if}
