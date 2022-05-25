const express = require("express");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
var jwt = require("jsonwebtoken");

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

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();

    const toolsCollection = client.db("db-garden").collection("tools");
    const userCollection = client.db("db-garden").collection("users");
    const orderCollection = client.db("db-garden").collection("orders");
    const reviewCollection = client.db("db-garden").collection("rating");

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

    /* ======= User Order ===== */
    app.post("/order", async (req, res) => {
      const data = req.body;

      const result = await orderCollection.insertOne(data);
      const query = { name: data.title };
      const tools = await toolsCollection.findOne(query);
      if (tools) {
        const newQty = tools.avilQty - parseInt(data.quantity);
        tools.avilQty = newQty;
        const filter = { _id: ObjectId(tools._id) };
        const updateDoc = {
          $set: tools,
        };
        const updatedResutl = await toolsCollection.updateOne(
          filter,
          updateDoc
        );
        res.send(result);
      }
    });

    app.post("/reviews", async (req, res) => {
      const data = req.body;
      const result = await reviewCollection.insertOne(data);
      res.send(result);
    });
    app.get("/reviews/:email", verifyJWT, async (req, res) => {
      const decodedEmail = req.decoded.email;
      const email = req.params.email;
      if (email === decodedEmail) {
        const query = { email: email };
        const review = await reviewCollection.find(query).toArray();
        res.send(review);
      } else {
        res.status(403).send({ message: "Unauthorization access" });
      }
    });

    app.delete("/reviews/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: ObjectId(id) };
      const result = await reviewCollection.deleteOne(query);
      res.send(result);
    });

    /* ===== User Orders ==== */
    app.get("/orders/:email", verifyJWT, async (req, res) => {
      const decodedEmail = req.decoded.email;
      const email = req.params.email;
      if (email === decodedEmail) {
        const query = { email: email };
        const orders = await orderCollection.find(query).toArray();
        res.send(orders);
      } else {
        res.status(403).send({ message: "Unauthorization access" });
      }
    });

    /* Delete and Order */

    app.delete("/orders/:id", async (req, res) => {
      const { id } = req.params;
      const productId = req.headers.productid;
      const toolQuery = { _id: ObjectId(productId) };

      const query = { _id: ObjectId(id) };
      const deleteTools = await orderCollection.findOne(query);
      const result = await orderCollection.deleteOne(query);
      if (result.acknowledged) {
        const tools = await toolsCollection.findOne(toolQuery);
        if (tools) {
          const newQty = tools.avilQty + parseInt(deleteTools.quantity);
          tools.avilQty = newQty;
          const filter = { _id: ObjectId(tools._id) };
          const updateDoc = {
            $set: tools,
          };
          const updatedResutl = await toolsCollection.updateOne(
            filter,
            updateDoc
          );
          res.send(result);
        }
      }
    });

    // find all users
    app.get("/users/:email", verifyJWT, async (req, res) => {
      const decodedEmail = req.decoded.email;
      const email = req.params.email;
      if (email === decodedEmail) {
        const users = await userCollection.find().toArray();
        res.send(users);
      } else {
        res.status(403).send({ message: "Unauthorization access" });
      }
    });

    /* ========= User section ======== */
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1d" }
      );
      res.send({ result, token });
    });

    /* =========Admin Section======== */

    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requesterEmail = req.decoded.email;
      const requesterAccount = await userCollection.findOne({email: requesterEmail})
      const query = { email: email };
      if (requesterAccount.role === 'admin') {
        const updateDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(query, updateDoc);
        console.log(result)
        res.send(result);
      }
    });

    /* ====== End Admin Section====== */
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("Hello World!"));
app.listen(port, () => console.log(`Example app listening on port ${port}!`));
