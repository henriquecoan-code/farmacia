const fs = require('fs').promises;
const path = require('path');

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'whatsapp.log');

async function ensureLogDir() {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch (err) {
    // ignore
  }
}

async function logMessage(entry) {
  try {
    await ensureLogDir();
    const timestamp = new Date().toISOString();
    const payload = Object.assign({ timestamp }, entry);
    await fs.appendFile(LOG_FILE, JSON.stringify(payload) + '\n', 'utf8');
  } catch (err) {
    // If logging fails, do not throw - just write to console
    console.error('[whatsapp logger] failed to write log', err.message || err);
  }
}

module.exports = { logMessage };