var terminal = StripeTerminal.create({
  onFetchConnectionToken: fetchConnectionToken,
  onUnexpectedReaderDisconnect: unexpectedDisconnect,
});

function unexpectedDisconnect() {
  // In this function, your app should notify the user that the reader disconnected.
  // You can also include a way to attempt to reconnect to a reader.
  console.log("Disconnected from reader")
}

function fetchConnectionToken() {
  // Do not cache or hardcode the ConnectionToken. The SDK manages the ConnectionToken's lifecycle.
  return fetch('/connection_token', { method: "POST" })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      return data.secret;
    });
}

// Handler for a "Discover readers" button
function discoverReaderHandler() {
  var config = {simulated: true};
  terminal.discoverReaders(config).then(function(discoverResult) {
    if (discoverResult.error) {
      console.log('Failed to discover: ', discoverResult.error);
    } else if (discoverResult.discoveredReaders.length === 0) {
        console.log('No available readers.');
    } else {
        discoveredReaders = discoverResult.discoveredReaders;
        log('terminal.discoverReaders', discoveredReaders);
    }
  });
}

// Handler for a "Connect Reader" button
function connectReaderHandler(discoveredReaders) {
  // Just select the first reader here.
  var selectedReader = discoveredReaders[0];
  terminal.connectReader(selectedReader).then(function(connectResult) {
    if (connectResult.error) {
      console.log('Failed to connect: ', connectResult.error);
    } else {
        console.log('Connected to reader: ', connectResult.reader.label);
        log('terminal.connectReader', connectResult)
    }
  });
}

function fetchPaymentIntentClientSecret(amount) {
  const bodyContent = JSON.stringify({ amount: amount });
  return fetch('/create_payment_intent', {
    method: "POST",
    headers: {
      'Content-Type': 'application/json'
    },
    body: bodyContent
  })
  .then(function(response) {
    return response.json();
  })
  .then(function(data) {
    return data.client_secret;
  });
}

function collectPayment(amount) {
  fetchPaymentIntentClientSecret(amount).then(function(client_secret) {
      // Use test card number to simulate different payment flows within your point of sale application
      terminal.setSimulatorConfiguration({testCardNumber: '4242424242424242'});
      terminal.collectPaymentMethod(client_secret).then(function(result) {
      if (result.error) {
        // Placeholder for handling result.error
      } else {
          log('terminal.collectPaymentMethod', result.paymentIntent);
          terminal.processPayment(result.paymentIntent).then(function(result) {
          if (result.error) {
            console.log(result.error)
          } else if (result.paymentIntent) {
              paymentIntentId = result.paymentIntent.id;
              log('terminal.processPayment', result.paymentIntent);
          }
        });
      }
    });
  });
}

function capture(paymentIntentId) {
  return fetch('/capture_payment_intent', {
    method: "POST",
    headers: {
        'Content-Type': 'application/json'
    },
      body: JSON.stringify({"payment_intent_id": paymentIntentId})
  })
  .then(function(response) {
    return response.json();
  })
  .then(function(data) {
    log('server.capture', data);
  });
}

var discoveredReaders;
var paymentIntentId;

const discoverButton = document.getElementById('discover-button');
discoverButton.addEventListener('click', async (event) => {
  discoverReaderHandler();
});

const connectButton = document.getElementById('connect-button');
connectButton.addEventListener('click', async (event) => {
  connectReaderHandler(discoveredReaders);
});

const collectButton = document.getElementById('collect-button');
collectButton.addEventListener('click', async (event) => {
  amount = document.getElementById("amount-input").value
  collectPayment(amount);
});

const captureButton = document.getElementById('capture-button');
captureButton.addEventListener('click', async (event) => {
  capture(paymentIntentId);
});

function log(method, message) {
  var logs = document.getElementById("logs");
  var title = document.createElement("div");
  var log = document.createElement("div");
  var lineCol = document.createElement("div");
  var logCol = document.createElement("div");
  title.classList.add('row');
  title.classList.add('log-title');
  title.textContent = method;
  log.classList.add('row');
  log.classList.add('log');
  var hr = document.createElement("hr");
  var pre = document.createElement("pre");
  var code = document.createElement("code");
  code.textContent = formatJson(JSON.stringify(message, undefined, 2));
  pre.append(code);
  log.append(pre);
  logs.prepend(hr);
  logs.prepend(log);
  logs.prepend(title);
}

function stringLengthOfInt(number) {
  return number.toString().length;
}

function padSpaces(lineNumber, fixedWidth) {
  // Always indent by 2 and then maybe more, based on the width of the line
  // number.
  return " ".repeat(2 + fixedWidth - stringLengthOfInt(lineNumber));
}

function formatJson(message) {
  var lines = message.split('\n');
  var json = "";
  var lineNumberFixedWidth = stringLengthOfInt(lines.length);
  for(var i = 1; i <= lines.length; i += 1) {
    line = i + padSpaces(i, lineNumberFixedWidth) + lines[i-1];
    json = json + line + '\n';
  }
  return json
}