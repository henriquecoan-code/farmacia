const axios = require('axios');
const logger = require('./logger');

const token = process.env.META_WABA_ACCESS_TOKEN;
const phoneNumberId = process.env.META_WABA_PHONE_NUMBER_ID;
const company = process.env.COMPANY_NAME || 'Farmácia São Benedito';

if (!token || !phoneNumberId) {
  console.warn('[whatsapp] META_WABA_ACCESS_TOKEN or META_WABA_PHONE_NUMBER_ID not configured');
}

async function sendTemplateMessage(toE164, templateName, templateParameters = []) {
  const to = (toE164 || '').replace(/\D/g, '').replace(/^\+/, '');
  const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'pt_BR' },
      components: [
        {
          type: 'body',
          parameters: templateParameters.map(p => ({ type: 'text', text: p }))
        }
      ]
    }
  };

  try {
    const res = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    await logger.logMessage({
      provider: 'meta',
      kind: 'template',
      to,
      templateName,
      params: templateParameters,
      ok: true,
      response: res.data
    });

    return { ok: true, data: res.data };
  } catch (err) {
    const detail = err.response ? err.response.data : err.message;
    console.error('[whatsapp] sendTemplateMessage error:', detail);

    await logger.logMessage({
      provider: 'meta',
      kind: 'template',
      to,
      templateName,
      params: templateParameters,
      ok: false,
      error: detail
    });

    return { ok: false, error: detail };
  }
}

async function sendTextMessage(toE164, text) {
  const to = (toE164 || '').replace(/\D/g, '').replace(/^\+/, '');
  const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text }
  };

  try {
    const res = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    await logger.logMessage({
      provider: 'meta',
      kind: 'text',
      to,
      text,
      ok: true,
      response: res.data
    });

    return { ok: true, data: res.data };
  } catch (err) {
    const detail = err.response ? err.response.data : err.message;
    console.error('[whatsapp] sendTextMessage error:', detail);

    await logger.logMessage({
      provider: 'meta',
      kind: 'text',
      to,
      text,
      ok: false,
      error: detail
    });

    return { ok: false, error: detail };
  }
}

module.exports = { sendTemplateMessage, sendTextMessage, company };