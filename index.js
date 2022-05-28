const express = require("express");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
var jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRATE_KEY);
app.use(express.static("public"));

const port = process.env.PORT || 5000;

// middleware
app.use(cors());
const corsOptions = {
  origin: "http://localhost:3000",
  credentials: true, //access-control-allow-credentials:true
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
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

    const productCollection = client.db("db-garden").collection("tools");
    const userCollection = client.db("db-garden").collection("users");
    const orderCollection = client.db("db-garden").collection("orders");
    const reviewCollection = client.db("db-garden").collection("rating");
    const paymentCollection = client.db("db-garden").collection("payments");

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    };
    /* ========Start Product Section ======= */
    // get tools for display into home page
    app.get("/home-tools", async (req, res) => {
      const cursor = await productCollection
        .find()
        .sort({ $natural: -1 })
        .limit(6)
        .toArray();
      res.send(cursor);
    });
    // get all tools for display
    app.get("/tools", async (req, res) => {
      const cursor = await productCollection.find().toArray();
      res.send(cursor);
    });

    // find single tool
    app.get("/tools/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await productCollection.findOne(query);
      res.send(result);
    });

    app.get("/admin/products", async (req, res) => {
      const products = await productCollection
        .find()
        .sort({ $natural: -1 })
        .toArray();
      res.send(products);
    });

    // add product
    app.post("/admin/product", async (req, res) => {
      const data = req.body;
      const result = await productCollection.insertOne(data);
      res.send(result);
    });

    // get single product

    app.get("/admin/product/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await productCollection.findOne(query);
      res.send(result);
    });

    // Update Product
    app.put("/admin/product/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: status,
      };
      const result = await productCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Delete Product
    app.delete("/admin/product/:id", async (req, res) => {
      const { id } = req.params;

      const query = { _id: ObjectId(id) };
      const result = await productCollection.deleteOne(query);
      res.send(result);
    });

    /* ==========End product Sectioin ========== */
    /* ======= User Order ===== */
    app.post("/order", async (req, res) => {
      const data = req.body;

      const result = await orderCollection.insertOne(data);
      const query = { name: data.title };
      const tools = await productCollection.findOne(query);
      if (tools) {
        const newQty = parseInt(tools.avilQty) - parseInt(data.quantity);
        tools.avilQty = newQty;
        const filter = { _id: ObjectId(tools._id) };
        const updateDoc = {
          $set: tools,
        };
        const updatedResult = await productCollection.updateOne(
          filter,
          updateDoc
        );
        res.send(updatedResult);
      }
    });

    /* =======Order Section Start ======== */

    // get all user order
    app.get("/orders", async (req, res) => {
      const orders = await orderCollection.find().toArray();
      res.send(orders);
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

    // payment
    app.get("/orders/payment/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await orderCollection.findOne(query);
      res.send(result);
    });
    app.patch("/orders/payment/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          transactionId: data.transactionId,
          status: "Processing",
        },
      };
      const updatedResult = await orderCollection.updateOne(filter, updateDoc);
      const newPayment = await paymentCollection.insertOne(data);

      res.send(updatedResult);
    });

    /* Delete and Order */

    app.delete("/orders/:id", async (req, res) => {
      const { id } = req.params;
      const productId = req.body.productid;
      const toolQuery = { _id: ObjectId(productId) };

      const query = { _id: ObjectId(id) };
      const deleteTools = await orderCollection.findOne(query);
      const result = await orderCollection.deleteOne(query);
      if (result.acknowledged) {
        const tools = await productCollection.findOne(toolQuery);
        if (tools) {
          const newQty =
            parseInt(tools.avilQty) + parseInt(deleteTools.quantity);
          tools.avilQty = newQty;
          const filter = { _id: ObjectId(tools._id) };
          const updateDoc = {
            $set: tools,
          };
          const updatedResult = await productCollection.updateOne(
            filter,
            updateDoc
          );
          res.send(updatedResult);
        }
      }
    });
    app.delete("/admin/orders/:id", async (req, res) => {
      const { id } = req.params;
      const productId = req.body.productid;
      const toolQuery = { _id: ObjectId(productId) };
      const query = { _id: ObjectId(id) };
      const deleteTools = await orderCollection.findOne(query);
      const result = await orderCollection.deleteOne(query);
      if (result.acknowledged) {
        const tools = await productCollection.findOne(toolQuery);
        if (tools) {
          const newQty =
            parseInt(tools.avilQty) + parseInt(deleteTools.quantity);
          tools.avilQty = newQty;
          const filter = { _id: ObjectId(tools._id) };
          const updateDoc = {
            $set: tools,
          };
          const updatedResult = await productCollection.updateOne(
            filter,
            updateDoc
          );
          res.send(updatedResult);
        }
      }
    });

    // Update order Status
    app.put("/admin/orders/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: status,
      };
      const result = await orderCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    /* =====Order section End */

    // find all users
    app.get("/users/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const decodedEmail = req.decoded.email;
      const email = req.params.email;
      if (email === decodedEmail) {
        const users = await userCollection.find().toArray();
        res.send(users);
      } else {
        res.status(403).send({ message: "Unauthorization access" });
      }
    });

    // Delete a user

    app.delete("/users/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: ObjectId(id) };
      const remainingUser = await userCollection.deleteOne(query);
      res.send(remainingUser);
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
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user?.role === "admin";
      res.send({ admin: isAdmin });
    });

    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requesterEmail = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requesterEmail,
      });
      const query = { email: email };
      if (requesterAccount.role === "admin") {
        const updateDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    });

    /* =========Review Section ========= */
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
    app.get("/reviews", async (req, res) => {
      const reviews = await reviewCollection
        .find()
        .sort({ $natural: -1 })
        .toArray();
      res.send(reviews);
    });

    /* =====================Profile Section Start==================== */
    // Get user Profile
    app.get("/profile/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    app.get("/profile/user/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const requester = req.decoded.email;
      if (email === requester) {
        const result = await userCollection.findOne(query);
        res.send(result);
      }
    });

    // Update User Profile

    app.put("/profile/user/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: data,
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Profile Common Route

    app.put("/profile/users/:id", function (req, res) {
      const id = req.params.id;
      const data = req.body;
      console.log(id, data);
      res.send(data);
    });
    /* =====================Profile Section End==================== */

    /* Payment integration */
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.totalPrice;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: price,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    /* ========Review Section End ======= */
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("Car is running"));
app.listen(port, () => console.log(`Takus app listening on port ${port}!`));
