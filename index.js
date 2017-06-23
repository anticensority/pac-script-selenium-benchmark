'use strict';

const Path = require('path');
const Fs = require('fs');

require('chromedriver');
const Webdriver = require('selenium-webdriver');
const [By, until] = [Webdriver.By, Webdriver.until];
const extPath = Path.join(__dirname, './extension');

const chromeCapabilities = Webdriver.Capabilities.chrome();
chromeCapabilities.set('chromeOptions', {
  'args': [
    `--binary=/usr/bin/google-chrome-unstable`,
    `--load-extension=${extPath}`,
    '--js-flags=--expose-gc',
  ],
});

const driver = new Webdriver.Builder()
  .forBrowser('chrome')
  .withCapabilities(chromeCapabilities)
  .build();

const extId = 'mejjkoaohhllibjejhochmagfabjfmle';
const benchUrl = `chrome-extension://${extId}/pages/bench/index.html`;

driver.get(benchUrl);

/*
driver.wait(until.alertIsPresent());
driver.switchTo().alert().accept();
driver.quit();
*/
