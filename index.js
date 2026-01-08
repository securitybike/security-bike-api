import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;
const app = express();
app.use(cors());

// Evita 413 en requests normales (igual RECOMENDADO usar Cloudinary directo)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const TTL_MINUTOS = Number(process.env.TTL_MINUTOS || 30);

app.get("/", (req, res) => res.send("🚲 SecurityBike API OK"));

const initDB = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS zonas_rojas (
      id SERIAL PRIMARY KEY,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      zona TEXT,
      hora TEXT,
      tipo_robo TEXT,
      fecha TEXT,
      tipo_bici TEXT,
      marca_bici TEXT,
      modelo_bici TEXT,
      anio_bici TEXT,
      numero_serie TEXT,
      color TEXT,
      descripcion_bici TEXT,
      nombre_reportante TEXT,
      email_reportante TEXT,
      telefono_reportante TEXT,
      fotos JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL
    );
  `);

  // por si tu tabla ya existía sin fotos
  await pool.query(`
    ALTER TABLE zonas_rojas
    ADD COLUMN IF NOT EXISTS fotos JSONB DEFAULT '[]'::jsonb;
  `);

  console.log("✅ BD lista");
};

initDB().catch((e) => {
  console.error("❌ initDB:", e.message);
  process.exit(1);
});

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
    fotos, // ✅ array de URLs (Cloudinary)
  } = req.body;

  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return res.status(400).json({ error: "lat y lng válidos son obligatorios" });
  }

  const ahora = new Date();
  const expira = new Date(ahora.getTime() + TTL_MINUTOS * 60 * 1000);

  // ✅ Asegurar array
  const fotosArray = Array.isArray(fotos) ? fotos : [];

  try {
    const result = await pool.query(
      `INSERT INTO zonas_rojas (
        lat, lng, zona, hora, tipo_robo, fecha,
        tipo_bici, marca_bici, modelo_bici, anio_bici,
        numero_serie, color, descripcion_bici,
        nombre_reportante, email_reportante, telefono_reportante,
        fotos,
        expires_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,
        $11,$12,$13,
        $14,$15,$16,
        $17,
        $18
      ) RETURNING id, expires_at`,
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
        JSON.stringify(fotosArray), // JSONB
        expira,
      ]
    );

    return res.json({
      mensaje: "🚨 Robo registrado correctamente",
      id: result.rows[0].id,
      expira: result.rows[0].expires_at,
      fotosGuardadas: fotosArray.length,
    });
  } catch (err) {
    console.error("❌ POST /robo:", err.message);
    return res.status(500).json({ error: "Error guardando el robo", detalle: err.message });
  }
});

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
        fotos
      FROM zonas_rojas
      ORDER BY created_at DESC
    `);

    return res.json(result.rows);
  } catch (err) {
    console.error("❌ GET /zonas-rojas:", err.message);
    return res.status(500).json({ error: "Error obteniendo zonas rojas", detalle: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 SecurityBike API corriendo en puerto ${PORT}`));
export default app;
