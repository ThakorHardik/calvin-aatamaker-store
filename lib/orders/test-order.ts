/**
 * CALVIN AATAMAKER — Development Test Order Detection & Safeguards
 * File: lib/orders/test-order.ts
 *
 * Provides authoritative identification of development test orders
 * to protect them from accidental real-world fulfillment or shipping.
 */

export const VERIFIED_TEST_ORDER_NUMBERS = new Set([
  "CA-7891F04B40",
  "CA-120A39C5E1",
  "CA-FE9C311C5A",
  "CA-35C3C3A849",
  "CA-70F00BBF32",
  "CA-MTC84MQF84",
]);

export function isDevelopmentTestOrder(order: {
  order_number?: string | null;
  is_test_order?: boolean | null;
}): boolean {
  if (order.is_test_order === true) return true;
  if (order.order_number && VERIFIED_TEST_ORDER_NUMBERS.has(order.order_number)) {
    return true;
  }
  return false;
}

