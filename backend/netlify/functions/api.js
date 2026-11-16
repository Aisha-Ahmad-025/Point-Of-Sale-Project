
const serverless = require('serverless-http');

const { createApp } = require('../../src/app');
const { validateConfig } = require('../../src/config/env');
const { connectDB } = require('../../src/config/db');
const Settings = require('../../src/models/Settings');

const app = createApp();
const serverlessHandler = serverless(app);

let initializationPromise;

async function initialize() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      validateConfig();
      await connectDB();
      await Settings.get();
    })().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  await initializationPromise;
}

exports.handler = async (event, context) => {
  await initialize();
  return serverlessHandler(event, context);
};
