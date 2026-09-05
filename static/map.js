// 小区位置：按需加载高德地图，在站内弹窗中展示。
(function () {
  "use strict";
  var sdkPromise = null;

  function loadMapSdk() {
    if (window.AMap && window.AMap.Map) return Promise.resolve(window.AMap);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      var script = null;
      var controller = new AbortController();
      var finished = false;
      var timer = setTimeout(function () { finish(new Error("地图加载超时，请稍后重试")); }, 15000);
      function finish(error) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        controller.abort();
        delete window.houseAmapReady;
        if (error) {
          if (script) script.remove();
          reject(error);
        } else {
          resolve(window.AMap);
        }
      }
      fetch("/api/map-config", {
        headers: { "X-Site-Password": HouseApp.getPassword() },
        signal: controller.signal
      }).then(function (response) {
        if (!response.ok) throw new Error("无法加载地图配置，请刷新页面重试");
        return response.json();
      }).then(function (config) {
        if (finished) return;
        if (!config.key) throw new Error("地图暂未配置，可点击下方链接查看位置");
        window._AMapSecurityConfig = { securityJsCode: config.securityJsCode || "" };
        window.houseAmapReady = function () {
          finish(window.AMap && window.AMap.Map ? null : new Error("地图加载失败，请稍后重试"));
        };
        script = document.createElement("script");
        script.src = "https://webapi.amap.com/maps?v=2.0&key=" + encodeURIComponent(config.key) + "&callback=houseAmapReady";
        script.async = true;
        script.onerror = function () { finish(new Error("地图加载失败，请检查网络后重试")); };
        document.head.appendChild(script);
      }).catch(finish);
    }).catch(function (error) {
      sdkPromise = null;
      throw error;
    });
    return sdkPromise;
  }

  HouseApp.openMap = function (house) {
    var url = HouseApp.amapUrl(house);
    if (!url || document.querySelector(".map-dialog")) return;
    var dialog = document.createElement("dialog");
    dialog.className = "map-dialog";
    dialog.setAttribute("aria-labelledby", "map-title");
    dialog.innerHTML = '<div class="map-panel">' +
      '<div class="detail-head"><div><h3 id="map-title"></h3><p class="map-address"></p></div>' +
      '<button type="button" class="close" data-map-close autofocus>关闭 ✕</button></div>' +
      '<div class="map-stage"><div class="map-canvas" aria-label="小区位置地图"></div>' +
      '<div class="map-status" role="status"><span>正在加载地图…</span>' +
      '<button type="button" class="icon-btn" data-map-retry hidden>重新加载</button></div></div>' +
      '<div class="map-footer"><span class="map-coordinates"></span>' +
      '<a class="icon-btn map-btn" target="_blank" rel="noopener noreferrer">在高德地图中打开 ↗</a></div></div>';
    dialog.querySelector("#map-title").textContent = house.name;
    dialog.querySelector(".map-address").textContent = house.location || "小区位置";
    dialog.querySelector(".map-coordinates").textContent = "经度 " + house.longitude + " · 纬度 " + house.latitude;
    dialog.querySelector("a").href = url;
    var canvas = dialog.querySelector(".map-canvas");
    var status = dialog.querySelector(".map-status");
    var retry = dialog.querySelector("[data-map-retry]");
    var map = null;
    var timer = null;
    var attempt = 0;
    var previousFocus = document.activeElement;
    var hadScrollLock = document.body.classList.contains("no-scroll");
    document.body.appendChild(dialog);
    dialog.showModal();
    document.body.classList.add("no-scroll");

    function fail(message) {
      clearTimeout(timer);
      status.hidden = false;
      status.querySelector("span").textContent = message;
      retry.hidden = false;
    }
    function start() {
      var current = ++attempt;
      if (map) { map.destroy(); map = null; }
      clearTimeout(timer);
      canvas.replaceChildren();
      status.hidden = false;
      status.querySelector("span").textContent = "正在加载地图…";
      retry.hidden = true;
      loadMapSdk().then(function (AMap) {
        if (!dialog.open || current !== attempt) return;
        var position = [Number(house.longitude), Number(house.latitude)];
        map = new AMap.Map(canvas, { center: position, zoom: 16, viewMode: "2D", resizeEnable: true });
        timer = setTimeout(function () {
          if (current === attempt && dialog.open) fail("地图暂时无法显示，请重试或在高德地图中打开");
        }, 15000);
        map.on("complete", function () {
          if (current !== attempt || !dialog.open) return;
          clearTimeout(timer);
          status.hidden = true;
        });
        map.on("error", function () {
          if (current === attempt && dialog.open) fail("地图加载失败，可重试或在高德地图中打开");
        });
        var marker = new AMap.Marker({ position: position, title: house.name });
        map.add(marker);
        marker.setLabel({ direction: "top", content: '<span>' + HouseApp.esc(house.name) + '</span>' });
      }).catch(function (error) {
        if (current === attempt && dialog.open) fail(error.message || "地图加载失败，请重试");
      });
    }
    dialog.querySelector("[data-map-close]").addEventListener("click", function () { dialog.close(); });
    dialog.addEventListener("click", function (event) { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("close", function () {
      ++attempt;
      clearTimeout(timer);
      if (map) map.destroy();
      dialog.remove();
      if (!hadScrollLock) document.body.classList.remove("no-scroll");
      if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    });
    retry.addEventListener("click", start);
    start();
  };
})();
