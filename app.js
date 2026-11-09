require('dotenv').config({ quiet: true });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const db = require('./db');
const { authenticate } = require('./utils/auth');
const Auth = require('./controllers/Auth');
const Enquiries = require('./controllers/Enquiries');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
// Behind a hosting proxy: req.ip is the caller's address.
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

// CORS_ORIGINS: comma-separated web addresses allowed to call the API (the admin panel).
// Empty: any origin, for local development only.
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : {}));

app.get('/health', (req, res) => res.json({ ok: true }));

// Every /admin route needs a signed-in admin, except POST /admin/login.
app.use('/admin', authenticate);
app.use('/admin', Auth);
app.use('/admin', Enquiries);

app.use((req, res) => res.status(404).json({ message: 'Not found.' }));

const PORT = Number(process.env.PORT) || 5011;

app.listen(PORT, () => {
    console.log(`FDSC Admin API running on port ${PORT}`);
    db.warmUp();
});
