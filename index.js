import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;
const app = express();
app.use(cors());
app.use(express.json());

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
const TTL_MINUTOS = 30;

// ============================
// RUTA ROOT (verificación)
// ============================
app.get("/", (req, res) => {
  res.send("🚲 SecurityBike API OK");
});

// ============================
// CREAR TABLA SI NO EXISTE
// ============================
const initDB = async () => {
  try {
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
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL
      );
    `);
    console.log("✅ Tabla 'zonas_rojas' verificada/creada.");
  } catch (error) {
    console.error("❌ Error creando/verificando tabla:", error.message);
    process.exit(1);
  }
};

initDB();

// ============================
// REGISTRAR ROBO (POST /robo)
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
    telefonoReportante
  } = req.body;

  if (
    lat === undefined ||
    lng === undefined ||
    isNaN(Number(lat)) ||
    isNaN(Number(lng))
  ) {
    return res.status(400).json({ error: "lat y lng válidos son obligatorios" });
  }

  const ahora = new Date();
  const expira = new Date(ahora.getTime() + TTL_MINUTOS * 60 * 1000);

  try {
    await pool.query(
      `INSERT INTO zonas_rojas (
        lat, lng, zona, hora, tipo_robo, fecha,
        tipo_bici, marca_bici, modelo_bici, anio_bici,
        numero_serie, color, descripcion_bici,
        nombre_reportante, email_reportante, telefono_reportante,
        expires_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,
        $11,$12,$13,
        $14,$15,$16,
        $17
      )`,
      [
        lat,
        lng,
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
        expira
      ]
    );

    res.json({
      mensaje: "🚨 Robo registrado correctamente",
      expira
    });
  } catch (err) {
    console.error("❌ Error en POST /robo:", err.message);
    res.status(500).json({ error: "Error guardando el robo", detalle: err.message });
  }
});

// ============================
// OBTENER ZONAS ROJAS ACTIVAS (GET /zonas-rojas)
// ============================
app.get("/zonas-rojas", async (req, res) => {
  try {
    await pool.query(`DELETE FROM zonas_rojas WHERE expires_at < NOW()`);
    const result = await pool.query(`
      SELECT
        lat, lng, zona, hora, tipo_robo AS "tipoRobo", fecha,
        tipo_bici AS "tipoBici",
        marca_bici AS "marcaBici",
        modelo_bici AS "modeloBici",
        anio_bici AS "anioBici",
        numero_serie AS "numeroSerie",
        color, descripcion_bici AS "descripcionBici"
      FROM zonas_rojas
      ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error en GET /zonas-rojas:", err.message);
    res.status(500).json({ error: "Error obteniendo zonas rojas", detalle: err.message });
  }
});

// ============================
// INICIAR SERVIDOR
// ============================
app.listen(PORT, () => {
  console.log(`🚀 SecurityBike API corriendo en puerto ${PORT}`);
});

export default app;
