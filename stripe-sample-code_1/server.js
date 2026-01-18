const express = require("express");
const app = express();
const { resolve } = require("path");
// This is your test secret API key.
const stripe = require("stripe")("sk_test_PLACEHOLDER");

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const createLocation = async () => {
  const location = await stripe.terminal.locations.create({
    display_name: 'HQ',
    address: {
      line1: '1272 Valencia Street',
      city: 'San Francisco',
      state: 'CA',
      country: 'US',
      postal_code: '94110',
    },
  });

  return location;
};



// The ConnectionToken's secret lets you connect to any Stripe Terminal reader
// and take payments with your Stripe account.
// Be sure to authenticate the endpoint for creating connection tokens.
app.post("/connection_token", async (req, res) => {
  let connectionToken = await stripe.terminal.connectionTokens.create();
  res.json({ secret: connectionToken.secret });
})

app.post("/create_payment_intent", async (req, res) => {
  // For Terminal payments, the 'payment_method_types' parameter must include
  // 'card_present'.
  // To automatically capture funds when a charge is authorized,
  // set `capture_method` to `automatic`.
  const intent = await stripe.paymentIntents.create({
    amount: req.body.amount,
    currency: 'usd',
    payment_method_types: [
      'card_present',
    ],
    capture_method: 'automatic',
    payment_method_options: {
      card_present: {
        capture_method: 'manual_preferred'
      }
    }
  });
  res.json(intent);
});



app.post("/capture_payment_intent", async (req, res) => {
  const intent = await stripe.paymentIntents.capture(req.body.payment_intent_id);
  res.send(intent);
});

app.listen(4242, () => console.log('Node server listening on port 4242!'));