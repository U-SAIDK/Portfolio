/**
 * Standalone Express server for local development without the Netlify CLI.
 *
 * In production the contact form is served by netlify/functions/contact.js.
 * This server exists purely so the site can be developed with a plain
 * static-file server (e.g. VS Code Live Server) instead of `netlify dev`.
 * See ../shared/contact-handler.js for the actual form-handling logic.
 */

'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { handleContactSubmission } = require('../shared/contact-handler');

const app = express();
const PORT = process.env.PORT || 5000;

// Origins used while developing the static site locally.
const ALLOWED_ORIGINS = [
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://127.0.0.1:8888',
  'http://localhost:8888',
  'https://usaidkhan.netlify.app',
];

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (curl, mobile apps, server-to-server) which
      // don't send an Origin header at all.
      if (!origin) return callback(null, true);

      const isLocalNetwork =
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1') ||
        origin.startsWith('http://192.168.');

      if (ALLOWED_ORIGINS.includes(origin) || isLocalNetwork) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
  })
);
app.use(express.json({ limit: '15kb' }));

app.post('/api/contact', async (req, res) => {
  try {
    const { status, body } = await handleContactSubmission(req.body, process.env);
    res.status(status).json(body);
  } catch (err) {
    console.error('Unexpected error processing contact form:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Generic error handler — catches CORS rejections and body-parser errors
// so they come back as JSON instead of Express's default HTML error page.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err.message);
  res.status(err.status || 500).json({ success: false, error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Contact form dev server running on http://localhost:${PORT}`);
});
