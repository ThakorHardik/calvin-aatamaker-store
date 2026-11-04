export type CartCustomisationDetails = Record<
  string,
  string | number | boolean | null
>;

export type CartItem = {
  /**
   * Stable cart item identifier.
   * Format: `${productId}:${variantId ?? 'default'}:${customHash ?? 'standard'}`
   */
  id: string;
  productId: string;
  slug: string;
  name: string;
  image: string | null;
  unitPrice: number;
  baseUnitPrice?: number;
  customisationPriceDelta?: number;
  customisationSummary?: string;
  quantity: number;
  variantId: string | null;
  variantName: string | null;
  sku: string | null;
  customisationDetails?: CartCustomisationDetails | null;
  availableStock?: number;
  unavailable?: boolean;
  unavailableReason?: string;

  // 3D Personalization Specifics
  isCustomized?: boolean;
  designId?: string | null;
  modelCode?: string | null;
  modelVersion?: number | null;
  surfaceKey?: string | null;
  customPreviewUrl?: string | null;
  designSnapshot?: unknown;
  customizationMode?: "demonstration" | "production";
};

export type CheckoutItemRequest = {
  productId: string;
  variantId: string | null;
  quantity: number;
  customisationDetails?: CartCustomisationDetails | null;
};
