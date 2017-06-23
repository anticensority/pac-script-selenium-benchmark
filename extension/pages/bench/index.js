'use strict';

// Catch errors the right way.
chrome.runtime.getBackgroundPage( (bgWindow) =>
  bgWindow.apis.errorHandlers.installListenersOn(
    window, 'DBG', async() => {
      // Imports:
      const timeouted = bgWindow.utils.timeouted;
//===============================================

  const testedHost = document.getElementById('host-input').value || 'example.com';

  const patchPac = function (pacStr) {

    return pacStr + `
/******/;
/******/${ Math.random().toFixed(3) }; // Purge the previous state (global context).
/******/(function(global) {
/******/  "use strict";
/******/
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
/******/    timeAcc += fin - start;
/******/    ansLen += ans.length;
/******/
/******/    // Don't send nerwork requests.
/******/    return blockRequest;
/******/
/******/  };
/******/
/******/})(this);`

  };

  const makeRequest = () =>
    fetch(`http://${testedHost}`).catch(() => {/* Swallow errors. */});

  let setTime;
  const parseTime1 = await new Promise((resolve) => {

    const pacInput = document.getElementById('pac-input');
    const handleFiles = function() {

      const file = this.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {

        setTime = performance.now();
        chrome.proxy.settings.set(
          {
            value: {
              mode: 'pac_script',
              pacScript: {
                mandatory: true,
                data: patchPac(event.target.result),
              },
            }
          },
          () => resolve(performance.now() - setTime)
        );

      }

      reader.readAsText(file);

    };
    pacInput.addEventListener('change', handleFiles, false);

  });


  // Force PAC-script parsing, if not already.
  await makeRequest();
  const parseTime2 = performance.now() - setTime;

  const getMemUsageAsync = async(oldMem = 0) => {

    const pmem = await new Promise((resolve) => chrome.processes.getProcessInfo(
      Array.from(Array(50).keys()),
      true,
      (ps) => resolve(
        Object.keys(ps)
          .map((k) => ps[k])
          .filter((p) => p.type === 'utility')[0].privateMemory
      )
    ));

    return (pmem / 1024 / 1024) - oldMem;

  };

  let callTime, ansLen;
  let errorResolve = () => {};
  const onError = timeouted((details) => {

    console.log('OOON ERROR!', details)
    /*
      Example:
        details: "line: 7: Uncaught 222 777",
        error: "net::ERR_PAC_SCRIPT_FAILED",
        fatal: false,
    */
    if (details.error !== 'net::ERR_PAC_SCRIPT_FAILED') {
      // net::ERR_PROXY_CONNECTION_FAILED
      console.log('NOT INTERESTED');
      return;
    }
    console.log('WOW!');
    const msg = details.details;
    console.log('Got msg');
    const msg2 = msg.replace(/^.+?Uncaught /g, '');
    console.log('Replaced,', msg2);
    window.foo = msg2;
    [callTime, ansLen] = msg2.split(' ');
    console.log('Removing...')
    chrome.proxy.onProxyError.removeListener(onError);
    console.log('Resolving...');
    errorResolve({ callTime: parseFloat(callTime), ansLen: parseInt(ansLen) });

  });

  const getTimeAsync = () => {

    return new Promise((res) => {

      errorResolve = res;
      fetch('http://bench-get-total-time').catch(() => {});

    });

  };

  bgWindow.apis.errorHandlers.switch('off');
  chrome.proxy.onProxyError.addListener(onError);

  gc(); // Maybe not in PAC.
  const startMem = await getMemUsageAsync();
  const startTime = performance.now();

  const numberOfRequests = 100;
  let i = -1;
  console.log('Looping...')
  while(++i < numberOfRequests) {
    await makeRequest();
  }

  const totalTime = performance.now() - startTime;
  gc(); // Maybe not in PAC.
  const finMem = await getMemUsageAsync();

  console.log('Get times...');
  const t = await getTimeAsync();
  console.log('Output...');
  document.getElementById('status').innerText = `

BOOT   | set after: ${parseTime1.toFixed(1)}ms / First request after: ${parseTime2.toFixed(1)}ms
MEM    | Start: ${startMem.toFixed(1)}M / Fin: ${finMem.toFixed(1)}M / Diff: ${(finMem - startMem).toFixed(1)}M
TIME   | FindProxyForURL: ${t.callTime.toFixed(1)}ms, Total: ${totalTime.toFixed(1)}ms
CHKSUM | ${t.ansLen}

  `.trim();
  //window.close();


}));
