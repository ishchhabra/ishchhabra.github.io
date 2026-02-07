/**
 * Builds the sandbox iframe srcdoc HTML.
 *
 * Security model:
 * - CSP blocks all direct network/resource access (defense in depth)
 * - fetch, XMLHttpRequest, navigator.sendBeacon, document.cookie are monkey-patched
 *   to route through the host's capability broker via postMessage
 * - The broker prompts the user for permission (allow once/always, deny once/always)
 * - If approved, the HOST performs the fetch and returns the result
 * - If denied, the promise rejects with a permission error
 */
export function buildSrcdoc(): string {
  const csp = [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval' https://unpkg.com",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "connect-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
  ].join("; ");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>

  <script src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone@7/babel.min.js"><\/script>

  <script>
  (function() {
    var React = window.React;
    var ReactDOM = window.ReactDOM;
    var Babel = window.Babel;

    /* -------------------------------------------------------------- */
    /*  Capability request transport                                   */
    /* -------------------------------------------------------------- */

    var pendingCapabilities = {};

    function requestCapability(capability, details) {
      var id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      return new Promise(function(resolve, reject) {
        pendingCapabilities[id] = { resolve: resolve, reject: reject };
        parent.postMessage({
          type: 'sandbox:capability',
          id: id,
          capability: capability,
          details: details,
        }, '*');
      });
    }

    /* -------------------------------------------------------------- */
    /*  Monkey-patch fetch                                             */
    /*  Normal fetch() calls go through the capability broker.         */
    /*  The host prompts the user, and if approved, does the real      */
    /*  fetch and returns a simulated Response.                        */
    /* -------------------------------------------------------------- */

    window.fetch = function sandboxFetch(input, init) {
      var url = typeof input === 'string' ? input : (input && input.url ? input.url : String(input));
      var opts = init || {};
      var method = opts.method || 'GET';
      var headers = {};
      if (opts.headers) {
        if (typeof opts.headers.forEach === 'function') {
          opts.headers.forEach(function(v, k) { headers[k] = v; });
        } else {
          headers = Object.assign({}, opts.headers);
        }
      }
      var body = typeof opts.body === 'string' ? opts.body : undefined;

      return requestCapability('fetch', {
        url: url,
        method: method,
        headers: headers,
        body: body,
      }).then(function(result) {
        // Build a Response-like object from the broker result
        var resBody = result.body || '';
        var resStatus = result.status || 200;
        var resStatusText = result.statusText || 'OK';
        var resHeaders = result.headers || {};

        return {
          ok: resStatus >= 200 && resStatus < 300,
          status: resStatus,
          statusText: resStatusText,
          headers: {
            get: function(name) { return resHeaders[name.toLowerCase()] || null; },
            has: function(name) { return name.toLowerCase() in resHeaders; },
            forEach: function(cb) {
              Object.keys(resHeaders).forEach(function(k) { cb(resHeaders[k], k); });
            },
          },
          text: function() { return Promise.resolve(resBody); },
          json: function() { return Promise.resolve(JSON.parse(resBody)); },
          blob: function() { return Promise.resolve(new Blob([resBody])); },
          arrayBuffer: function() {
            var enc = new TextEncoder();
            return Promise.resolve(enc.encode(resBody).buffer);
          },
          clone: function() { return this; },
        };
      });
    };

    // Kill XMLHttpRequest — force everything through fetch
    window.XMLHttpRequest = function() {
      throw new Error('[Sandbox] XMLHttpRequest is not available. Use fetch() instead — it goes through the capability broker.');
    };

    // Kill sendBeacon
    if (navigator.sendBeacon) {
      navigator.sendBeacon = function() {
        console.warn('[Sandbox] sendBeacon is blocked.');
        return false;
      };
    }

    /* -------------------------------------------------------------- */
    /*  Monkey-patch document.cookie                                   */
    /*  Reads and writes go through the capability broker.             */
    /*  Uses a local cache for sync getter; writes are async.           */
    /* -------------------------------------------------------------- */

    var cookieCache = '';
    var cookieReadPending = false;

    Object.defineProperty(document, 'cookie', {
      get: function() {
        if (!cookieReadPending) {
          cookieReadPending = true;
          requestCapability('cookie', { operation: 'read' }).then(function(r) {
            cookieCache = (r && r.value) || '';
          }).catch(function() {});
        }
        return cookieCache;
      },
      set: function(value) {
        var val = typeof value === 'string' ? value : String(value);
        requestCapability('cookie', { operation: 'write', value: val })
          .then(function() {
            return requestCapability('cookie', { operation: 'read' });
          })
          .then(function(r) {
            cookieCache = (r && r.value) || '';
          })
          .catch(function() {});
      },
      configurable: true,
      enumerable: true,
    });

    /* -------------------------------------------------------------- */
    /*  SDK object (also available as global for direct use)           */
    /* -------------------------------------------------------------- */

    var sdk = {
      fetch: window.fetch,
      storage: {
        get: function(key) {
          return requestCapability('storage', { operation: 'get', key: key });
        },
        set: function(key, value) {
          return requestCapability('storage', { operation: 'set', key: key, value: value });
        },
        remove: function(key) {
          return requestCapability('storage', { operation: 'remove', key: key });
        },
        clear: function() {
          return requestCapability('storage', { operation: 'clear' });
        },
      },
      clipboard: {
        read: function() {
          return requestCapability('clipboard', { operation: 'read' });
        },
        write: function(text) {
          return requestCapability('clipboard', { operation: 'write', text: text });
        },
      },
      cookie: {
        get: function() {
          return requestCapability('cookie', { operation: 'read' }).then(function(r) {
            cookieCache = (r && r.value) || '';
            return cookieCache;
          });
        },
        set: function(value) {
          var val = typeof value === 'string' ? value : String(value);
          return requestCapability('cookie', { operation: 'write', value: val })
            .then(function() {
              return requestCapability('cookie', { operation: 'read' });
            })
            .then(function(r) {
              cookieCache = (r && r.value) || '';
              return cookieCache;
            });
        },
      },
    };

    window.__SANDBOX_SDK__ = sdk;

    /* -------------------------------------------------------------- */
    /*  Module registry                                                */
    /* -------------------------------------------------------------- */

    var MODULES = {
      'react': React,
      'react-dom': ReactDOM,
      'react-dom/client': ReactDOM,
      'react/jsx-runtime': {
        jsx: React.createElement,
        jsxs: React.createElement,
        Fragment: React.Fragment,
      },
      '@sandbox/sdk': sdk,
    };

    /* -------------------------------------------------------------- */
    /*  Error boundary (catches React render errors)                   */
    /* -------------------------------------------------------------- */

    function SandboxBoundary(props) {
      React.Component.call(this, props);
      this.state = { hasError: false };
    }
    SandboxBoundary.prototype = Object.create(React.Component.prototype);
    SandboxBoundary.prototype.constructor = SandboxBoundary;
    SandboxBoundary.getDerivedStateFromError = function() {
      return { hasError: true };
    };
    SandboxBoundary.prototype.componentDidCatch = function(error) {
      parent.postMessage({
        type: 'sandbox:error',
        error: { message: error.message, stack: error.stack },
      }, '*');
    };
    SandboxBoundary.prototype.render = function() {
      if (this.state.hasError) return null;
      return this.props.children;
    };

    /* -------------------------------------------------------------- */
    /*  Render reporter (sends sandbox:rendered after React commits)   */
    /* -------------------------------------------------------------- */

    function RenderReporter(props) {
      React.useEffect(function() {
        parent.postMessage({ type: 'sandbox:rendered', success: true }, '*');
      }, []);
      return props.children;
    }

    /* -------------------------------------------------------------- */
    /*  Global error handlers (catch anything React misses)            */
    /* -------------------------------------------------------------- */

    window.addEventListener('error', function(e) {
      parent.postMessage({
        type: 'sandbox:error',
        error: {
          message: e.message || String(e),
          stack: e.error ? e.error.stack : '',
        },
      }, '*');
    });

    window.addEventListener('unhandledrejection', function(e) {
      var msg = e.reason ? (e.reason.message || String(e.reason)) : 'Unhandled promise rejection';
      var stack = e.reason && e.reason.stack ? e.reason.stack : '';
      parent.postMessage({
        type: 'sandbox:error',
        error: { message: msg, stack: stack },
      }, '*');
    });

    /* -------------------------------------------------------------- */
    /*  Render engine                                                  */
    /* -------------------------------------------------------------- */

    var currentRoot = null;
    var currentComponent = null;
    var renderGeneration = 0;

    function run(code, props) {
      var transformed = Babel.transform(code, {
        presets: [['react'], ['env', { modules: 'cjs' }]],
      }).code;

      var exports = {};
      var module = { exports: exports };

      var require = function(name) {
        if (MODULES[name]) return MODULES[name];
        throw new Error('[Sandbox] Module not available: ' + name);
      };

      var fn = new Function('require', 'exports', 'module', 'React', 'sandbox', transformed);
      fn(require, exports, module, React, sdk);

      var Component = module.exports.default || module.exports;
      if (typeof Component !== 'function') {
        throw new Error('[Sandbox] Code must export a React component as default');
      }

      if (!currentRoot) {
        currentRoot = ReactDOM.createRoot(document.getElementById('root'));
      }
      currentComponent = Component;
      renderGeneration++;

      // Wrap in error boundary + render reporter.
      // key={renderGeneration} remounts on each run() so:
      //   - SandboxBoundary resets its error state
      //   - RenderReporter fires useEffect once after React commits
      currentRoot.render(
        React.createElement(SandboxBoundary, { key: renderGeneration },
          React.createElement(RenderReporter, { key: renderGeneration },
            React.createElement(Component, props)
          )
        )
      );
    }

    /* -------------------------------------------------------------- */
    /*  Message handler                                                */
    /* -------------------------------------------------------------- */

    setInterval(function() {
      parent.postMessage({ type: 'sandbox:heartbeat' }, '*');
    }, 1000);

    window.addEventListener('message', function(e) {
      try {
        if (e.data.type === 'sandbox:render') {
          run(e.data.code, e.data.props || {});
          // sandbox:rendered is sent by RenderReporter after React commits
        }
        if (e.data.type === 'sandbox:update-props') {
          if (currentComponent && currentRoot) {
            // Reuse same renderGeneration — RenderReporter stays mounted, no duplicate message
            currentRoot.render(
              React.createElement(SandboxBoundary, { key: renderGeneration },
                React.createElement(RenderReporter, { key: renderGeneration },
                  React.createElement(currentComponent, e.data.props)
                )
              )
            );
          }
        }
        if (e.data.type === 'sandbox:capability-response') {
          var pending = pendingCapabilities[e.data.id];
          if (pending) {
            delete pendingCapabilities[e.data.id];
            if (e.data.error) {
              pending.reject(new Error(e.data.error));
            } else {
              pending.resolve(e.data.result);
            }
          }
        }
      } catch (err) {
        parent.postMessage({
          type: 'sandbox:error',
          error: { message: err.message, stack: err.stack },
        }, '*');
      }
    });

    parent.postMessage({ type: 'sandbox:ready' }, '*');
  })();
  <\/script>
</body>
</html>`;
}
