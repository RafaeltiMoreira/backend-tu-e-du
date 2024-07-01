import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MercadoPagoConfig, Preference } from "mercadopago";
import { MongoClient } from 'mongodb';

dotenv.config();

const dbUrl = process.env.DATABASE_URL
const dbName = "mongodb-mp"

async function main() {

  const client = new MongoClient(dbUrl)
  console.log('Conectando ao banco de dados...')
  try {
    await client.connect();
    console.log('Banco de dados conectado com sucesso!');
  } catch (error) {
    console.error('Erro ao conectar ao banco de dados:', error);
    process.exit(1);
  }

  const db = client.db(dbName)
  const collection = db.collection('orders')

  const port = process.env.PORT || process.env.URL_PORT;
  const urlState = process.env.URL_CONNECT;
  const app = express();

  app.use(express.json());
  app.use(cors());

  const token = process.env.TOKEN_ACCESS
  const integrator = process.env.SECRET_INTEGRATOR
  const mercadoPagoClient = new MercadoPagoConfig({
    accessToken: token,
    integrator_id: integrator
  })

  app.get("/order", function (_, res) {
    res.send("Servidor está funcionando");
  });

  app.post("/order/create_preference", async function (req, res) {
    console.log("Requisição recebida em /order/create_preference");
    try {
      const externalReference = req.body.external_reference;
      const idempotencyKey = req.headers["X-Idempotency-Key"];
      const { items, payer } = req.body;
      console.log("Received request body:", req.body);

      if (!items || items.length === 0) {
        throw new Error("Dados incompletos para criar a preferência.");
      }

      // Verificar se o pedido já existe no banco de dados
      console.log("External Reference:", externalReference);
      const existingOrder = await collection.findOne({ external_reference: externalReference });
      if (existingOrder) {
        console.log("Pedido já existe no banco de dados:", existingOrder);
        return res.json({ id: existingOrder.preference_id });
      }

      const dataItems = items.map(item => ({
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
        items: dataItems,
        payer: {
          first_name: payer.first_name,
          last_name: payer.last_name
        },
        back_urls: {
          success: "https://tuaneeduan.com.br",
          failure: "https://tuaneeduan.com.br",
          pending: "https://tuaneeduan.com.br",
        },
        auto_return: "approved",
        notification_url: `${urlState}/webhook`,
        payment_methods: {
          installments: 12
        },
      };

      const preference = new Preference(mercadoPagoClient);
      const result = await preference.create({ body, idempotencyKey });

      // Salvar o pedido bd
      const newOrder = {
        external_reference: externalReference,
        items: dataItems,
        payer: {
          first_name: payer.first_name,
          last_name: payer.last_name,
        },
        preference_id: result.id,
        created_at: new Date()
      };
      await collection.insertOne(newOrder);

      res.json({
        id: result.id,
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
          "Authorization": `Bearer ${mercadoPagoClient.accessToken}`,
          "x-integrator-id": `Bearer ${mercadoPagoClient.integrator_id}`,
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log(data);
        const result = await collection.findOneAndUpdate(
          { preference_id: data.preference_id },
          {
            $set: {
              payment_id: data.id,
              status: data.status,
            }
          },
          { returnOriginal: false }
        );

        if (!result.value) {
          console.log("Pedido não encontrado");
        } else {
          console.log("Pedido atualizado:", result.value);
        }
      }
      res.sendStatus(200);
    } catch (error) {
      console.error("Error", error);
      res.sendStatus(500);
    }
  });

  app.listen(port, () => {
    console.log(`Servidor executando na porta ${port}`)
  })
}

main()