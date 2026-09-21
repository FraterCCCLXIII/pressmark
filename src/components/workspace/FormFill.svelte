<script lang="ts">
  import { untrack } from "svelte";
  import type { ExportedLabelTemplate } from "$/types";
  import { connectionState } from "$/stores";
  import { Button, IconButton, TextField } from "$/components/ui";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import CustomScroll from "$/components/basic/CustomScroll.svelte";
  import PrintPreview from "$/components/PrintPreview.svelte";
  import { cloneLabelTemplate } from "$/utils/label_template";
  import { LocalStoragePersistence } from "$/utils/persistence";
  import { renderCsvPageThumbnail } from "$/utils/label_preview";
  import { extractFormFields, filledFormValues, type FormField } from "$/utils/form_fields";
  import { clearFormDraft, loadFormDraft, saveFormDraft } from "$/utils/form_store";
  import { MAX_COPY_COUNT, parseCopyCount } from "$/utils/csv_source";
  import { formsHref } from "$/utils/app_router";
  import { Toasts } from "$/utils/toasts";
  import { tr } from "$/utils/i18n";

  interface Props {
    sourceId: string;
    revision: number;
    onEditSource: (label: ExportedLabelTemplate) => void;
  }

  let { sourceId, revision, onEditSource }: Props = $props();

  let source = $state<ExportedLabelTemplate | undefined>();
  let fields = $state<FormField[]>([]);
  let values = $state<Record<string, string>>({});
  let copies = $state(1);
  let previewSrc = $state<string | undefined>();
  let previewOpened = $state(false);
  let printNow = $state(false);
  let loadedSourceId = $state<string | null>(null);

  const persistDraft = (nextValues = values, nextCopies = copies) => {
    if (!sourceId || fields.length === 0) {
      return;
    }
    saveFormDraft(sourceId, { values: nextValues, copies: nextCopies });
  };

  const loadSource = () => {
    const labels = LocalStoragePersistence.loadLabels();
    const label = labels.find((item) => item.id === sourceId);
    const keepTyped = loadedSourceId === sourceId;
    const typed = keepTyped ? values : {};
    source = label ? cloneLabelTemplate(label) : undefined;
    const nextFields = extractFormFields(source);
    const draft = loadFormDraft(sourceId);
    fields = nextFields;
    values = filledFormValues(nextFields, { ...draft?.values, ...typed });
    copies = keepTyped ? copies : (draft?.copies ?? 1);
    loadedSourceId = sourceId;
  };

  $effect(() => {
    void sourceId;
    void revision;
    untrack(loadSource);
  });

  $effect(() => {
    const label = source;
    const nextValues = filledFormValues(fields, values);
    if (!label) {
      previewSrc = undefined;
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      renderCsvPageThumbnail(label.canvas, label.label, nextValues)
        .then((url) => {
          if (!cancelled) {
            previewSrc = url;
          }
        })
        .catch(() => {
          if (!cancelled) {
            previewSrc = label.thumbnailBase64;
          }
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  });

  const updateValue = (key: string, next: string) => {
    values = { ...values, [key]: next };
    persistDraft({ ...values, [key]: next });
  };

  const clearValues = () => {
    values = filledFormValues(fields, {});
    copies = 1;
    clearFormDraft(sourceId);
  };

  const printVariables = $derived(filledFormValues(fields, values));

  const openPreview = (immediate: boolean) => {
    if (!source) {
      return;
    }
    if (immediate && $connectionState !== "connected") {
      Toasts.message($tr("preview.not_connected"));
      printNow = false;
      previewOpened = true;
      return;
    }
    printNow = immediate;
    previewOpened = true;
  };

  const editSource = () => {
    if (source) {
      onEditSource(source);
    }
  };

  const onFieldKeydown = (event: KeyboardEvent, index: number) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      openPreview(true);
      return;
    }
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    if (index >= fields.length - 1) {
      openPreview(true);
      return;
    }
    const next = document.getElementById(`form-field-${index + 1}`) as HTMLInputElement | null;
    next?.focus();
    next?.select();
  };
</script>

<div class="form-fill">
  <div class="form-fill__stage">
    <header class="form-fill__header">
      <IconButton href={formsHref()} title={$tr("forms.back")}>
        <MdIcon icon="arrow_back" />
      </IconButton>
      <div class="form-fill__heading">
        <div class="form-fill__kicker">{$tr("forms.title")}</div>
        <h2>{source?.title?.trim() || $tr("editor.untitled")}</h2>
      </div>
      <Button onclick={editSource} disabled={!source}>
        <MdIcon icon="edit" />
        {$tr("forms.edit_source")}
      </Button>
    </header>

    <div class="form-fill__preview">
      {#if !source}
        <div class="form-fill__empty">{$tr("forms.missing")}</div>
      {:else if previewSrc}
        <img src={previewSrc} alt="" />
      {:else}
        <div class="form-fill__empty">{$tr("forms.preview_loading")}</div>
      {/if}
    </div>
  </div>

  <aside class="designer-inspector form-fill__inspector">
    <div class="form-fill__inspector-head">
      <h3 class="insp-heading">{$tr("forms.fields")}</h3>
      <p class="insp-help">{$tr("forms.fields.help")}</p>
    </div>
    <CustomScroll class="inspector-body">
      {#if !source}
        <p class="form-fill__note">{$tr("forms.missing.help")}</p>
      {:else if fields.length === 0}
        <p class="form-fill__note">{$tr("forms.empty_fields")}</p>
        <Button class="mt-3" onclick={editSource}>
          <MdIcon icon="edit" />
          {$tr("forms.edit_source")}
        </Button>
      {:else}
        <div class="form-fill__fields">
          {#each fields as field, index (field.key)}
            <label class="insp-field-block" for={`form-field-${index}`}>
              <span class="insp-row__label">{field.label}</span>
              <TextField
                id={`form-field-${index}`}
                value={values[field.key] ?? ""}
                autocomplete="off"
                placeholder={`{${field.key}}`}
                oninput={(event) => updateValue(field.key, event.currentTarget.value)}
                onkeydown={(event) => onFieldKeydown(event, index)} />
            </label>
          {/each}
          <button type="button" class="form-fill__clear" onclick={clearValues}>{$tr("forms.clear")}</button>
        </div>
      {/if}
    </CustomScroll>
    <div class="form-fill__actions">
      <label class="insp-field-block" for="form-copies">
        <span class="insp-row__label">{$tr("preview.copies")}</span>
        <TextField
          id="form-copies"
          type="number"
          min="1"
          max={MAX_COPY_COUNT}
          value={String(copies)}
          oninput={(event) => {
            copies = parseCopyCount(event.currentTarget.value, 1) || 1;
            persistDraft(values, copies);
          }} />
      </label>
      <Button class="w-full justify-center" onclick={() => openPreview(false)}>
        <MdIcon icon="visibility" />
        {$tr("editor.preview")}
      </Button>
      <Button variant="primary" class="w-full justify-center" onclick={() => openPreview(true)}>
        <MdIcon icon="print" />
        {$tr("forms.print_now")}
      </Button>
    </div>
  </aside>
</div>

{#if previewOpened && source}
  <PrintPreview
    bind:show={previewOpened}
    canvasCallback={() => source!.canvas}
    labelProps={source.label}
    {printNow}
    csvEnabled={false}
    csvData=""
    variables={printVariables}
    initialQuantity={copies}
    labelTitle={source.title}
    sourceId={source.id} />
{/if}
