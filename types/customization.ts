export type CustomizationFieldType = "text" | "long_text" | "select" | "swatch";

export type CustomizationOption = {
  id: string;
  value: string;
  label: string;
  price_delta: number;
  swatch_color?: string;
  image_url?: string;
};

export type CustomizationField = {
  id: string;
  type: CustomizationFieldType;
  label: string;
  help_text?: string;
  required: boolean;
  max_length?: number;
  options?: CustomizationOption[];
};

export type CustomizationMode = "demonstration" | "production";

export type ProductCustomizationConfig = {
  enabled: boolean;
  fields: CustomizationField[];
  model_id?: string | null;
  surface_id?: string | null;
  allow_photo_upload?: boolean;
  allow_text_tools?: boolean;
  max_photo_size_mb?: number;
  allowed_photo_types?: string[];
  max_text_layers?: number;
  allowed_fonts?: string[];
  mode?: CustomizationMode;
  base_customization_price?: number;
};

/**
 * Computes the total price delta (in INR) for submitted customization values
 * based authoritatively on the product's customization configuration.
 */
export function computeCustomizationPriceDelta(
  config: ProductCustomizationConfig | null | undefined,
  selectedValues: Record<string, string | number | boolean | null> | null | undefined,
): number {
  if (!config || !config.enabled || !selectedValues) {
    return 0;
  }

  const hasSelections = Object.keys(selectedValues).length > 0;
  if (!hasSelections) {
    return 0;
  }

  let totalDelta = typeof config.base_customization_price === "number" && config.base_customization_price > 0
    ? Math.max(0, config.base_customization_price)
    : 0;

  const fields = Array.isArray(config.fields) ? config.fields : [];
  for (const field of fields) {
    const val = selectedValues[field.id];
    if (val === undefined || val === null || val === "") continue;

    if (field.type === "select" || field.type === "swatch") {
      const option = field.options?.find((opt) => opt.value === String(val));
      if (option && typeof option.price_delta === "number" && Number.isFinite(option.price_delta)) {
        totalDelta += Math.max(0, option.price_delta);
      }
    }
  }

  return totalDelta;
}

/**
 * Validates customer-submitted values against the product's customization configuration.
 * Returns either validated clean values and total delta, or an error message.
 */
export function validateCustomizationSubmission(
  config: ProductCustomizationConfig | null | undefined,
  submittedValues: unknown,
): { valid: true; cleanValues: Record<string, string | number | boolean | null>; priceDelta: number } | { valid: false; error: string } {
  // If product is not customizable or customization is disabled
  if (!config || !config.enabled) {
    if (submittedValues && typeof submittedValues === "object" && Object.keys(submittedValues).length > 0) {
      return { valid: false, error: "This product does not currently support custom personalisation." };
    }
    return { valid: true, cleanValues: {}, priceDelta: 0 };
  }

  const fields = Array.isArray(config.fields) ? config.fields : [];

  if (!submittedValues || typeof submittedValues !== "object" || Array.isArray(submittedValues)) {
    // Check if any required fields exist
    const hasRequired = fields.some((f) => f.required);
    if (hasRequired) {
      return { valid: false, error: "Please complete the required personalisation selections." };
    }
    return { valid: true, cleanValues: {}, priceDelta: 0 };
  }

  const raw = submittedValues as Record<string, unknown>;
  const cleanValues: Record<string, string | number | boolean | null> = {};
  const hasSelections = Object.keys(raw).length > 0;
  let priceDelta = hasSelections && typeof config.base_customization_price === "number" && config.base_customization_price > 0
    ? Math.max(0, config.base_customization_price)
    : 0;

  // Check for submitted keys not in the config (reject unknown fields, allowing 3D personalizer system metadata)
  const allowedFieldIds = new Set(fields.map((f) => f.id));
  const SYSTEM_KEYS = new Set([
    "_design_id",
    "_model_code",
    "_surface_key",
    "_layers_count",
    "_preview_image",
    "_mode",
    "_customization_summary",
  ]);

  for (const submittedKey of Object.keys(raw)) {
    if (!allowedFieldIds.has(submittedKey) && !SYSTEM_KEYS.has(submittedKey) && !submittedKey.startsWith("_")) {
      return { valid: false, error: `Unrecognized personalisation field "${submittedKey}".` };
    }
  }

  // Preserve valid system metadata keys
  for (const submittedKey of Object.keys(raw)) {
    if (SYSTEM_KEYS.has(submittedKey) || submittedKey.startsWith("_")) {
      const val = raw[submittedKey];
      if (typeof val === "string" || typeof val === "number" || typeof val === "boolean" || val === null) {
        cleanValues[submittedKey] = val;
      }
    }
  }

  for (const field of fields) {
    const rawVal = raw[field.id];
    const isProvided = rawVal !== undefined && rawVal !== null && rawVal !== "";

    if (field.required && !isProvided) {
      return { valid: false, error: `"${field.label}" is required.` };
    }

    if (!isProvided) {
      cleanValues[field.id] = null;
      continue;
    }

    if (field.type === "text" || field.type === "long_text") {
      if (typeof rawVal !== "string") {
        return { valid: false, error: `Invalid input for "${field.label}". Expected text.` };
      }

      const trimmed = rawVal.trim();
      const maxLimit = field.max_length || (field.type === "text" ? 50 : 250);

      if (trimmed.length > maxLimit) {
        return {
          valid: false,
          error: `"${field.label}" cannot exceed ${maxLimit} characters (received ${trimmed.length}).`,
        };
      }

      cleanValues[field.id] = trimmed;
    } else if (field.type === "select" || field.type === "swatch") {
      const strVal = String(rawVal).trim();
      const option = field.options?.find((opt) => opt.value === strVal);

      if (!option) {
        return { valid: false, error: `Invalid choice selected for "${field.label}".` };
      }

      cleanValues[field.id] = option.value;
      priceDelta += Math.max(0, option.price_delta || 0);
    }
  }

  return { valid: true, cleanValues, priceDelta };
}
