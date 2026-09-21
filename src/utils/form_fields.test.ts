import assert from "node:assert/strict";
import { extractFormFields, fieldLabel, sanitizeFieldKey, valuesForFields } from "./form_fields";
import type { ExportedLabelTemplate } from "../types";

const label = (objects: Array<{ text?: string; csvSource?: string }>): ExportedLabelTemplate =>
  ({
    label: { printDirection: "left", size: { width: 40, height: 20 } },
    canvas: { version: "6", objects },
  }) as ExportedLabelTemplate;

const run = () => {
  assert.equal(sanitizeFieldKey("{Name}"), "Name");
  assert.equal(fieldLabel("customer_name"), "customer name");

  const fields = extractFormFields(
    label([
      { text: "Hello {Name}" },
      { csvSource: "SKU {sku} {Name}", text: "SKU 1 Alice" },
      { text: "Printed {dt|YYYY-MM-DD}" },
      { text: "static" },
    ]),
  );
  assert.deepEqual(
    fields.map((field) => field.key),
    ["Name", "sku"],
  );
  assert.deepEqual(valuesForFields(fields, { Name: "Ada", extra: "x" }), { Name: "Ada", sku: "" });
  console.log("form_fields tests passed");
};

run();
