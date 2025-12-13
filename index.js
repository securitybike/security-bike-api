import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// zonas en memoria
let zonasRojas = [];

// duración de zona roja: 30 minutos
const TTL_MINUTOS = 30;

// registrar robo
app.post("/robo", (req, res) => {
  const { lat, lng, zona } = req.body;

  if (!lat || !lng) {
    return res.status(400).json({ error: "lat y lng son obligatorios" });
  }

  const ahora = new Date();
  const expira = new Date(ahora.getTime() + TTL_MINUTOS * 60 * 1000);

  zonasRojas.push({
    lat,
    lng,
    zona: zona || "Zona reportada",
    fecha: ahora,
    expiresAt: expira
  });

  res.json({ mensaje: "Robo registrado", expira });
});

// obtener zonas rojas activas
app.get("/zonas-rojas", (req, res) => {
  const ahora = new Date();

  // eliminar zonas vencidas
  zonasRojas = zonasRojas.filter(z => new Date(z.expiresAt) > ahora);

  res.json(zonasRojas);
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});

