<script lang="ts">
  import * as fabric from "fabric";
  import { tr } from "$/utils/i18n";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import { Button, Menu } from "$/components/ui";
  import { csvVariableToken } from "$/utils/csv_source";
  import { getBoundText, setBoundText } from "$/utils/csv_preview";
  import { sanitizeFieldKey } from "$/utils/form_fields";
  import { TextField } from "$/components/ui";

  interface Props {
    selectedObject: fabric.FabricObject;
    valueUpdated: () => void;
    csvColumns?: string[];
    csvVariables?: { [key: string]: string };
  }

  let { selectedObject, valueUpdated, csvColumns = [], csvVariables }: Props = $props();

  const applyText = (next: string) => {
    if (selectedObject instanceof fabric.IText && selectedObject.isEditing) {
      selectedObject.exitEditing();
    }
    setBoundText(selectedObject, next, csvVariables);
    valueUpdated();
  };

  const insertToken = (token: string) => {
    applyText(`${getBoundText(selectedObject)}${token}`);
  };

  const insertDateTime = (format?: string) => {
    insertToken(format ? `{dt|${format}}` : "{dt}");
  };

  let customName = $state("");

  const insertCustomField = () => {
    const key = sanitizeFieldKey(customName);
    if (!key) {
      return;
    }
    insertToken(csvVariableToken(key));
    customName = "";
  };
</script>

<Menu closeOnSelect={false} class="min-w-56 p-2">
  {#snippet trigger({ toggle })}
    <Button size="sm" pill={false} title={$tr("params.variables.insert")} onclick={toggle}>
      <MdIcon icon="data_object" />
    </Button>
  {/snippet}
  <div class="mb-2 border-b border-line pb-2">
    <div class="mb-1.5 text-[11px] text-muted">{$tr("params.variables.custom")}</div>
    <div class="flex items-center gap-1">
      <TextField
        class="min-h-8 text-xs"
        placeholder={$tr("params.variables.custom.placeholder")}
        bind:value={customName}
        onkeydown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            insertCustomField();
          }
        }} />
      <Button
        size="sm"
        pill={false}
        onmousedown={(event) => {
          event.preventDefault();
          insertCustomField();
        }}>
        {$tr("params.variables.custom.insert")}
      </Button>
    </div>
  </div>
  {#if csvColumns.length > 0}
    <div class="mb-2 border-b border-line pb-2">
      <div class="mb-1.5 text-[11px] text-muted">{$tr("params.variables.csv")}</div>
      <div class="flex flex-wrap gap-1">
        {#each csvColumns as column (column)}
          <Button
            size="sm"
            pill={false}
            onmousedown={(event) => {
              event.preventDefault();
              insertToken(csvVariableToken(column));
            }}>
            {column}
          </Button>
        {/each}
      </div>
    </div>
  {/if}
  <div class="flex flex-wrap gap-1">
    <Button
      size="sm"
      pill={false}
      onmousedown={(event) => {
        event.preventDefault();
        insertDateTime();
      }}>
      <MdIcon icon="calendar_today" />
      {$tr("params.variables.insert.datetime")}
    </Button>
    <Button
      size="sm"
      pill={false}
      onmousedown={(event) => {
        event.preventDefault();
        insertDateTime("YYYY-MM-DD");
      }}>
      <MdIcon icon="calendar_today" />
      {$tr("params.variables.insert.date")}
    </Button>
    <Button
      size="sm"
      pill={false}
      onmousedown={(event) => {
        event.preventDefault();
        insertDateTime("HH:mm:ss");
      }}>
      <MdIcon icon="schedule" />
      {$tr("params.variables.insert.time")}
    </Button>
  </div>
</Menu>
