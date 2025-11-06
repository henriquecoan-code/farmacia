const { sendTemplateMessage } = require('../whatsapp/metaSender');
const logger = require('../whatsapp/logger');

const company = process.env.COMPANY_NAME || 'Farmácia São Benedito';

function buildTemplateForStatus(order, status) {
  const customerName = order.customerName || 'cliente';
  const orderId = order.id || order.number || '—';
  const reviewLink = process.env.REVIEW_LINK || 'https://g.page/r/CdbJtDrB_SSkEBM/review';

  switch (status) {
    case 'received':
      return { templateName: 'order_received', params: [customerName, String(orderId), company] };
    case 'out_for_delivery':
      return { templateName: 'order_out_for_delivery', params: [customerName, String(orderId), company] };
    case 'delivered':
      return { templateName: 'order_delivered', params: [customerName, String(orderId), reviewLink, company] };
    default:
      return null;
  }
}

function normalizeCustomerNumber(rawNumber) {
  const digits = (rawNumber || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11) return `55${digits}`; // assume BR
  return digits;
}

async function notifyOrderStatusChange(order, newStatus) {
  if (!order.whatsappOptIn || !order.whatsappNumber) {
    await logger.logMessage({ event: 'notify_skipped', reason: 'no_opt_in_or_no_number', orderId: order.id });
    return { ok: false, reason: 'no_opt_in_or_no_number' };
  }

  const payload = buildTemplateForStatus(order, newStatus);
  if (!payload) {
    await logger.logMessage({ event: 'notify_skipped', reason: 'no_template_for_status', orderId: order.id, status: newStatus });
    return { ok: false, reason: 'no_template_for_status' };
  }

  const to = normalizeCustomerNumber(order.whatsappNumber);
  if (!to) {
    await logger.logMessage({ event: 'notify_skipped', reason: 'invalid_number', orderId: order.id, raw: order.whatsappNumber });
    return { ok: false, reason: 'invalid_number' };
  }

  // In production you should enqueue this instead of sending inline
  const result = await sendTemplateMessage(to, payload.templateName, payload.params);

  await logger.logMessage({ event: 'notify_sent', orderId: order.id, to, status: newStatus, result });

  return result;
}

module.exports = { notifyOrderStatusChange, normalizeCustomerNumber };