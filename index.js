import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const app = express();
app.use(cors());

// ✅ LÍMITE DE PAYLOAD (esto ayuda, pero Base64 grande igual puede dar 413 en Render)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

const PORT = process.env.PORT || 3000;

// ============================
// CONEXIÓN A POSTGRES (Render)
// ============================
let pool;
try {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  console.log("✅ Conexión a PostgreSQL creada correctamente.");
} catch (error) {
  console.error("❌ Error creando conexión a PostgreSQL:", error.message);
  process.exit(1);
}

// ============================
// CONFIGURACIÓN
// ============================
const TTL_MINUTOS = Number(process.env.TTL_MINUTOS || 30);

// ============================
// RUTA ROOT
// ============================
app.get("/", (req, res) => {
  res.send("🚲 SecurityBike API OK");
});

// ============================
// CREAR TABLA + COLUMNAS (idempotente)
// ============================
const initDB = async () => {
  try {
    // 1) Crea tabla base si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS zonas_rojas (
        id SERIAL PRIMARY KEY,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        zona TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP
      );
    `);

    // 2) Asegura columnas nuevas (no falla si ya existen)
    await pool.query(`
      ALTER TABLE zonas_rojas
        ADD COLUMN IF NOT EXISTS hora TEXT,
        ADD COLUMN IF NOT EXISTS tipo_robo TEXT,
        ADD COLUMN IF NOT EXISTS fecha TEXT,
        ADD COLUMN IF NOT EXISTS tipo_bici TEXT,
        ADD COLUMN IF NOT EXISTS marca_bici TEXT,
        ADD COLUMN IF NOT EXISTS modelo_bici TEXT,
        ADD COLUMN IF NOT EXISTS anio_bici TEXT,
        ADD COLUMN IF NOT EXISTS numero_serie TEXT,
        ADD COLUMN IF NOT EXISTS color TEXT,
        ADD COLUMN IF NOT EXISTS descripcion_bici TEXT,
        ADD COLUMN IF NOT EXISTS nombre_reportante TEXT,
        ADD COLUMN IF NOT EXISTS email_reportante TEXT,
        ADD COLUMN IF NOT EXISTS telefono_reportante TEXT,

        -- ✅ NUEVO: guardar fotos como URLs (NO base64)
        ADD COLUMN IF NOT EXISTS foto_urls TEXT[];
    `);

    // 3) Asegura expires_at con default
    await pool.query(`
      ALTER TABLE zonas_rojas
        ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
    `);

    await pool.query(`
      UPDATE zonas_rojas
      SET expires_at = NOW() + INTERVAL '30 minutes'
      WHERE expires_at IS NULL;
    `);

    await pool.query(`
      ALTER TABLE zonas_rojas
        ALTER COLUMN expires_at SET DEFAULT NOW() + INTERVAL '30 minutes';
    `);

    console.log("✅ BD lista: tabla/columnas verificadas.");
  } catch (error) {
    console.error("❌ Error inicializando BD:", error.message);
    process.exit(1);
  }
};

initDB().catch(console.error);

// ============================
// POST /robo  (guardar reporte)
// ============================
app.post("/robo", async (req, res) => {
  const {
    lat,
    lng,
    zona,
    hora,
    tipoRobo,
    fecha,
    tipoBici,
    marcaBici,
    modeloBici,
    anioBici,
    numeroSerie,
    color,
    descripcionBici,
    nombreReportante,
    emailReportante,
    telefonoReportante,

    // ✅ NUEVO: URLs de fotos (array de strings)
    fotoUrls,
  } = req.body;

  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return res.status(400).json({ error: "lat y lng válidos son obligatorios" });
  }

  // Normaliza fotoUrls a array de strings
  const urls = Array.isArray(fotoUrls)
    ? fotoUrls.filter((u) => typeof u === "string" && u.trim().length > 0)
    : [];

  const ahora = new Date();
  const expira = new Date(ahora.getTime() + TTL_MINUTOS * 60 * 1000);

  try {
    await pool.query(
      `INSERT INTO zonas_rojas (
        lat, lng, zona, hora, tipo_robo, fecha,
        tipo_bici, marca_bici, modelo_bici, anio_bici,
        numero_serie, color, descripcion_bici,
        nombre_reportante, email_reportante, telefono_reportante,
        foto_urls,
        expires_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,
        $11,$12,$13,
        $14,$15,$16,
        $17,
        $18
      )`,
      [
        latNum,
        lngNum,
        zona || "No especificado",
        hora || null,
        tipoRobo || null,
        fecha || null,
        tipoBici || null,
        marcaBici || null,
        modeloBici || null,
        anioBici || null,
        numeroSerie || null,
        color || null,
        descripcionBici || null,
        nombreReportante || null,
        emailReportante || null,
        telefonoReportante || null,
        urls.length ? urls : null,
        expira,
      ]
    );

    return res.json({
      mensaje: "🚨 Robo registrado correctamente",
      expira,
      fotosGuardadas: urls.length,
    });
  } catch (err) {
    console.error("❌ Error en POST /robo:", err.message);
    return res
      .status(500)
      .json({ error: "Error guardando el robo", detalle: err.message });
  }
});

// ============================
// GET /zonas-rojas (devolver activos)
// ============================
app.get("/zonas-rojas", async (req, res) => {
  try {
    await pool.query(`DELETE FROM zonas_rojas WHERE expires_at < NOW()`);

    const result = await pool.query(`
      SELECT
        lat,
        lng,
        zona,
        hora,
        tipo_robo AS "tipoRobo",
        fecha,
        tipo_bici AS "tipoBici",
        marca_bici AS "marcaBici",
        modelo_bici AS "modeloBici",
        anio_bici AS "anioBici",
        numero_serie AS "numeroSerie",
        color,
        descripcion_bici AS "descripcionBici",
        nombre_reportante AS "nombreReportante",
        email_reportante AS "emailReportante",
        telefono_reportante AS "telefonoReportante",
        COALESCE(foto_urls, ARRAY[]::text[]) AS "fotoUrls"
      FROM zonas_rojas
      ORDER BY created_at DESC
    `);

    return res.json(result.rows);
  } catch (err) {
    console.error("❌ Error en GET /zonas-rojas:", err.message);
    return res
      .status(500)
      .json({ error: "Error obteniendo zonas rojas", detalle: err.message });
  }
});

// ============================
// START SERVER
// ============================
app.listen(PORT, () => {
  console.log(`🚀 SecurityBike API corriendo en puerto ${PORT}`);
});

export default app;
