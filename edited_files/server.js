import Rx from 'rxjs/Rx';
import express from 'express';
import sockclient from 'socket.io-client';
import { apolloUploadExpress } from 'apollo-upload-server';
import path from 'path';
import fs from 'fs';
import mic from 'mic';
import https from 'https';
import _ from 'lodash';

import socketio from 'socket.io';
import graphqlHTTP from 'express-graphql';
const speech = require('@google-cloud/speech')({
  projectId: 'aimlab-33639',
  keyFilename: './certificates/AIMLAB-2e8c663cf573.json',
});

const socketRegistry = {};

import httpsRedirectConfig from './configurations/httpsRedirectConfig';
import responseHeaderConfig from './configurations/responseHeaderConfig';
import { rxBleContents, rxBleWifiNet } from './ble';
import {
  CommandProcessor, updateWifiNetPromise,
} from './ble/bleStreamProcessors';
import { bleEventStream } from './ble';
import { Schema } from './gql/gqlsetup';
import { convertMotorValues } from './motor/motormap';
import { LightsController } from './gpio/lightsController';
import { path2word } from './database/path2word';


// Setup speech
const speechConfig = {
  encoding: 'LINEAR16',
  languageCode: 'en-US',
  sampleRateHertz: 16000,
};

let targetWord = 'hello';
let regexp = new RegExp(`\\b${targetWord}\\b`);

// Setup mic
const micInstance = mic({ rate: '16000', channels: '1', debug: true });
const micInputStream = micInstance.getAudioStream();
let audioData = [];

micInputStream.on('error', (err) => {
  console.log(`Error in Input Stream: ${err}`);
});

micInputStream.on('data', (data) => {
  audioData.push(data);
});

micInputStream.on('startComplete', () => {
  console.log('Got SIGNAL startComplete');
  micInstance.pause();
});

micInputStream.on('stopComplete', () => {
  console.log('Got SIGNAL stopComplete');
});

micInputStream.on('pauseComplete', () => {
  console.log('Got SIGNAL pauseComplete');
  if (audioData.length > 0) {
    const audioBuffer = Buffer.concat(audioData);
    audioData = [];

    fs.writeFile('/home/pi/data/upload.raw', audioBuffer, err => {
      if (err) throw err;
      speech.recognize('/home/pi/data/upload.raw', speechConfig)
      .then(data => {
        const results = data[0];
        console.log(results);
        regexp = new RegExp(`\\b${targetWord}\\b`)
        if (results.match(regexp) !== null) {
          bleEventStream.dispatch({ type: 'payload', payload: 11 });
        } else {
          bleEventStream.dispatch({ type: 'payload', payload: 12 });
        }
      }).catch(error => console.log('Error occured: ', error));
    });
  }
});

micInputStream.on('resumeComplete', () => {
  console.log('Got SIGNAL resumeComplete');
  setTimeout(() => micInstance.pause(), 5000);
});

micInputStream.on('processExitComplete', () => {
  console.log('Got SIGNAL processExitComplete');
});

micInstance.start();

// Web server setup
const host = '192.168.43.1';
const sslPort = 443;
const insecurePort = 80;
const app = express();
const redirectApp = express();
const io = socketio(7070);

const serverUrl = 'http://localhost:7000';

const socketOptions = {
  transports: ['websocket'],
  'force new connection': true,
};

const motorClient = sockclient.connect(serverUrl, socketOptions);
const rxGPIOButton = Rx.Observable.fromEvent(motorClient, 'gpio_button_press');
const rxLircButton = Rx.Observable.fromEvent(motorClient, 'lirc_button_press');

const circleRGB = new LightsController();
const options = {
  key: fs.readFileSync('./certificates/domain.key'),
  cert: fs.readFileSync('./certificates/domain.crt'),
};


httpsRedirectConfig(redirectApp);
responseHeaderConfig(app);

app.use(apolloUploadExpress({
  uploadDir: '/home/pi/uploads',
}));

app.use('/graphql', graphqlHTTP((req) => {
  const context = 'users:admin';
  return { schema: Schema, graphiql: true, context, pretty: true };
}));

// Serve static assets
app.use(express.static(path.resolve(__dirname, 'build')));

// Always return the main index.html, so react-router render the route in the client
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'build', 'index.html'));
});

redirectApp.listen(insecurePort, (err) => {
  if (err) {
    console.log(err);
  } else {
    console.log(`Express server listening at http://${host}:${insecurePort}`);
  }
});

io.on('connection', (socket) => {
  socket.emit('registration', { type: 'registration', key: 'raspberry' });

  socket.on('register', (data) => {
    socketRegistry[data.key] = socket.id;
    console.log(socketRegistry);
    const commandProcessor = new CommandProcessor(1, socket, motorClient, circleRGB);
    rxBleContents.subscribe(commandProcessor.observer);
    rxGPIOButton.subscribe(commandProcessor.observer);
    rxLircButton.subscribe(commandProcessor.observer);
  });

  socket.on('display:content:playing', () => {
    micInstance.pause();
  });

  socket.on('display:content:stopped', (rawfilePath) => {
    targetWord = path2word[rawfilePath];
    micInstance.resume();
  });

  socket.on('disconnect', () => {
    const key = _.findKey(socketRegistry, socket.id);
    delete socketRegistry[key];
  });
});

rxBleWifiNet
  .flatMap(action => updateWifiNetPromise(action, 'admin'))
  .subscribe(
    val => console.log(val),
    err => console.log(err),
    () => console.log('completed')
  );

const secureServer = https.createServer(options, app);

const realtimeio = socketio(secureServer);

realtimeio.on('connection', (socket) => {
  socket.emit('registration', { type: 'registration', key: 'raspberry' });

  socket.on('register', (data) => {
    socketRegistry[data.key] = socket.id;
    console.log(socketRegistry);
  });

  socket.on('disconnect', () => {
    const key = _.findKey(socketRegistry, socket.id);
    delete socketRegistry[key];
    console.log('Client disconnected.');
  });

  socket.on('motorValues', (data) => {
    const motorValues = convertMotorValues(data.payload);
    console.log(data)
    console.log(data.payload)
    console.log(motorValues)
    motorClient.emit('moveCommand', motorValues);
  });

  socket.on('lightValues', (payload) => {
    circleRGB.setState(payload);
  });
});

secureServer.listen(sslPort);

motorClient.on('connect', () => {
  motorClient.emit('diagnostics', [1, 2, 3, 4]);
});

motorClient.on('diagError', e => {
  console.error(e);
});

motorClient.on('diagComplete', m => {
  console.log(m);
});
