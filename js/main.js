/*!
 * main.js —— 规划输入页交互逻辑（纯前端版）。
 *
 * 职责：
 *   1. 用内嵌的 DISTRICT_STREET_COMMUNITY 填充三级联动地址选择器；
 *   2. 管理 amap_key（Web 服务）与 amap_js_api_key（JS API）的 localStorage/sessionStorage 回填；
 *   3. 动态加载高德 JS API 1.4.15（含 Geocoder / Walking / Driving 插件）；
 *   4. 拦截表单提交，浏览器本地执行 TripEngine.planTrip()，结果写入 sessionStorage 后跳转 result.html。
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
  // 高德 Key：amap_key（Web 服务） + amap_js_api_key（JS API）
  // 保留原跨页同步回填逻辑：localStorage 优先，sessionStorage 兜底
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
    var webInput = $('amap_key');
    var jsInput = $('amap_js_api_key');
    var saveBox = $('save_keys');

    function renderHint() {
      var saved = !!(storageGet('amap_key') || storageGet('amap_js_api_key'));
      var hint = $('keys_hint');
      if (hint) hint.style.display = saved ? 'block' : 'none';
      if (saveBox) saveBox.checked = saved;
    }

    // 回填
    var webLocal = storageGet('amap_key');
    var webSession = sessionGet('amap_key');
    if (webInput) webInput.value = webLocal || webSession || '';

    var jsLocal = storageGet('amap_js_api_key') || storageGet('amap_key');
    var jsSession = sessionGet('amap_js_api_key') || sessionGet('amap_key');
    if (jsInput) jsInput.value = jsLocal || jsSession || '';

    renderHint();

    if ($('keys_clear')) {
      $('keys_clear').addEventListener('click', function () {
        storageRemove('amap_key');
        storageRemove('amap_js_api_key');
        sessionRemove('amap_key');
        sessionRemove('amap_js_api_key');
        if (webInput) webInput.value = '';
        if (jsInput) jsInput.value = '';
        renderHint();
      });
    }

    if (saveBox) {
      saveBox.addEventListener('change', function () {
        if (!saveBox.checked) {
          storageRemove('amap_key');
          storageRemove('amap_js_api_key');
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

    function getSelectedCommunity(prefix) {
      var sel = $(prefix + '_community');
      return (!sel.disabled && sel.value) ? sel.value : '';
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
  // 高德 JS SDK 动态加载（含 Geocoder / Walking / Driving 插件）
  // -------------------------------------------------------------------------
  function loadAMapSDK(key) {
    return new Promise(function (resolve, reject) {
      if (window.AMap && window.AMap.Geocoder && window.AMap.Walking && window.AMap.Driving) {
        resolve();
        return;
      }
      var cbName = '_amapReady' + Date.now();
      window[cbName] = function () {
        try {
          delete window[cbName];
        } catch (e) {}
        if (window.AMap && window.AMap.Geocoder && window.AMap.Walking && window.AMap.Driving) {
          resolve();
        } else {
          reject(new Error('高德 JS API 插件加载失败'));
        }
      };
      var s = document.createElement('script');
      s.src = 'https://webapi.amap.com/maps?v=1.4.15&key=' + encodeURIComponent(key) +
        '&callback=' + cbName + '&plugin=AMap.Geocoder,AMap.Walking,AMap.Driving';
      s.onerror = function () {
        try { delete window[cbName]; } catch (e) {}
        reject(new Error('高德 JS API 加载失败，请检查 JS API Key 与网络'));
      };
      document.head.appendChild(s);
    });
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

      var webKey = ($('amap_key').value || '').trim();
      var jsKey = ($('amap_js_api_key').value || '').trim();
      var saveBox = $('save_keys');

      // 记忆 Key：会话始终记住；勾选「保存到本机」时写入 localStorage
      if (webKey) {
        sessionSet('amap_key', webKey);
        if (saveBox && saveBox.checked) storageSet('amap_key', webKey);
        else storageRemove('amap_key');
      } else {
        sessionRemove('amap_key');
        storageRemove('amap_key');
      }
      if (jsKey) {
        sessionSet('amap_js_api_key', jsKey);
        if (saveBox && saveBox.checked) storageSet('amap_js_api_key', jsKey);
        else storageRemove('amap_js_api_key');
      } else {
        sessionRemove('amap_js_api_key');
        storageRemove('amap_js_api_key');
      }

      // 地址：下拉选中小区优先；未选中才读手动输入
      var origin = '';
      var destination = '';
      ['origin', 'destination'].forEach(function (prefix) {
        var community = getCommunity(prefix);
        var manual = ($(prefix + '_manual').value || '').trim();
        var val = community || manual;
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
      var countRaw = ($('count').value || '').trim();
      var count = parseInt(countRaw, 10);
      if (isNaN(count) || count < 1 || count > 6) {
        showError('游玩景点数量必须在 1-6 之间');
        return;
      }
      var mustVisit = [];
      var mustInputs = form.querySelectorAll('input[name="must_visit"]');
      for (var i = 0; i < mustInputs.length; i++) {
        var v = (mustInputs[i].value || '').trim();
        if (v) mustVisit.push(v);
      }

      // SDK 需要 JS API Key；未填则回退到 Web 服务 Key
      var sdkKey = jsKey || webKey;
      if (!sdkKey) {
        showError('请先填写高德 JS API Key');
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '规划中…'; }

      loadAMapSDK(sdkKey).then(function () {
        return window.TripEngine.planTrip(origin, destination, hiking, mustVisit, count, sdkKey, webKey);
      }).then(function (plan) {
        try {
          sessionStorage.setItem('trip_plan_result', JSON.stringify(plan));
        } catch (err) {
          // 存储不可用时给出明确提示
          showError('浏览器本地存储不可用，无法传递结果：' + (err && err.message ? err.message : err));
          return;
        }
        window.location.href = 'result.html';
      }).catch(function (err) {
        showError(err && err.message ? err.message : String(err));
      }).then(function () {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '生成路线'; }
      });
    });
  }

  function getCommunity(prefix) {
    var sel = $(prefix + '_community');
    return (!sel.disabled && sel.value) ? sel.value : '';
  }

  // -------------------------------------------------------------------------
  // 启动
  // -------------------------------------------------------------------------
  function init() {
    initKeys();
    if (window.TripEngine) initAddressSelectors();
    bindForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
