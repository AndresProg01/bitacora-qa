const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Crear carpeta de uploads si no existe
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configurar multer para guardar archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generar nombre único para el archivo
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${timestamp}-${randomStr}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static('public'));

// RUTAS

// Servir HTML principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint para recibir datos de proyectos/casos (sincronización con Make)
// El webhook de Make del HTML seguirá funcionando, pero también guardamos aquí
app.post('/api/sync', (req, res) => {
  const { accion, tipo, key, payload } = req.body;

  if (accion === 'guardar') {
    console.log(`📌 Sincronizado: ${tipo} "${key}"`);
  } else if (accion === 'borrar') {
    console.log(`🗑️  Borrado: ${key}`);
  } else if (accion === 'listar') {
    console.log(`📋 Listando datos compartidos`);
  }

  res.json({ ok: true, message: 'Sincronizado' });
});

// Endpoint para SUBIR archivos (evidencia, reportes, etc.)
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileUrl = `/uploads/${req.file.filename}`;
  console.log(`✅ Archivo subido: ${req.file.originalname} (${req.file.size} bytes)`);

  res.json({
    ok: true,
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    url: fileUrl,
    timestamp: new Date().toISOString()
  });
});

// Endpoint para LISTAR archivos subidos
app.get('/api/files', (req, res) => {
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'No se pueden listar los archivos' });
    }

    const fileList = files.map(filename => {
      const filePath = path.join(uploadsDir, filename);
      const stats = fs.statSync(filePath);
      return {
        filename: filename,
        size: stats.size,
        uploaded: stats.birthtime,
        url: `/uploads/${filename}`
      };
    }).sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));

    res.json({ files: fileList, total: fileList.length });
  });
});

// Endpoint para DESCARGAR un archivo
app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(uploadsDir, filename);

  // Seguridad: verificar que el archivo existe y está en uploads/
  if (!filepath.startsWith(uploadsDir) || !fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  res.download(filepath);
});

// Endpoint para BORRAR un archivo
app.delete('/api/files/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(uploadsDir, filename);

  // Seguridad
  if (!filepath.startsWith(uploadsDir)) {
    return res.status(403).json({ error: 'No permitido' });
  }

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  fs.unlink(filepath, (err) => {
    if (err) {
      return res.status(500).json({ error: 'No se pudo borrar el archivo' });
    }
    console.log(`🗑️  Archivo borrado: ${filename}`);
    res.json({ ok: true, message: 'Archivo borrado' });
  });
});

// Estadísticas
app.get('/api/stats', (req, res) => {
  fs.readdir(uploadsDir, (err, files) => {
    let totalSize = 0;

    if (!err && files.length) {
      files.forEach(f => {
        try {
          const stats = fs.statSync(path.join(uploadsDir, f));
          totalSize += stats.size;
        } catch(e) {}
      });
    }

    res.json({
      totalFiles: files ? files.length : 0,
      totalSize: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      serverTime: new Date().toISOString()
    });
  });
});

// Manejo de errores 404
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor Bitácora QA corriendo en puerto ${PORT}`);
  console.log(`📱 URL: http://localhost:${PORT}`);
  console.log(`📁 Uploads guardados en: ${uploadsDir}\n`);
});
