'use strict';

// Catch errors the right way.
chrome.runtime.getBackgroundPage( (bgWindow) =>
  bgWindow.apis.errorHandlers.installListenersOn(
    window, 'DBG', async() => {
      // Imports:
      // If chrome.* API callback is not timeouted, then you errors are swallowed.
      const timeouted = bgWindow.utils.timeouted;

//=================================================

const setStatusTo = (msg) => document.getElementById('status').innerHTML = msg;

const red = (text) => '<span style="color: red">' + text + '</span>';

const editor = window.ace.edit('editor');
editor.getSession().setOptions({
  mode: 'ace/mode/javascript',
  useSoftTabs: true,
});

const onProxyChange = (details) => {

  const lvl = details.levelOfControl;
  const ifControllable = lvl.endsWith('this_extension');
  document.getElementById('control-status').innerHTML = ifControllable ? lvl : red(lvl) + '!';

};

chrome.proxy.settings.onChange.addListener(onProxyChange);

const readProxySettings = () => {

  return new Promise((resolve) =>
    chrome.proxy.settings.get({}, timeouted(resolve) )
  );

};

onProxyChange( await readProxySettings() );

async function _read() {

  const details = await readProxySettings();
  const pac = details.value.pacScript;
  const data = pac && pac.data || 'PAC script is not installed.';
  editor.setValue( data );

}

document.querySelector('#read-button').onclick = _read;

document.querySelector('#save-button').onclick = () => {

  const config = {
    mode: 'pac_script',
    pacScript: {
      mandatory: false,
      data: editor.getValue(),
    },
  };
  chrome.proxy.settings.set( {value: config}, () => alert('Saved!') );

};

document.querySelector('#clear-button').onclick = () => {

  chrome.proxy.settings.clear({}, () => {

    alert('Cleared! Reading...');
    _read();

  });

};

// BENCHMARKING

const benchStartsMark = '\n\n//%#@@@@@@ BENCH_STARTS @@@@@@#%';

const writeProxySettings = (pacData) => {

  return new Promise((resolve) => chrome.proxy.settings.set({

    value: {
      mode: 'pac_script',
      pacScript: {
        data: pacData,
      },
    }

  }, timeouted(resolve)) );

};

const deleteBenchmark = async() => {

  const details = await readProxySettings();

  if (
    !details.levelOfControl.endsWith('by_this_extension')
  ) {
    setStatusTo(red('Other extension is in control!'));
    return;
  }

  const pac = details.value.pacScript;
  if (pac === undefined) {
    setStatusTo(red('Set some PAC-script first!'));
    return;
  }
  if (!pac.data) {
    setStatusTo(red('PAC data is empty. Did nothing.'));
    return;
  }
  // Delete old modifications.
  pac.data = pac.data.replace(
    new RegExp(benchStartsMark + '[\\s\\S]*$', 'g'),
    ''
  );
  /a/.test('a'); // GC RegExp.input and friends.

  await writeProxySettings(pac.data);

  return pac.data;

};

document.querySelector('#bench-button').onclick = async() => {

  const pacData = await deleteBenchmark();
  if(pacData === undefined) {
    return;
  }

  const testedHost = document.getElementById('bench-hostname').value;

  const newPac = (pacData || '') +
  `${ benchStartsMark }
/******/
/******/${ Math.random().toFixed(3) }; // Purge the previous state (global context).
/******/;+function(global) {
/******/  "use strict";
/******/
/******/  alert("GLOBAL CONTEXT WAS RESET!");
/******/  const originalFindProxyForURL = FindProxyForURL;
/******/  let ansLen = 0;
/******/  let timeAcc = 0;
/******/  const blockRequest = "PROXY localhost:19999";
/******/  global.FindProxyForURL = function(url, host) {
/******/
/******/    if (host !== "${testedHost}") {
/******/      if (host === 'bench-get-total-time') {
/******/        throw timeAcc + ' ' + ansLen;
/******/      }
/******/      return blockRequest;
/******/    }
/******/
/******/    const start = Date.now();
/******/    const ans = originalFindProxyForURL(url, host);
/******/    const fin = Date.now();
/******/    alert("START:" + start);
/******/    alert("FIN:" + fin);
/******/    timeAcc += fin - start;
/******/    ansLen += ans.length;
/******/
/******/    // Don't send nerwork requests.
/******/    return blockRequest;
/******/
/******/  };
/******/
/******/}(this);
  `;

  await writeProxySettings(newPac);

  const numberOfRequests = 100;

  const onError = timeouted((details) => {

    /*
      Example:
        details: "line: 7: Uncaught 222 777",
        error: "net::ERR_PAC_SCRIPT_FAILED",
        fatal: false,
    */
    if (details.error !== 'net::ERR_PAC_SCRIPT_FAILED') {
      return;
    }
    console.warn('PAC ERROR', details);
    const [time, ansLen] = details.details.replace(/^.+?Uncaught /g, '').split(' ');
    console.log(`${time}ms, ${time/numberOfRequests}ms per request, checksum: ${ansLen}`);

    chrome.proxy.onProxyError.removeListener(onError);

  });

  bgWindow.apis.errorHandlers.switch('off');

  chrome.proxy.onProxyError.addListener(onError);
  let p = Promise.resolve();
  let i = -1;
  while(++i < numberOfRequests) {
    p = p
      .then( () => fetch(`http://${testedHost}`) )
      .catch(() => {});
  }
  await p;
  await fetch('http://bench-get-total-time').catch(() => {});

  await deleteBenchmark();
  bgWindow.apis.errorHandlers.switch('on');
  //window.setTimeout(() => bgWindow.apis.errorHandlers.switch('on'), 1000);

};

document.querySelector('#kill-button').onclick = () => {

  chrome.runtime.reload();

};

//=================================================
}));
