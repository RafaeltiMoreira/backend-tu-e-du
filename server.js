import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MercadoPagoConfig, Preference } from "mercadopago";

dotenv.config();

const app = express();
const connect = process.env.PORT || "3001";
const portUrl = process.env.DATABASE_URL_PORT;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
}));

app.use(express.json());

const token = process.env.TOKEN_ACCESS
//const integrator = process.env.SECRET_INTEGRATOR
const mercadoPagoClient = new MercadoPagoConfig({
  accessToken: token,
  //integrator_id: integrator
})

app.get("/order", function (_, res) {
  res.send("Servidor está funcionando");
});

app.post("/create_preference", async function (req, res) {
  try {
    const externalReference = req.body.external_reference;
    const idempotencyKey = req.headers["X-Idempotency-Key"];
    console.log("Received request body:", req.body);

    if (!req.body.items || req.body.items.length === 0) {
      throw new Error("Dados incompletos para criar a preferência.");
    }

    const items = req.body.items.map(item => ({
      id: item.id,
      title: item.title,
      description: item.description,
      picture_url: item.picture_url,
      category_id: item.category_id,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      currency_id: "BRL",
    }));

    const body = {
      external_reference: externalReference,
      items,
      back_urls: {
        success: "https://tuaneeduan.com.br/ecommerce",
        failure: "https://tuaneeduan.com.br/ecommerce",
        pending: "https://tuaneeduan.com.br/ecommerce",
      },
      auto_return: "approved",
      notification_url: `${portUrl}/order/webhook`,
      payment_methods: {
        installments: 12
      },
    };

    console.log("Formatted body:", body);

    const preference = new Preference(mercadoPagoClient);
    const result = await preference.create({ body, idempotencyKey });

    res.json({
      id: result.body.id,
    });

  } catch (error) {
    console.log("Erro ao criar preferência de pagamento:", error);
    res.status(500).json({
      error: "Erro ao criar preferência de pagamento",
      message: error.message,
    });
  }
});

app.post("/webhook", async function (req, res) {
  const paymentId = req.query.id;
  try {
    const response = await fetch(`https://api.mercadopago.com/v1payments/${paymentId}`, {
      method: 'GET',
      headers: {
        "Authorization": `Bearer ${mercadoPagoClient.accessToken}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log(data);
    }
    res.sendStatus(200);
  } catch (error) {
    console.error("Error", error);
    res.sendStatus(500);
  }
})

app.listen(connect, () => {
  console.log(`Servidor executando na porta ${connect}`)
})

