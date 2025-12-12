import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Base de datos simple (temporal)
let zonasRojas = [];

// Endpoint para reportar robo
app.post("/robo", (req, res) => {
  const { lat, lng, zona } = req.body;

  if (!lat || !lng || !zona) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  const nuevoRobo = {
    lat,
    lng,
    zona,
    fecha: new Date()
  };

  zonasRojas.push(nuevoRobo);

  res.json({
    mensaje: "Robo registrado",
    robo: nuevoRobo
  });
});

// Endpoint para obtener zonas rojas
app.get("/zonas-rojas", (req, res) => {
  res.json(zonasRojas);
});

// Servidor
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
