const express = require("express");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");

const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_ADMIN}:${process.env.DB_PASSWORD}@cluster0.ho7bb.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    await client.connect();

    const toolsCollection = client.db("db-garden").collection("tools");

    // get tools for display into home page
    app.get("/home-tools", async (req, res) => {
      const cursor = await toolsCollection
        .find()
        .sort({ $natural: -1 })
        .limit(6)
        .toArray();
      res.send(cursor);
    });
    // get all tools for display
    app.get("/tools", async (req, res) => {
      const cursor = await toolsCollection.find().toArray();
      res.send(cursor);
    });

    // find single tool
    app.get("/tools/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await toolsCollection.findOne(query);
      res.send(result);
    });
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("Hello World!"));
app.listen(port, () => console.log(`Example app listening on port ${port}!`));
