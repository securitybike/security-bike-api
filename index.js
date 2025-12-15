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

/* ============================
   CONEXIÓN A POSTGRES (Render)
   ============================ */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/* ============================
   CONFIGURACIÓN
   ============================ */
const TTL_MINUTOS = 30;

/* ============================
   RUTA ROOT (evita Cannot GET /)
   ============================ */
app.get("/", (req, res) => {
  res.send("🚲 SecurityBike API OK");
});

/* ============================
   CREAR TABLA SI NO EXISTE
   ============================ */
const initDB = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS zonas_rojas (
      id SERIAL PRIMARY KEY,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      zona TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL
    );
  `);
};

initDB().catch(console.error);

/* ============================
   REGISTRAR ROBO
   POST /robo
   ============================ */
app.post("/robo", async (req, res) => {
  const { lat, lng, zona } = req.body;

  if (!lat || !lng) {
    return res.status(400).json({ error: "lat y lng son obligatorios" });
  }

  const ahora = new Date();
  const expira = new Date(ahora.getTime() + TTL_MINUTOS * 60 * 1000);

  try {
    await pool.query(
      `INSERT INTO zonas_rojas (lat, lng, zona, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [lat, lng, zona || "Robo de bicicleta", expira]
    );

    res.json({
      mensaje: "🚨 Robo registrado",
      expira
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error guardando el robo" });
  }
});

/* ============================
   OBTENER ZONAS ROJAS ACTIVAS
   GET /zonas-rojas
   ============================ */
app.get("/zonas-rojas", async (req, res) => {
  try {
    // borrar vencidas
    await pool.query(
      `DELETE FROM zonas_rojas WHERE expires_at < NOW()`
    );

    // traer activas
    const result = await pool.query(
      `SELECT lat, lng, zona
       FROM zonas_rojas
       ORDER BY created_at DESC`
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error obteniendo zonas" });
  }
});

/* ============================
   START SERVER
   ============================ */
app.listen(PORT, () => {
  console.log(`🚀 SecurityBike API corriendo en puerto ${PORT}`);
});
