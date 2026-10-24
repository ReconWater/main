/** Pure presentation helpers for the private operator dashboard. No credentials or API calls. */
export const ORDER_STATUSES = Object.freeze({
  pending_review: 'Pending review', approved: 'Approved', fulfilled: 'Fulfilled', cancelled: 'Cancelled'
});
export const statusTone = (status) => status === 'approved' || status === 'fulfilled'
  ? 'available' : status === 'cancelled' ? 'muted' : 'neutral';
export const safeText = value => String(value ?? '').trim().toLocaleLowerCase('en-CA');
export const isLowStock = product => Number(product?.stock_quantity ?? 0) <= Number(product?.low_stock_threshold ?? 0);

export function summarizeDashboard(products = [], orders = []) {
  const published = products.filter(p => p.is_active);
  const pending = orders.filter(o => o.status === 'pending_review');
  const committed = orders.filter(o => ['approved', 'fulfilled'].includes(o.status));
  return {
    published: published.length,
    unpublished: products.length - published.length,
    lowStock: published.filter(isLowStock),
    outOfStock: published.filter(p => Number(p.stock_quantity) === 0).length,
    availableUnits: products.reduce((sum,p) => sum + Number(p.stock_quantity || 0), 0),
    pending,
    committedValueCents: committed.reduce((sum,o) => sum + Number(o.subtotal_cents || 0), 0)
  };
}

export function filterOrders(orders = [], query = '', status = 'all') {
  const q = safeText(query);
  return orders.filter(order => {
    if (status !== 'all' && order.status !== status) return false;
    if (!q) return true;
    const values = [order.order_number,order.customer_name,order.customer_email, order.order_items?.map(i => i.sku).join(' ')];
    return values.some(value => safeText(value).includes(q));
  });
}

export function filterProducts(products = [], query = '') {
  const q = safeText(query);
  if (!q) return products;
  return products.filter(p => [p.name, p.sku].some(v => safeText(v).includes(q)));
}

export function validManualOrder(product, quantity) {
  const n = Number(quantity);
  return !!product && Number.isInteger(n) && n >= 1 && n <= 100 &&
    Number.isInteger(product.price_cents) && product.price_cents > 0 &&
    Number(product.stock_quantity) >= n;
}

export function orderActionDescription(order, status) {
  const code = order?.order_number || 'this request';
  if (status === 'approved') return {
    title: 'Approve this request?', action: 'Approve & reserve stock',
    detail: `${code} will move to Approved, and its item quantities will be deducted from inventory.`
  };
  if (status === 'fulfilled') return {
    title: 'Mark this order fulfilled?', action: 'Confirm fulfillment',
    detail: `${code} will be marked Fulfilled. This does not process payment or issue a shipping label.`
  };
  if (status === 'cancelled' && order?.status === 'approved') return {
    title: 'Cancel and restore stock?', action: 'Cancel & restock',
    detail: `${code} will be cancelled and quantities previously deducted at approval will be restored.`
  };
  return {title: 'Cancel this request?', action: 'Cancel request',detail: `${code} will be cancelled. No inventory has been deducted for a pending request.`};
}
