/*!
 * main.js —— 规划输入页交互逻辑（纯前端版）。
 *
 * 职责：
 *   1. 用内嵌的 DISTRICT_STREET_COMMUNITY 填充三级联动地址选择器；
 *   2. 管理 amap_js_api_key（JS API Key）与 amap_js_security_code（安全密钥）的 localStorage/sessionStorage 回填；
 *   3. 动态加载高德 JS API 2.0（含 Geocoder / Walking / Driving / Transfer / PlaceSearch 插件）；
 *   4. 维护「必去景点」chips 与「游玩景点数量」1-6 校验；
 *   5. 拦截表单提交，浏览器本地执行 TripEngine.planTrip()，结果写入 sessionStorage 后跳转 result.html；
 *   6. 提交前把表单状态写入 sessionStorage，供 result.html「重新规划」回传还原。
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  // -------------------------------------------------------------------------
  // 错误提示
  // -------------------------------------------------------------------------
  function showError(msg) {
    var box = $('form-error');
    if (!box) return;
    box.textContent = msg || '';
    box.style.display = msg ? 'block' : 'none';
  }

  // -------------------------------------------------------------------------
  // 高德密钥：amap_js_api_key（JS API Key）+ amap_js_security_code（安全密钥）
  // 保留跨页同步回填逻辑：localStorage 优先，sessionStorage 兜底
  // -------------------------------------------------------------------------
  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }
  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }
  function sessionGet(key) {
    try { return sessionStorage.getItem(key); } catch (e) { return null; }
  }
  function sessionSet(key, val) {
    try { sessionStorage.setItem(key, val); } catch (e) {}
  }
  function sessionRemove(key) {
    try { sessionStorage.removeItem(key); } catch (e) {}
  }

  function initKeys() {
    var jsInput = $('amap_js_api_key');
    var secInput = $('amap_js_security_code');
    var saveBox = $('save_keys');

    function renderHint() {
      var saved = !!(storageGet('amap_js_api_key') || storageGet('amap_js_security_code'));
      var hint = $('keys_hint');
      if (hint) hint.style.display = saved ? 'block' : 'none';
      if (saveBox) saveBox.checked = saved;
    }

    // 回填：localStorage 优先，sessionStorage 兜底
    var jsLocal = storageGet('amap_js_api_key');
    var jsSession = sessionGet('amap_js_api_key');
    if (jsInput) jsInput.value = jsLocal || jsSession || '';

    var secLocal = storageGet('amap_js_security_code');
    var secSession = sessionGet('amap_js_security_code');
    if (secInput) secInput.value = secLocal || secSession || '';

    renderHint();

    if ($('keys_clear')) {
      $('keys_clear').addEventListener('click', function () {
        storageRemove('amap_js_api_key');
        sessionRemove('amap_js_api_key');
        storageRemove('amap_js_security_code');
        sessionRemove('amap_js_security_code');
        if (jsInput) jsInput.value = '';
        if (secInput) secInput.value = '';
        renderHint();
      });
    }

    if (saveBox) {
      saveBox.addEventListener('change', function () {
        if (!saveBox.checked) {
          storageRemove('amap_js_api_key');
          storageRemove('amap_js_security_code');
          renderHint();
        }
      });
    }
  }

  // -------------------------------------------------------------------------
  // 三级联动地址选择器
  // -------------------------------------------------------------------------
  function initAddressSelectors() {
    var tree = window.TripEngine.DISTRICT_STREET_COMMUNITY;

    function resetSelect(sel, placeholder, disabled) {
      sel.innerHTML = '';
      var opt = document.createElement('option');
      opt.value = '';
      opt.textContent = placeholder;
      sel.appendChild(opt);
      sel.value = '';
      sel.disabled = disabled;
    }

    function getFullAddress(prefix) {
      var parts = [];
      ['district', 'street', 'community'].forEach(function (kind) {
        var v = $(prefix + '_' + kind).value;
        if (v) parts.push(v);
      });
      return parts.join(' / ');
    }

    function updateDisplay(prefix) {
      var display = $(prefix + '_display');
      var full = getFullAddress(prefix);
      if (full) {
        display.textContent = full;
        display.classList.remove('empty');
      } else {
        display.textContent = '未选择（请通过下方下拉选择小区）';
        display.classList.add('empty');
      }
    }

    function clearDropdown(prefix) {
      var districtSel = $(prefix + '_district');
      var streetSel = $(prefix + '_street');
      var communitySel = $(prefix + '_community');
      districtSel.value = '';
      resetSelect(streetSel, '请选择街道', true);
      resetSelect(communitySel, '请选择小区', true);
      updateDisplay(prefix);
    }

    function initGroup(prefix) {
      var districtSel = $(prefix + '_district');
      var streetSel = $(prefix + '_street');
      var communitySel = $(prefix + '_community');
      var manualInput = $(prefix + '_manual');

      Object.keys(tree).forEach(function (district) {
        var opt = document.createElement('option');
        opt.value = district;
        opt.textContent = district;
        districtSel.appendChild(opt);
      });

      districtSel.addEventListener('change', function () {
        var district = districtSel.value;
        resetSelect(streetSel, '请选择街道', true);
        resetSelect(communitySel, '请选择小区', true);
        manualInput.value = '';
        if (!district) { updateDisplay(prefix); return; }
        var streets = tree[district] || {};
        Object.keys(streets).forEach(function (street) {
          var opt = document.createElement('option');
          opt.value = street;
          opt.textContent = street;
          streetSel.appendChild(opt);
        });
        streetSel.disabled = false;
        updateDisplay(prefix);
      });

      streetSel.addEventListener('change', function () {
        var district = districtSel.value;
        var street = streetSel.value;
        resetSelect(communitySel, '请选择小区', true);
        manualInput.value = '';
        if (!district || !street) { updateDisplay(prefix); return; }
        var communities = tree[district][street] || [];
        communities.forEach(function (c) {
          var opt = document.createElement('option');
          opt.value = c;
          opt.textContent = c;
          communitySel.appendChild(opt);
        });
        communitySel.disabled = false;
        updateDisplay(prefix);
      });

      communitySel.addEventListener('change', function () {
        manualInput.value = '';
        updateDisplay(prefix);
      });

      manualInput.addEventListener('input', function () {
        if (manualInput.value.trim()) clearDropdown(prefix);
      });
    }

    initGroup('origin');
    initGroup('destination');
  }

  // -------------------------------------------------------------------------
  // 必去景点 chips
  // -------------------------------------------------------------------------
  var mustVisitItems = [];

  function renderChips() {
    var chips = $('must-visit-chips');
    if (!chips) return;
    chips.innerHTML = '';
    mustVisitItems.forEach(function (name, idx) {
      var chip = document.createElement('span');
      chip.className = 'chip';

      var text = document.createElement('span');
      text.className = 'chip-text';
      text.textContent = name;

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'chip-remove';
      remove.setAttribute('aria-label', '删除 ' + name);
      remove.textContent = '×';
      remove.addEventListener('click', function () {
        mustVisitItems.splice(idx, 1);
        renderChips();
      });

      chip.appendChild(text);
      chip.appendChild(remove);
      chips.appendChild(chip);
    });

    var full = mustVisitItems.length >= 6;
    var input = $('must-visit-input');
    var addBtn = $('must-visit-add');
    if (input) input.disabled = full;
    if (addBtn) addBtn.disabled = full;
  }

  function addMustVisit() {
    var input = $('must-visit-input');
    var err = $('must-visit-error');
    var v = (input && input.value ? input.value : '').trim();
    if (!v) return;
    if (mustVisitItems.length >= 6) {
      if (err) err.style.display = 'block';
      return;
    }
    if (mustVisitItems.indexOf(v) !== -1) {
      input.value = '';
      return;
    }
    if (err) err.style.display = 'none';
    mustVisitItems.push(v);
    input.value = '';
    renderChips();
  }

  function initMustVisit() {
    var addBtn = $('must-visit-add');
    var input = $('must-visit-input');
    if (addBtn) addBtn.addEventListener('click', addMustVisit);
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          addMustVisit();
        }
      });
    }
    renderChips();
  }

  // -------------------------------------------------------------------------
  // 游玩景点数量校验
  // -------------------------------------------------------------------------
  function validateCount() {
    var input = $('count');
    var err = $('count-error');
    if (!input || !err) return true;
    var v = parseInt(input.value, 10);
    var valid = !(isNaN(v) || v < 1 || v > 6);
    err.style.display = valid ? 'none' : 'block';
    return valid;
  }

  function initCount() {
    var input = $('count');
    if (input) input.addEventListener('input', validateCount);
  }

  // -------------------------------------------------------------------------
  // 表单状态回传（result.html「重新规划」返回时还原）
  // -------------------------------------------------------------------------
  function readAddressState(prefix) {
    return {
      district: $(prefix + '_district').value,
      street: $(prefix + '_street').value,
      community: $(prefix + '_community').value,
      manual: $(prefix + '_manual').value
    };
  }

  function saveFormState() {
    var form = $('plan-form');
    var hikingRadio = form ? form.querySelector('input[name="hiking"]:checked') : null;
    var state = {
      origin: readAddressState('origin'),
      destination: readAddressState('destination'),
      hiking: hikingRadio ? hikingRadio.value : '是',
      mustVisit: mustVisitItems.slice(),
      count: $('count').value
    };
    sessionSet('trip_form_state', JSON.stringify(state));
  }

  function fireChange(sel) {
    try { sel.dispatchEvent(new Event('change')); } catch (e) {}
  }

  function restoreAddress(prefix, st) {
    if (!st) return;
    var districtSel = $(prefix + '_district');
    var streetSel = $(prefix + '_street');
    var communitySel = $(prefix + '_community');
    var manualInput = $(prefix + '_manual');

    if (st.district) {
      districtSel.value = st.district;
      fireChange(districtSel);
      if (st.street) {
        streetSel.value = st.street;
        fireChange(streetSel);
        if (st.community) {
          communitySel.value = st.community;
          fireChange(communitySel);
        }
      }
    }
    if (st.manual) manualInput.value = st.manual;
  }

  function restoreFormState() {
    var raw = sessionGet('trip_form_state');
    if (!raw) return;
    var st;
    try { st = JSON.parse(raw); } catch (e) { return; }
    if (!st) return;

    restoreAddress('origin', st.origin);
    restoreAddress('destination', st.destination);

    if (st.hiking) {
      var radios = document.querySelectorAll('input[name="hiking"]');
      for (var i = 0; i < radios.length; i++) {
        radios[i].checked = (radios[i].value === st.hiking);
      }
    }

    mustVisitItems = (st.mustVisit || []).slice();
    renderChips();

    if (st.count != null && st.count !== '') $('count').value = st.count;
    validateCount();
  }

  // -------------------------------------------------------------------------
  // 高德加载诊断：捕获脚本错误 + 记录 amap.com 资源请求
  // -------------------------------------------------------------------------
  var amapDiagMessages = [];

  function installAMapDiagnostics() {
    if (window.__amapDiagInstalled) return;
    window.__amapDiagInstalled = true;

    // 捕获高德插件脚本的运行时错误（如鉴权失败抛出的 INVALID_* 错误）
    if (window.addEventListener) {
      window.addEventListener('error', function (e) {
        var msg = (e && e.message) ? e.message : '';
        var src = (e && e.filename) ? e.filename : '';
        if (!src && e && e.target && e.target.src) src = e.target.src;
        if (!src && e && e.target && e.target.href) src = e.target.href;
        if (msg || (src && src.indexOf('amap.com') !== -1)) {
          var line = msg || src;
          if (amapDiagMessages.length < 20) amapDiagMessages.push(line);
          console.error('[amap-diag] 捕获脚本错误:', msg, '来源:', src);
        }
      }, true);
    }

    // 捕获高德 SDK 通过 console 输出的鉴权/白名单错误码（如 <AMap JSAPI> Error key! / INVALID_USER_SCODE）
    try {
      if (window.console) {
        var origLog = window.console.log ? window.console.log.bind(window.console) : null;
        var origWarn = window.console.warn ? window.console.warn.bind(window.console) : null;
        var origError = window.console.error ? window.console.error.bind(window.console) : null;

        function captureAmapConsole(args) {
          var text = '';
          try { text = Array.prototype.join.call(args, ' '); } catch (e2) {}
          if (/^\[/.test(text)) return; // 跳过本应用自身日志
          if (/<AMap|INVALID_USER|USERKEY|SCODE|PLAT_NOMATCH|Referer|Error key/i.test(text)) {
            if (amapDiagMessages.length < 20) amapDiagMessages.push(text.slice(0, 200));
          }
        }

        if (origLog) {
          window.console.log = function () {
            captureAmapConsole(arguments);
            return origLog.apply(null, arguments);
          };
        }
        if (origWarn) {
          window.console.warn = function () {
            captureAmapConsole(arguments);
            return origWarn.apply(null, arguments);
          };
        }
        if (origError) {
          window.console.error = function () {
            captureAmapConsole(arguments);
            return origError.apply(null, arguments);
          };
        }
      }
    } catch (e) {}

    // 记录 webapi.amap.com / restapi.amap.com 等资源请求 URL（配合 F12 Network 看状态码）
    if (window.PerformanceObserver) {
      try {
        var po = new PerformanceObserver(function (list) {
          var entries = list.getEntries();
          for (var i = 0; i < entries.length; i++) {
            var name = entries[i].name || '';
            if (name.indexOf('amap.com') !== -1) {
              console.log('[amap-net] 资源请求:', entries[i].initiatorType, name);
            }
          }
        });
        try {
          po.observe({ type: 'resource', buffered: true });
        } catch (e2) {
          try {
            po.observe({ entryTypes: ['resource'] });
          } catch (e3) {}
        }
      } catch (e) {}
    }
  }

  // -------------------------------------------------------------------------
  // 高德 JS SDK 动态加载（含 Geocoder / Walking / Driving / Transfer / PlaceSearch 插件）
  // -------------------------------------------------------------------------
  function loadAMapSDK(key, securityCode) {
    // 官方推荐：先加载基础库，再用 AMap.plugin 显式加载插件，不混用 plugin URL 参数
    var NEEDED = ['AMap.Geocoder', 'AMap.Walking', 'AMap.Driving', 'AMap.Transfer', 'AMap.PlaceSearch'];

    function maskSecret(v) {
      if (!v) return '(空)';
      if (v.length <= 6) return '***';
      return v.slice(0, 3) + '***' + v.slice(-3);
    }
    console.log('[amap-sdk] 使用的 JS Key（脱敏）:', maskSecret(key), '长度:', (key || '').length);
    console.log('[amap-sdk] 使用的安全密钥（脱敏）:', maskSecret(securityCode), '长度:', (securityCode || '').length);

    function ready() {
      if (!window.AMap) return false;
      for (var i = 0; i < NEEDED.length; i++) {
        if (!window.AMap[NEEDED[i]]) return false;
      }
      return true;
    }

    function missingPlugins() {
      var missing = [];
      for (var i = 0; i < NEEDED.length; i++) {
        if (!window.AMap || !window.AMap[NEEDED[i]]) missing.push(NEEDED[i]);
      }
      return missing;
    }

    function pluginFailMessage(extra) {
      var msg = '高德 JS API 插件加载失败';
      if (extra) msg += '，' + extra;
      if (amapDiagMessages.length) {
        msg += '；诊断: ' + amapDiagMessages.slice(-3).join(' | ');
      }
      msg += '。请确认Key为「Web端(JSAPI)」类型、已配置安全密钥，且域名白名单包含当前域名（本地可用、公网不可用通常即域名白名单未配当前域名）';
      return msg;
    }

    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = null;

      function finish(err) {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      }

      if (ready()) { finish(); return; }

      // v2.0 要求：安全密钥必须在 SDK 脚本加载之前注入
      if (securityCode) {
        window._AMapSecurityConfig = { securityJsCode: securityCode };
        console.log('[amap-sdk] 已注入 window._AMapSecurityConfig（在 SDK 加载前）');
      } else {
        console.warn('[amap-sdk] 未提供安全密钥，v2.0 可能鉴权失败');
      }

      var cbName = '_amapReady' + Date.now();
      timer = setTimeout(function () {
        try { delete window[cbName]; } catch (e) {}
        finish(new Error('高德 JS API 加载超时，请检查 JS API Key、安全密钥与网络'));
      }, 20000);

      window[cbName] = function () {
        try {
          delete window[cbName];
        } catch (e) {}
        if (!window.AMap) {
          finish(new Error('高德 JS API 基础库加载失败，请检查 JS API Key 与网络'));
          return;
        }
        if (ready()) { finish(); return; }
        if (!window.AMap.plugin) {
          finish(new Error('高德 JS API 插件接口不可用，请检查 JS API Key 与网络'));
          return;
        }
        try {
          window.AMap.plugin(NEEDED, function () {
            var missing = missingPlugins();
            if (!missing.length) { finish(); return; }
            finish(new Error(pluginFailMessage('缺少插件: ' + missing.join(', '))));
          });
        } catch (e) {
          finish(new Error(pluginFailMessage('AMap.plugin 调用异常: ' + (e && e.message ? e.message : e))));
        }
      };

      var sdkUrl = 'https://webapi.amap.com/maps?v=2.0&key=' + encodeURIComponent(key) +
        '&callback=' + cbName;
      console.log('[amap-sdk] 开始加载基础库:', sdkUrl.replace(/key=[^&]+/, 'key=***'));
      var s = document.createElement('script');
      s.src = sdkUrl;
      s.onerror = function () {
        try { delete window[cbName]; } catch (e) {}
        finish(new Error('高德 JS API 加载失败，请检查 JS API Key 与网络'));
      };
      document.head.appendChild(s);
    });
  }

  function getSelectedAddress(prefix) {
    var parts = [];
    ['district', 'street', 'community'].forEach(function (kind) {
      var sel = $(prefix + '_' + kind);
      if (sel && !sel.disabled && sel.value) parts.push(sel.value);
    });
    return parts.join('');
  }

  // -------------------------------------------------------------------------
  // 表单提交
  // -------------------------------------------------------------------------
  function bindForm() {
    var form = $('plan-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      showError('');

      var jsKey = ($('amap_js_api_key').value || '').trim();
      var securityCode = ($('amap_js_security_code').value || '').trim();
      var saveBox = $('save_keys');

      // 记忆 Key 与安全密钥：会话始终记住；勾选「保存到本机」时写入 localStorage
      if (jsKey) {
        sessionSet('amap_js_api_key', jsKey);
        if (saveBox && saveBox.checked) storageSet('amap_js_api_key', jsKey);
        else storageRemove('amap_js_api_key');
      } else {
        sessionRemove('amap_js_api_key');
        storageRemove('amap_js_api_key');
      }
      if (securityCode) {
        sessionSet('amap_js_security_code', securityCode);
        if (saveBox && saveBox.checked) storageSet('amap_js_security_code', securityCode);
        else storageRemove('amap_js_security_code');
      } else {
        sessionRemove('amap_js_security_code');
        storageRemove('amap_js_security_code');
      }

      // 地址：下拉选中则拼接「区+街道+社区」完整地址；未选中才读手动输入
      var origin = '';
      var destination = '';
      ['origin', 'destination'].forEach(function (prefix) {
        var selected = getSelectedAddress(prefix);
        var manual = ($(prefix + '_manual').value || '').trim();
        var val = selected || manual;
        console.log('[main] ' + prefix + ' 提交地址:', val);
        if (prefix === 'origin') origin = val;
        else destination = val;
      });

      // 基础校验（等价原后端 /plan）
      if (!origin || !destination) {
        showError('请填写出发地址和返回地址');
        return;
      }
      var hikingRadio = form.querySelector('input[name="hiking"]:checked');
      var hiking = hikingRadio ? (hikingRadio.value === '是') : true;
      if (!validateCount()) {
        $('count').focus();
        return;
      }
      var count = parseInt(($('count').value || '').trim(), 10);
      var mustVisit = mustVisitItems.slice();

      // SDK 需要 JS API Key + 安全密钥
      var sdkKey = jsKey;
      if (!sdkKey || !securityCode) {
        showError('请填写高德JS API Key 和安全密钥');
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');

      function resetSubmitBtn() {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '生成路线'; }
      }

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '规划中…'; }
      console.log('[main] 开始加载高德 SDK 并规划');

      loadAMapSDK(sdkKey, securityCode).then(function () {
        console.log('[main] 高德 SDK 加载完成，开始 TripEngine.planTrip');
        return window.TripEngine.planTrip(origin, destination, hiking, mustVisit, count, sdkKey);
      }).then(function (plan) {
        console.log('[main] 规划成功，写入 sessionStorage 并跳转');
        saveFormState();
        try {
          sessionStorage.setItem('trip_plan_result', JSON.stringify(plan));
        } catch (err) {
          resetSubmitBtn();
          alert('浏览器本地存储不可用，无法传递结果：' + (err && err.message ? err.message : err));
          return;
        }
        window.location.href = 'result.html';
      }).catch(function (err) {
        console.error('[main] 规划失败', err);
        resetSubmitBtn();
        alert(err && err.message ? err.message : String(err));
      });
    });
  }

  // -------------------------------------------------------------------------
  // 启动
  // -------------------------------------------------------------------------
  function init() {
    installAMapDiagnostics();
    initKeys();
    if (window.TripEngine) initAddressSelectors();
    initMustVisit();
    initCount();
    bindForm();
    restoreFormState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
