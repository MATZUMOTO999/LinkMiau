const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'links.json');

app.use(express.json());
app.use(express.static('public'));

// Asegurar carpeta data
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// Cargar/guardar datos
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return {};
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Crear enlace mezclado
app.post('/api/create', (req, res) => {
  const { targetUrl, title } = req.body;
  
  if (!targetUrl) {
    return res.status(400).json({ error: 'URL destino requerida' });
  }
  
  // Validar URL
  try {
    new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'URL inválida' });
  }
  
  const data = loadData();
  const shortId = uuidv4().substring(0, 8);
  
  data[shortId] = {
    id: shortId,
    targetUrl,
    title: title || 'Sin título',
    createdAt: new Date().toISOString(),
    clicks: []
  };
  
  saveData(data);
  
  const baseUrl = req.protocol + '://' + req.get('host');
  res.json({
    shortUrl: `${baseUrl}/go/${shortId}`,
    dashboardUrl: `${baseUrl}/dashboard/${shortId}`,
    id: shortId
  });
});

// Redireccionar y registrar datos
app.get('/go/:id', (req, res) => {
  const data = loadData();
  const link = data[req.params.id];
  
  if (!link) {
    return res.status(404).send('Enlace no encontrado');
  }
  
  // Capturar información del visitante
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const ua = new UAParser(req.headers['user-agent']);
  const device = ua.getDevice();
  const os = ua.getOS();
  const browser = ua.getBrowser();
  
  // Geolocalización por IP (aproximada)
  const geo = geoip.lookup(ip.replace('::ffff:', ''));
  
  const clickData = {
    timestamp: new Date().toISOString(),
    ip: ip,
    device: {
      type: device.type || 'desktop',
      vendor: device.vendor || 'Desconocido',
      model: device.model || 'Desconocido'
    },
    os: {
      name: os.name || 'Desconocido',
      version: os.version || ''
    },
    browser: {
      name: browser.name || 'Desconocido',
      version: browser.version || ''
    },
    location: geo ? {
      country: geo.country,
      region: geo.region,
      city: geo.city,
      ll: geo.ll // [lat, lon] aproximado
    } : null,
    userAgent: req.headers['user-agent']
  };
  
  link.clicks.push(clickData);
  saveData(data);
  
  // Redirigir al enlace original
  res.redirect(link.targetUrl);
});

// Obtener datos del dashboard
app.get('/api/stats/:id', (req, res) => {
  const data = loadData();
  const link = data[req.params.id];
  
  if (!link) {
    return res.status(404).json({ error: 'No encontrado' });
  }
  
  res.json(link);
});

// Listar todos los enlaces
app.get('/api/links', (req, res) => {
  const data = loadData();
  res.json(Object.values(data));
});

// Página del dashboard
app.get('/dashboard/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor en http://localhost:${PORT}`);
});